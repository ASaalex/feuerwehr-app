import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const ZWOELF_STUNDEN_MS = 12 * 60 * 60 * 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { token, text } = await req.json();
    if (!token) throw new Error("token fehlt.");
    if (!text || !text.trim()) throw new Error("text fehlt.");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: profil, error: profilError } = await supabase
      .from("profiles")
      .select("id, vorname, nachname, wehr_id")
      .eq("watch_token", token)
      .single();

    if (profilError || !profil) return json({ success: false, error: "Ungültiger Zugriffscode." }, 401);
    if (!profil.wehr_id) return json({ success: false, error: "Dieser Nutzer ist keiner Wache zugeordnet." }, 400);

    const jetzt = new Date();
    const uhr = jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
    const datum = jetzt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
    const eintrag = `\n\n---\n[${datum}, ${uhr} Uhr – Watch-Diktat von ${profil.vorname} ${profil.nachname}]\n${text.trim()}`;

    const { data: letzterBericht } = await supabase
      .from("einsatzberichte")
      .select("id, taetigkeiten, erstellt_am")
      .eq("wehr_id", profil.wehr_id)
      .eq("abgeschlossen", false)
      .order("erstellt_am", { ascending: false })
      .limit(1)
      .maybeSingle();

    const istAktuell = letzterBericht && (jetzt.getTime() - new Date(letzterBericht.erstellt_am).getTime()) < ZWOELF_STUNDEN_MS;

    if (istAktuell) {
      const { error: updateError } = await supabase
        .from("einsatzberichte")
        .update({ taetigkeiten: (letzterBericht.taetigkeiten || "") + eintrag })
        .eq("id", letzterBericht.id);
      if (updateError) throw updateError;
      return json({ success: true, action: "appended", bericht_id: letzterBericht.id });
    }

    const isoDatum = jetzt.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
    const { data: neuerBericht, error: insertError } = await supabase
      .from("einsatzberichte")
      .insert({
        wehr_id: profil.wehr_id,
        erstellt_von: profil.id,
        datum: isoDatum,
        taetigkeiten: eintrag.trimStart(),
      })
      .select("id")
      .single();
    if (insertError) throw insertError;
    return json({ success: true, action: "created", bericht_id: neuerBericht.id });

  } catch (err) {
    console.error("watch-diktat error:", err);
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
