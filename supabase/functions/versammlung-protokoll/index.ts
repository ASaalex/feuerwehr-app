import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.27.3";

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
    const { name, datum, transkript } = await req.json();
    if (!transkript?.trim()) return json({ success: false, error: "Kein Transkript vorhanden" });

    const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

    const systemPrompt = `Du bist ein Protokoll-Assistent für die Feuerwehr Grammetal.
Deine Aufgabe ist es, aus einem Rohtranskript einer Versammlung ein strukturiertes, formelles Feuerwehr-Protokoll zu erstellen.

Das Protokoll soll folgende Struktur haben:
1. PROTOKOLL-KOPF mit Name, Datum, Ort (falls erkennbar)
2. ANWESENDE (falls erkennbar aus dem Transkript, sonst weglassen)
3. TAGESORDNUNG (nummerierte Punkte falls erkennbar)
4. ZU DEN EINZELNEN PUNKTEN (strukturierte Zusammenfassung der Diskussion und Beschlüsse)
5. BESCHLÜSSE (klar formulierte Beschlüsse)
6. NÄCHSTE SCHRITTE / AUFGABEN (falls erwähnt)
7. SONSTIGES (falls relevant)

Schreibe klar, sachlich und in einem formellen Behördenstil.
Erfinde keine Informationen die nicht im Transkript stehen.
Wenn etwas unklar ist, schreibe es so, wie es aus dem Transkript hervorgeht.`;

    const userPrompt = `Erstelle ein Protokoll für folgende Versammlung:

Name: ${name}
Datum: ${datum}

TRANSKRIPT:
${transkript}

Erstelle daraus ein strukturiertes Feuerwehr-Protokoll.`;

    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const protokoll = message.content[0].type === "text" ? message.content[0].text : "";

    return json({ success: true, protokoll });
  } catch (err) {
    console.error("versammlung-protokoll error:", err);
    return json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});
