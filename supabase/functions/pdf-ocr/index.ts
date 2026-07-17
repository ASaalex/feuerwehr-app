import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY nicht konfiguriert" });

    const { bilder, titel } = await req.json() as { bilder: string[]; titel: string };
    if (!bilder?.length) return json({ error: "Keine Bilder übergeben" });

    // Claude Vision: alle Seiten auf einmal schicken (max 20 Bilder)
    const bildInhalte = bilder.slice(0, 20).map((b64) => ({
      type: "image" as const,
      source: { type: "base64" as const, media_type: "image/jpeg" as const, data: b64 },
    }));

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: [
              ...bildInhalte,
              {
                type: "text",
                text: `Dies sind Seiten aus dem Dokument "${titel}". Extrahiere den vollständigen Text aller Seiten. Behalte die Struktur (Überschriften, Abschnitte, Nummerierungen) bei. Gib NUR den extrahierten Text zurück, keine Erklärungen.`,
              },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) throw new Error(`Claude API Fehler: ${resp.status}`);
    const result = await resp.json();
    const text = result.content?.[0]?.text ?? "";

    return json({ success: true, text, seiten: bilder.length });
  } catch (err) {
    console.error("pdf-ocr error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) });
  }
});
