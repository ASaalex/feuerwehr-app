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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY nicht konfiguriert" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const sb = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

    const body = await req.json();
    const { user_id, lehrgang_name, schwaechen, regelwerk_texte, dokument_texte, bereits_gestellt } = body as {
      user_id: string;
      lehrgang_name: string;
      schwaechen: Array<{ thema: string; pct: number }>; // Themen sortiert nach schlechtestem %
      regelwerk_texte?: string[];
      dokument_texte?: string[];
      bereits_gestellt?: string[]; // Fragetexte dieser Session → nicht wiederholen
    };

    // ── Guthaben prüfen ──────────────────────────────────────────────────────
    let guthabenVorher = 0;
    if (user_id && sb) {
      const { data: profil, error } = await sb
        .from("profiles")
        .select("ki_guthaben_cent")
        .eq("id", user_id)
        .single();
      if (error || !profil) return json({ error: "Profil nicht gefunden" });
      guthabenVorher = profil.ki_guthaben_cent ?? 0;
      if (guthabenVorher <= 0) return json({ error: "KEIN_GUTHABEN" });
    } else {
      return json({ error: "user_id fehlt" });
    }

    // ── Prompt bauen ─────────────────────────────────────────────────────────
    const schwacheThemen = schwaechen
      .filter(s => s.pct < 80)
      .slice(0, 3)
      .map(s => `- ${s.thema} (${s.pct}% richtig)`)
      .join("\n") || "Alle Themen gleichmäßig";

    const quellen = [
      ...(dokument_texte ?? []).map(t => `[Lehrgangs-Dokument]\n${t}`),
      ...(regelwerk_texte ?? []).map(t => `[Regelwerk]\n${t}`),
    ].join("\n\n---\n\n").slice(0, 12000);

    const bereitsGestellt = (bereits_gestellt ?? []).slice(-20).join("\n- ");

    const prompt = `Du bist ein erfahrener Feuerwehr-Ausbilder. Dein Kamerad bereitet sich auf den Lehrgang "${lehrgang_name}" vor.

Sein aktuelles Schwächenprofil (Themen wo er unter 80% liegt):
${schwacheThemen}

${bereitsGestellt ? `Bereits gestellte Fragen diese Session (NICHT wiederholen):\n- ${bereitsGestellt}` : ""}

Verfügbare Quellen:
${quellen || "[Keine spezifischen Materialien hinterlegt – nutze dein Feuerwehr-Fachwissen]"}

Aufgabe: Generiere genau 5 Prüfungsfragen. Fokussiere auf die schwachen Themen. Steigere den Schwierigkeitsgrad leicht.
Verwende eine sinnvolle Mischung aus multiple_choice, ja_nein, karteikarte und freitext.

Antworte NUR mit diesem JSON-Array, kein Text davor oder danach:
[
  {
    "typ": "multiple_choice",
    "thema": "Themenblock-Name",
    "frage": "Fragetext?",
    "antworten": [
      {"text": "Richtige Antwort", "richtig": true},
      {"text": "Falsch A", "richtig": false},
      {"text": "Falsch B", "richtig": false},
      {"text": "Falsch C", "richtig": false}
    ],
    "erklaerung": "Kurze Erklärung."
  },
  {
    "typ": "ja_nein",
    "thema": "Themenblock-Name",
    "frage": "Aussage.",
    "antworten": [{"text": "Richtig", "richtig": true}, {"text": "Falsch", "richtig": false}],
    "erklaerung": "Erklärung."
  },
  {
    "typ": "karteikarte",
    "thema": "Themenblock-Name",
    "frage": "Was bedeutet ...?",
    "antworten": null,
    "erklaerung": "Vollständige Antwort."
  },
  {
    "typ": "freitext",
    "thema": "Themenblock-Name",
    "frage": "Beschreibe ...",
    "antworten": null,
    "erklaerung": "Musterlösung."
  },
  {
    "typ": "multiple_choice",
    "thema": "Themenblock-Name",
    "frage": "Weitere Frage?",
    "antworten": [
      {"text": "Richtig", "richtig": true},
      {"text": "Falsch A", "richtig": false},
      {"text": "Falsch B", "richtig": false},
      {"text": "Falsch C", "richtig": false}
    ],
    "erklaerung": "Erklärung."
  }
]`;

    // ── Claude aufrufen ───────────────────────────────────────────────────────
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) throw new Error(`Claude API Fehler: ${await resp.text()}`);
    const result = await resp.json();
    const text = result.content?.[0]?.text ?? "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("Kein JSON in Antwort gefunden.");
    const fragen = JSON.parse(match[0]);

    // ── Kosten berechnen & abbuchen ───────────────────────────────────────────
    const usage = result.usage ?? {};
    const totalCostCent =
      (usage.input_tokens  ?? 0) * 0.00008 +
      (usage.output_tokens ?? 0) * 0.00040;
    const kostenCent = Math.max(1, Math.round(totalCostCent));
    const neuesGuthaben = Math.max(0, guthabenVorher - kostenCent);

    await sb!.from("profiles").update({ ki_guthaben_cent: neuesGuthaben }).eq("id", user_id);
    await sb!.from("ki_transaktionen").insert({
      kamerad_id: user_id,
      betrag_cent: -kostenCent,
      typ: "abbuchung",
      beschreibung: `KI-Lehrgangsausbildung (${lehrgang_name}): ${usage.input_tokens ?? 0} Input + ${usage.output_tokens ?? 0} Output Token`,
    });

    return json({ success: true, fragen, guthaben_rest_cent: neuesGuthaben, kosten_cent: kostenCent });

  } catch (err) {
    console.error("lehrgang-ki-ausbildung error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) });
  }
});
