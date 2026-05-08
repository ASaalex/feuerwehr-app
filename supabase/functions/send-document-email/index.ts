import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { Buffer } from "node:buffer";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { wehr_id, dokument_id, datei_inhalt, datei_name, titel } = body;

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

    if (!cfg.smtp_user) {
      throw new Error("Gmail-Adresse nicht konfiguriert. Bitte in Administration → Einstellungen hinterlegen.");
    }
    if (!cfg.smtp_pass) {
      throw new Error("App-Passwort nicht konfiguriert. Bitte in Administration → Einstellungen hinterlegen.");
    }

    // Wache & Drucker-E-Mail
    const { data: wehr, error: wErr } = await supabase
      .from("wehren")
      .select("name, drucker_email")
      .eq("id", wehr_id)
      .single();

    if (wErr || !wehr) throw new Error("Wache nicht gefunden");
    if (!wehr.drucker_email) {
      throw new Error(`Keine Drucker-E-Mail fuer Wache "${wehr.name}". Bitte in Wachen-Verwaltung eintragen.`);
    }

    // Anhang ermitteln
    let anhangBase64: string;
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

      const buffer = Buffer.from(await fileBlob.arrayBuffer());
      anhangBase64 = buffer.toString("base64");
      anhangName = dok.datei_name;
      betreff = `Druck: ${dok.titel}`;
      const ext = dok.datei_name.split(".").pop()?.toLowerCase();
      mimeType = ext === "pdf" ? "application/pdf" : "application/octet-stream";
    } else {
      anhangBase64 = datei_inhalt; // bereits base64
      anhangName = datei_name ?? "Dokument.pdf";
      betreff = `Druck: ${titel ?? anhangName}`;
      const ext = anhangName.split(".").pop()?.toLowerCase();
      mimeType = ext === "pdf" ? "application/pdf" : ext === "html" ? "text/html" : "application/octet-stream";
    }

    // Gmail SMTP (Port 465, direktes SSL)
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: {
          username: cfg.smtp_user,
          password: cfg.smtp_pass,
        },
      },
    });

    await client.send({
      from: `Feuerwehr App <${cfg.smtp_user}>`,
      to: wehr.drucker_email,
      subject: betreff,
      content: `Dokument zum Drucken: ${betreff}\n\nGesendet von der Feuerwehr-App.`,
      attachments: [
        {
          encoding: "base64",
          mimeType,
          filename: anhangName,
          content: anhangBase64,
        },
      ],
    });

    await client.close();

    return json({ success: true, message: `Gesendet an ${wehr.drucker_email}` });
  } catch (err) {
    console.error("mail-drucker error:", err);
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
