import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json({ error: "ANTHROPIC_API_KEY nicht konfiguriert" });
    }

    const body = await req.json();
    const { nachrichten, szenario } = body as {
      nachrichten: Array<{ role: string; content: string }>;
      szenario?: string;
    };

    if (!nachrichten || !Array.isArray(nachrichten)) {
      return json({ error: "nachrichten fehlt oder ungueltig" });
    }

    // Regelwerke aus Supabase laden
    let regelwerkeText = "";
    let regelwerkeGeladen = false;
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && supabaseKey) {
        const sb = createClient(supabaseUrl, supabaseKey);
        const { data: rw } = await sb
          .from("regelwerke")
          .select("titel, inhalt_text")
          .eq("aktiv", true)
          .not("inhalt_text", "is", null);
        if (rw && rw.length > 0) {
          regelwerkeGeladen = true;
          regelwerkeText = "\n\n=== DIENSTVORSCHRIFTEN (einzige Grundlage fuer Bewertung) ===\n";
          for (const r of rw) {
            const text = (r.inhalt_text ?? "").slice(0, 6000);
            regelwerkeText += "\n--- " + r.titel + " ---\n" + text + "\n";
          }
          regelwerkeText += "\n=== ENDE DIENSTVORSCHRIFTEN ===\n";
        }
      }
    } catch (rwErr) {
      console.warn("Regelwerke konnten nicht geladen werden:", rwErr);
    }

    const systemPrompt = [
      "Du bist ein erfahrener Feuerwehr-Ausbilder der Freiwilligen Feuerwehr Grammetal (Thueringen).",
      "Fuehre einen Kamerad durch ein taktisches Einsatz-Szenario. Antworte immer auf Deutsch.",
      "Bleibe ausschliesslich beim Thema Feuerwehr-Ausbildung.",
      "",
      regelwerkeGeladen
        ? "WICHTIG: Bewerte und erklaere AUSSCHLIESSLICH nach den unten bereitgestellten Dienstvorschriften. Erfinde keine Paragraphen, Abschnitte oder Regeln die nicht darin stehen. Wenn etwas nicht in den Vorschriften steht, erwaehne es nicht."
        : "WICHTIG: Es wurden keine Dienstvorschriften hinterlegt. Teile dem Kamerad mit, dass der Administrator zuerst die offiziellen PDFs (FwDV, ThuerBKG) unter Administration -> Regelwerke hochladen muss, bevor Uebungen bewertet werden koennen.",
      "",
      "ABLAUF (ca. 5-8 Schritte):",
      "1. Alarmierungsmeldung beschreiben (Szenario nutzen)",
      "2. Konkrete Frage zum naechsten Handlungsschritt stellen",
      "3. Antwort bewerten und naechste Situation beschreiben",
      "4. Nach letztem Schritt: Gesamtbewertung mit Note",
      "",
      "ANTWORTFORMAT (exakt einhalten, Emojis nicht weglassen):",
      "✅ RICHTIG: [Was korrekt war]",
      "❌ FEHLT: [Was fehlte oder falsch war]",
      "📖 VORSCHRIFT: [Exakter Titel des Dokuments aus den Dienstvorschriften]",
      "▶ SITUATION: [Naechste Einsatzsituation und Frage]",
      "",
      "Regeln:",
      "- Erster Schritt NUR: ▶ SITUATION mit Alarmierung und erster Frage",
      "- ✅ RICHTIG und ▶ SITUATION sind immer Pflicht",
      "- ❌ FEHLT und 📖 VORSCHRIFT nur wenn etwas fehlte",
      "- Letzter Schritt: 🏁 UEBUNG BEENDET: [Note A/B/C/D und Zusammenfassung]",
      regelwerkeText,
      szenario ? "\n\nAKTUELLES SZENARIO:\n" + szenario : "",
    ].join("\n");

    // Nachrichten aufbereiten (letzte 10, init-Nachricht herausfiltern)
    const letzteNachrichten = nachrichten
      .filter(m => !(m.role === "user" && m.content === "Starte das Szenario. Beschreibe die Alarmierungsmeldung."))
      .slice(-10);

    // Anthropic erwartet abwechselnde user/assistant Rollen
    // und dass die erste Nachricht user ist
    const messages = letzteNachrichten.map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    if (messages.length === 0 || messages[0].role !== "user") {
      messages.unshift({ role: "user", content: "Starte das Szenario." });
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      console.error("Anthropic Fehler:", anthropicRes.status, err);
      return json({ error: "KI-Fehler " + anthropicRes.status + ": " + err.slice(0, 200) });
    }

    const anthropicData = await anthropicRes.json();
    const antwort = anthropicData?.content?.[0]?.text ?? "";

    if (!antwort) {
      console.error("Leere Antwort von Anthropic:", JSON.stringify(anthropicData));
      return json({ error: "Keine Antwort von der KI erhalten." });
    }

    return json({ antwort });
  } catch (err) {
    console.error("Fehler:", err);
    return json({ error: "Interner Fehler: " + String(err) });
  }
});
