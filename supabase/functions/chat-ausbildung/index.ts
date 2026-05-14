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
  "RICHTIG: [Was korrekt war]",
  "FEHLT: [Was fehlte oder falsch war]",
  "VORSCHRIFT: [FwDV-Referenz]",
  "SITUATION: [Naechste Einsatzsituation und Frage]",
  "",
  "Regeln:",
  "- Beim ersten Schritt NUR: SITUATION mit Alarmierungsmeldung und erster Frage",
  "- RICHTIG und SITUATION sind immer Pflicht",
  "- FEHLT und VORSCHRIFT nur wenn etwas fehlte",
  "- Beim letzten Schritt: UEBUNG BEENDET: [Note A/B/C/D und Zusammenfassung]",
  "",
  "WICHTIG: Verwende die Emojis genau so:",
  "- Richtige Antworten mit: Emoji Haeckchen (gruen)",
  "- Fehlende Punkte mit: Emoji X (rot)",
  "- Vorschriften mit: Emoji Buch",
  "- Naechste Situation mit: Emoji Dreieck (rechts)",
  "- Uebungsende mit: Emoji Zielflagge",
  "",
  "REGELWERKE:",
  "",
  "FwDV 1 - Grundtaetigkeiten:",
  "- Loeschangriff: Angriffstrupp geht vor, Wassertrupp sichert Wasserversorgung, Schlauchtrupp verlegt B-Leitung",
  "- Atemschutzeinsatz: mind. 2 AGT gleichzeitig, Sicherheitstrupp bereitstellen",
  "- PA IMMER vor der Rauchgrenze anlegen",
  "",
  "FwDV 3 - Einheiten im Loescheinsatz:",
  "- Staffel (1/5): GF + AT (2) + WT (2)",
  "- Gruppe (1/8): GF + MA + AT (2) + WT (2) + SchT (2) + Melder",
  "- Schema Gruppe: Erkundung -> Wasserversorgung -> Rettung -> Loeschangriff",
  "",
  "FwDV 7 - Atemschutz:",
  "- Atemschutzberwachung: Pflicht vor Einsatz",
  "- Sicherheitstrupp: vollstaendig ausgeruestet VOR dem Gebaeude",
  "- PA voll (>270 bar), Dichtigkeitstest, Eintrag vollstaendig",
  "",
  "FwDV 100 - Fuehrung und Leitung:",
  "- Fuehrungsvorgang: Lagefeststellung -> Planung -> Befehlsgebung -> Einsatzdurchfuehrung -> Kontrolle",
  "- Lage erkunden VOR dem Angriff (mind. 3 Seiten eines Gebaeudes)",
  "",
  "Verkehrsunfall:",
  "- Eigenschutz: Warnweste BEVOR das Fahrzeug verlassen wird",
  "- Absicherung: Warndreieck 100m innerorts / 200m ausserorts, FW-Fahrzeug als Schutzwall",
  "- Motor aus, Zuendschluessel abziehen (Airbag-Risiko)",
  "- Patientensicherung: HWS stabilisieren BEVOR Bewegung",
  "",
  "Gefahrgut:",
  "- Warntafel lesen: Gefahrnummer oben (1203=Kraftstoff), UN-Nummer unten",
  "- Immer von der Windseite annaehern",
  "- Sicherheitsabstand: mind. 50m",
  "",
  "Waldbrand:",
  "- Immer rueckwaertig/seitlich zum Feuer angreifen",
  "- Pendelverkehr wenn kein Hydrant",
  "- Keine frontale Bekaempfung bei Wind",
  "",
  "ThuerBKG (Thueringen):",
  "- Par. 1: Brandschutz ist Pflichtaufgabe der Gemeinden",
  "- Par. 3: Freiwillige Feuerwehren sind Regelform unter 100.000 Einwohner",
  "- Par. 19: Einsatzleitung beim Wehrleiter",
  "- Grammetal: Landkreis Weimarer Land, Ortswehren: Nohra, Isseroda, Dobritschen, Obergrunstedt",
].join("\n");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return json({ error: "GEMINI_API_KEY nicht konfiguriert" });
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
            // Max. 8000 Zeichen pro Dokument um Kontext nicht zu sprengen
            const text = (r.inhalt_text ?? "").slice(0, 8000);
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

    const contents = nachrichten.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    if (contents.length === 0 || contents[0].role !== "user") {
      contents.unshift({
        role: "user",
        parts: [{ text: "Starte das Szenario." }],
      });
    }

    const geminiUrl =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + apiKey;

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents,
        generationConfig: {
          temperature: 0.65,
          maxOutputTokens: 1200,
          topP: 0.9,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ],
      }),
    });

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error("Gemini Fehler:", geminiRes.status, err);
      return json({ error: "Gemini API Fehler " + geminiRes.status + ": " + err.slice(0, 200) });
    }

    const geminiData = await geminiRes.json();
    const antwort = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!antwort) {
      const blockReason = geminiData?.promptFeedback?.blockReason ?? "unbekannt";
      console.error("Leere Antwort:", blockReason);
      return json({ error: "Keine Antwort von Gemini. Grund: " + blockReason });
    }

    return json({ antwort });
  } catch (err) {
    console.error("Fehler:", err);
    return json({ error: "Interner Fehler: " + String(err) });
  }
});
