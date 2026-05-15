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

const SYSTEM_PROMPT = [
  "Du bist ein erfahrener Feuerwehr-Ausbilder der Freiwilligen Feuerwehr Grammetal (Thueringen).",
  "Fuehre einen Kamerad durch ein taktisches Einsatz-Szenario. Antworte immer auf Deutsch.",
  "Bleibe ausschliesslich beim Thema Feuerwehr-Ausbildung.",
  "",
  "ABLAUF (ca. 5-8 Schritte):",
  "1. Beschreibe die Alarmierungsmeldung (nutze das gegebene Szenario)",
  "2. Stelle eine konkrete Frage zum ersten Handlungsschritt",
  "3. Bewerte die Antwort, stelle die naechste Situation vor",
  "4. Nach dem letzten Schritt: Gesamtbewertung",
  "",
  "ANTWORTFORMAT (IMMER exakt einhalten, Emojis nicht weglassen):",
  "✅ RICHTIG: [Was korrekt war]",
  "❌ FEHLT: [Was fehlte oder falsch war]",
  "📖 VORSCHRIFT: [FwDV-Referenz]",
  "▶ SITUATION: [Naechste Einsatzsituation und Frage]",
  "",
  "Regeln:",
  "- Beim ersten Schritt NUR: ▶ SITUATION mit Alarmierungsmeldung und erster Frage",
  "- ✅ RICHTIG und ▶ SITUATION sind immer Pflicht",
  "- ❌ FEHLT und 📖 VORSCHRIFT nur wenn etwas fehlte",
  "- Beim letzten Schritt: 🏁 UEBUNG BEENDET: [Note A/B/C/D und Zusammenfassung]",
].join("\n");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) {
      return json({ error: "OPENROUTER_API_KEY nicht konfiguriert" });
    }

    const body = await req.json();
    const { nachrichten, szenario } = body as {
      nachrichten: Array<{ role: string; content: string }>;
      szenario?: string;
    };

    if (!nachrichten || !Array.isArray(nachrichten)) {
      return json({ error: "nachrichten fehlt oder ungueltig" });
    }

    // Regelwerke aus Supabase laden (falls vorhanden)
    let regelwerkeText = "";
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
          regelwerkeText = "\n\n=== OFFIZIELLE REGELWERKE (massgeblich fuer Bewertung) ===\n";
          for (const r of rw) {
            const text = (r.inhalt_text ?? "").slice(0, 2000);
            regelwerkeText += "\n--- " + r.titel + " ---\n" + text + "\n";
          }
          regelwerkeText += "\n=== ENDE REGELWERKE ===\n";
          regelwerkeText += "Bewerte AUSSCHLIESSLICH nach den obigen Regelwerken. ";
          regelwerkeText += "Das integrierte Basiswissen ist nur Fallback wenn kein Regelwerk passt.\n";
        }
      }
    } catch (rwErr) {
      console.warn("Regelwerke konnten nicht geladen werden:", rwErr);
    }

    const systemPrompt = SYSTEM_PROMPT + regelwerkeText +
      (szenario ? "\n\nAKTUELLES SZENARIO:\n" + szenario : "");

    // Nachrichten fuer Groq (OpenAI-kompatibles Format)
    // Nur die letzten 6 Nachrichten senden um Token-Limit einzuhalten
    const letzteNachrichten = nachrichten.slice(-6);
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
      ...letzteNachrichten.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        // KI-Antworten auf 800 Zeichen kuerzen um Tokens zu sparen
        content: m.role === "assistant" ? m.content.slice(0, 800) : m.content,
      })),
    ];

    // Sicherstellen dass mindestens eine User-Nachricht vorhanden
    if (messages.length === 1) {
      messages.push({ role: "user", content: "Starte das Szenario." });
    }

    const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
        "HTTP-Referer": "https://feuerwehr-grammetal.vercel.app",
        "X-Title": "Feuerwehr Grammetal KI-Ausbilder",
      },
      body: JSON.stringify({
        model: "google/gemma-4-31b:free",
        messages,
        temperature: 0.65,
        max_tokens: 700,
        top_p: 0.9,
      }),
    });

    if (!orRes.ok) {
      const err = await orRes.text();
      console.error("OpenRouter Fehler:", orRes.status, err);
      return json({ error: "KI-Fehler " + orRes.status + ": " + err.slice(0, 200) });
    }

    const orData = await orRes.json();
    const antwort = orData?.choices?.[0]?.message?.content ?? "";

    if (!antwort) {
      console.error("Leere Antwort von OpenRouter:", JSON.stringify(orData));
      return json({ error: "Keine Antwort von der KI erhalten." });
    }

    return json({ antwort });
  } catch (err) {
    console.error("Fehler:", err);
    return json({ error: "Interner Fehler: " + String(err) });
  }
});
