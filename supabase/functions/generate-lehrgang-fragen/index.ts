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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY nicht konfiguriert.");

    const body = await req.json();

    // Freitext-Bewertungsmodus
    if (body._aktion === 'bewerten') {
      const { frage, musterloesung, antwort } = body;
      const prompt = `Du bist Feuerwehr-Ausbilder. Bewerte die folgende Antwort eines Kameraden.

Frage: ${frage}
Musterlösung: ${musterloesung}
Antwort des Kameraden: ${antwort}

Antworte NUR mit diesem JSON-Objekt:
{"richtig": true, "erklaerung": "Kurzes Feedback in 1-2 Sätzen."}

"richtig" ist true wenn die Antwort inhaltlich korrekt ist (muss nicht wortgenau sein).`;

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 256, messages: [{ role: "user", content: prompt }] }),
      });
      const result = await resp.json();
      const text = result.content?.[0]?.text ?? '{"richtig":true,"erklaerung":""}';
      const match = text.match(/\{[\s\S]*\}/);
      const bewertung = JSON.parse(match?.[0] ?? '{"richtig":true,"erklaerung":""}');
      return json({ success: true, ...bewertung });
    }

    const { thema_titel, lehrgang_name, dokument_texte, regelwerk_texte, anzahl = 8 } = body;

    const quellen = [
      ...(dokument_texte ?? []).map((t: string) => `[Lehrgangs-Dokument]\n${t}`),
      ...(regelwerk_texte ?? []).map((t: string) => `[Regelwerk/Dienstvorschrift]\n${t}`),
    ].join("\n\n---\n\n");

    if (!quellen.trim()) throw new Error("Keine Textquellen übergeben.");

    const prompt = `Du bist Ausbilder bei der deutschen Feuerwehr. Generiere ${anzahl} Prüfungsfragen für den Lehrgang "${lehrgang_name}", Themenblock "${thema_titel}".

Nutze ausschließlich die folgenden Quellen als Grundlage:

${quellen}

Erstelle eine Mischung aus:
- multiple_choice: 4 Antwortoptionen, genau eine ist richtig
- ja_nein: Aussage die mit Richtig oder Falsch beantwortet wird
- karteikarte: Eine Frage, die Antwort steht in "erklaerung"
- freitext: Offene Frage, Musterlösung steht in "erklaerung"

Antworte NUR mit einem JSON-Array, kein Text davor oder danach:

[
  {
    "typ": "multiple_choice",
    "frage": "...",
    "antworten": [
      {"text": "...", "richtig": true},
      {"text": "...", "richtig": false},
      {"text": "...", "richtig": false},
      {"text": "...", "richtig": false}
    ],
    "erklaerung": "..."
  },
  {
    "typ": "ja_nein",
    "frage": "...",
    "antworten": [
      {"text": "Richtig", "richtig": true},
      {"text": "Falsch", "richtig": false}
    ],
    "erklaerung": "..."
  },
  {
    "typ": "karteikarte",
    "frage": "...",
    "antworten": null,
    "erklaerung": "Musterlösung: ..."
  },
  {
    "typ": "freitext",
    "frage": "...",
    "antworten": null,
    "erklaerung": "Musterlösung: ..."
  }
]`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Claude API Fehler: ${err}`);
    }

    const result = await resp.json();
    const text = result.content?.[0]?.text ?? "";

    // JSON aus Antwort extrahieren
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("Kein JSON in Antwort gefunden.");
    const fragen = JSON.parse(match[0]);

    return json({ success: true, fragen });
  } catch (err) {
    console.error("generate-lehrgang-fragen error:", err);
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
