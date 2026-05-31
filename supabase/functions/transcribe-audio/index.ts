import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY nicht konfiguriert.");

    const { audio_inhalt, audio_name } = await req.json();
    if (!audio_inhalt) throw new Error("audio_inhalt fehlt.");

    // Base64 → Datei
    const audioBuffer = Buffer.from(audio_inhalt, "base64");
    const ext = (audio_name ?? "audio.webm").split(".").pop()?.toLowerCase() ?? "webm";
    const mimeType = ext === "m4a" ? "audio/mp4" : "audio/webm";

    // Multipart-Form für Whisper API aufbauen
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: mimeType });
    formData.append("file", blob, audio_name ?? `audio.${ext}`);
    formData.append("model", "whisper-1");
    formData.append("language", "de");
    formData.append("prompt", "Feuerwehr, Einsatzbericht, Atemschutz, Brandbekämpfung, Menschenrettung, Technische Hilfeleistung, Löscheinsatz, Einsatzleiter, Gruppenführer");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Whisper API Fehler: ${err}`);
    }

    const result = await response.json();
    return json({ success: true, text: result.text });

  } catch (err) {
    console.error("transcribe-audio error:", err);
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
