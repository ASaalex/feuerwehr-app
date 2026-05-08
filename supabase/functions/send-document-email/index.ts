import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Buffer } from "node:buffer";
import nodemailer from "https://esm.sh/nodemailer@6.9.9";
import { PDFDocument, Duplex } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Bettet Duplex-Druckpräferenz in ein PDF ein (DuplexFlipLongEdge = Hochformat beidseitig) */
async function addDuplexPreference(pdfBytes: Buffer): Promise<Buffer> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const viewerPrefs = pdfDoc.getOrCreateViewerPreferences();
    viewerPrefs.setDuplex(Duplex.DuplexFlipLongEdge);
    const modified = await pdfDoc.save();
    return Buffer.from(modified);
  } catch (e) {
    // Im Fehlerfall Original-PDF verwenden
    console.warn("Duplex-Präferenz konnte nicht gesetzt werden:", e);
    return pdfBytes;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { wehr_id, dokument_id, datei_inhalt, datei_name, titel, email_feld } = body;
    // email_feld: 'drucker_email' (Standard) | 'einsatzbericht_email'
    const zielFeld = email_feld === 'einsatzbericht_email' ? 'einsatzbericht_email' : 'drucker_email';

    if (!wehr_id) throw new Error("wehr_id ist erforderlich");
    if (!dokument_id && !datei_inhalt) throw new Error("dokument_id oder datei_inhalt ist erforderlich");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Einstellungen laden
    const { data: einstellungen, error: eErr } = await supabase
      .from("system_einstellungen")
      .select("schluessel, wert");

    if (eErr) throw new Error("Einstellungen: " + eErr.message);

    const cfg: Record<string, string> = {};
    for (const e of (einstellungen ?? [])) cfg[e.schluessel] = e.wert;

    if (!cfg.smtp_user) throw new Error("Gmail-Adresse nicht konfiguriert. Bitte in Administration → Einstellungen hinterlegen.");
    if (!cfg.smtp_pass) throw new Error("App-Passwort nicht konfiguriert. Bitte in Administration → Einstellungen hinterlegen.");

    // Wache & Drucker-E-Mail
    const { data: wehr, error: wErr } = await supabase
      .from("wehren")
      .select("name, drucker_email, einsatzbericht_email")
      .eq("id", wehr_id)
      .single();

    if (wErr || !wehr) throw new Error("Wache nicht gefunden");
    const zielEmail = wehr[zielFeld as keyof typeof wehr] as string | null;
    const feldLabel = zielFeld === 'einsatzbericht_email' ? 'Einsatzbericht-E-Mail' : 'Drucker-E-Mail';
    if (!zielEmail) throw new Error(`Keine ${feldLabel} fuer Wache "${wehr.name}". Bitte in Wachen-Verwaltung eintragen.`);

    // Anhang ermitteln
    let anhangBuffer: Buffer;
    let anhangName: string;
    let betreff: string;
    let mimeType: string;

    if (dokument_id) {
      const { data: dok, error: dErr } = await supabase
        .from("dokumente")
        .select("titel, datei_pfad, datei_name")
        .eq("id", dokument_id)
        .single();

      if (dErr || !dok) throw new Error("Dokument nicht gefunden");

      const { data: fileBlob, error: fErr } = await supabase.storage
        .from("dokumente")
        .download(dok.datei_pfad);

      if (fErr || !fileBlob) throw new Error("Datei nicht ladbar: " + fErr?.message);

      anhangBuffer = Buffer.from(await fileBlob.arrayBuffer());
      anhangName = dok.datei_name;
      betreff = `Druck: ${dok.titel}`;
      const ext = dok.datei_name.split(".").pop()?.toLowerCase();
      mimeType = ext === "pdf" ? "application/pdf" : "application/octet-stream";
    } else {
      // base64 → echte Bytes (kein Re-Encoding)
      anhangBuffer = Buffer.from(datei_inhalt, "base64");
      anhangName = datei_name ?? "Dokument.pdf";
      betreff = `Druck: ${titel ?? anhangName}`;
      const ext = anhangName.split(".").pop()?.toLowerCase();
      mimeType = ext === "pdf" ? "application/pdf" : "text/html";
    }

    // Duplex-Präferenz in PDF einbetten (nur bei PDF-Dateien)
    if (mimeType === "application/pdf") {
      anhangBuffer = await addDuplexPreference(anhangBuffer);
    }

    // Gmail SMTP via nodemailer (Port 465, SSL)
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: cfg.smtp_user,
        pass: cfg.smtp_pass,
      },
    });

    await transporter.sendMail({
      from: `Feuerwehr App <${cfg.smtp_user}>`,
      to: zielEmail,
      subject: betreff,
      text: `Dokument zum Drucken: ${betreff}\n\nGesendet von der Feuerwehr-App.`,
      attachments: [
        {
          filename: anhangName,
          content: anhangBuffer,
          contentType: mimeType,
        },
      ],
    });

    return json({ success: true, message: `Gesendet an ${zielEmail}` });
  } catch (err) {
    console.error("mail-drucker error:", err);
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
