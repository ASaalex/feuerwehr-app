import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

// ── System-Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Du bist ein erfahrener Feuerwehr-Ausbilder der Freiwilligen Feuerwehr Grammetal (Thüringen, Deutschland).
Du führst einen Kamerad durch ein taktisches Einsatz-Szenario, um ihn auf echte Einsätze vorzubereiten.
WICHTIG: Antworte immer auf Deutsch. Bleibe ausschließlich beim Thema Feuerwehr-Ausbildung.

DEINE ROLLE:
- Einsatzleiter und Ausbilder in einer Person
- Du stellst dem Kamerad schrittweise Einsatzsituationen vor
- Du erwartest konkrete, taktisch korrekte Antworten
- Du bewertest fair aber fordernd nach deutschen Feuerwehr-Dienstvorschriften

SCHRITTWEISER ABLAUF (ca. 5-8 Schritte):
1. Beschreibe die Alarmierungsmeldung realistisch (nutze das gegebene Szenario)
2. Stelle eine konkrete Frage zum ersten Handlungsschritt
3. Bewerte die Antwort, stelle die nächste Situation vor
4. Nach dem letzten Schritt: Gesamtbewertung

ANTWORTFORMAT (IMMER exakt so einhalten, Emojis nicht weglassen):
✅ RICHTIG: [Was korrekt war – konkret benennen]
❌ FEHLT: [Was fehlte oder falsch war – mit kurzer Begründung]
📖 VORSCHRIFT: [Konkrete FwDV-/Gesetzesreferenz]
▶ SITUATION: [Nächste Einsatzsituation und konkrete Frage an den Kamerad]

Regeln:
- ✅ und ▶ sind immer Pflicht
- ❌ und 📖 nur wenn tatsächlich etwas fehlte
- Wenn mehrere Punkte fehlen: mehrere ❌-Zeilen
- Beim ersten Schritt (Alarmierung): NUR ▶ SITUATION mit der Alarmierungsmeldung und der ersten Frage
- Beim letzten Schritt statt ▶ SITUATION schreibe: 🏁 ÜBUNG BEENDET: [Gesamtnote A/B/C/D und Zusammenfassung]

RELEVANTE REGELWERKE:

FwDV 1 – Grundtätigkeiten:
- Löschangriff: Angriffstrupp geht vor, Wassertrupp sichert Wasserversorgung, Schlauchtrupp verlegt B-Leitung
- Atemschutzeinsatz: mind. 2 AGT gleichzeitig, Sicherheitstrupp einsatzbereit bereitstellen
- PA IMMER vor der Rauchgrenze anlegen, nie erst im verrauchten Bereich

FwDV 3 – Einheiten im Löscheinsatz:
- Staffel (1/5): GF + AT (2) + WT (2)
- Gruppe (1/8): GF + MA + AT (2) + WT (2) + SchT (2) + Melder
- Zug: mind. 2 Gruppen + Zugführer
- Handlungsschema Gruppe: Erkundung → Wasserversorgung → Rettung → Löschangriff

FwDV 7 – Atemschutz:
- Atemschutzüberwachung: Pflicht, vor Einsatz eintragen
- Sicherheitstrupp: vollständig ausgerüstet, einsatzbereit VOR dem Gebäude
- Eintrittsbedingungen: Dichtigkeitstest, PA voll (>270 bar), Eintrag vollständig

FwDV 100 – Führung und Leitung:
- Führungsvorgang: Lagefeststellung → Planung → Befehlsgebung → Einsatzdurchführung → Kontrolle
- Lage erkunden VOR dem Angriff (mind. 3 Seiten eines Gebäudes)
- Einsatzabschnitte bilden ab 3 Einheiten

Verkehrsunfall (VU):
- Eigenschutz: Warnweste anlegen BEVOR das Fahrzeug verlassen wird
- Absicherung: Warndreieck 100m innerorts / 200m außerorts, FW-Fahrzeug als Schutzwall
- Motor aus, Zündschlüssel abziehen (Airbag-Risiko)
- E-/Hybrid-Fahrzeuge: Hochvoltabschaltung, Sicherheitsabstand zu beschädigten Leitungen
- Patientensicherung: HWS stabilisieren BEVOR Bewegung

Gefahrgut:
- Warntafel lesen: Gefahrnummer oben (1203=Kraftstoff), UN-Nummer unten
- Immer von der Windseite annähern (nicht in Windrichtung)
- Sicherheitsabstand: mind. 50m, Atemschutz bereithalten
- Feuerwehr-Einsatzplan aus ERICards/TUIS abrufen

Waldbrand:
- Windrichtung: Einsatz immer rückwärtig / seitlich zum Feuer
- Wasserversorgung: Pendelverkehr wenn kein Hydrant, Löschwasserteiche einplanen
- Riegelstellung: parallele Vorausplanung, keine frontale Bekämpfung bei Wind
- Koordination: Forstbehörde, Hubschrauber bei > 0,5 ha

ThürBKG (Thüringen):
- §1 Abs. 1: Brandschutz und allgemeine Hilfe sind Pflichtaufgaben der Gemeinden
- §3: Freiwillige Feuerwehren sind Regelform für Gemeinden unter 100.000 Einwohner
- §19: Einsatzleitung liegt beim Wehrleiter oder beauftragtem Führungsbeamten
- Grammetal liegt im Landkreis Weimarer Land, Ortswehren: Nohra, Isseroda, Döbritschen, Obergrunstedt`;

// ── Handler ─────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return json({ error: "GEMINI_API_KEY nicht konfiguriert" }, 500);
    }

    const body = await req.json();
    const { nachrichten, szenario } = body as {
      nachrichten: Array<{ role: string; content: string }>;
      szenario?: string;
    };

    if (!nachrichten || !Array.isArray(nachrichten)) {
      return json({ error: "nachrichten fehlt oder ungültig" }, 400);
    }

    // System-Prompt mit Szenario-Kontext zusammenbauen
    const systemPrompt = szenario
      ? `${SYSTEM_PROMPT}\n\n── AKTUELLES SZENARIO ──\n${szenario}`
      : SYSTEM_PROMPT;

    // Gemini erwartet: role "user" | "model" (nicht "assistant")
    const contents = nachrichten.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    // Sicherheit: erster Eintrag muss role "user" sein (Gemini-Requirement)
    if (contents.length === 0 || contents[0].role !== "user") {
      contents.unshift({
        role: "user",
        parts: [{ text: "Starte das Szenario." }],
      });
    }

    const geminiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

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
      return json({ error: `Gemini API Fehler: ${geminiRes.status}` }, 502);
    }

    const geminiData = await geminiRes.json();
    const antwort =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!antwort) {
      return json({ error: "Keine Antwort von Gemini erhalten" }, 502);
    }

    return json({ antwort });
  } catch (err) {
    console.error("Unerwarteter Fehler:", err);
    return json({ error: "Interner Serverfehler" }, 500);
  }
});
