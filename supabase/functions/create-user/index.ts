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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      email,
      password,
      vorname,
      nachname,
      nutzername,
      wehr_id,
      rolle,
      status = "aktiv",
      telefon,
      geburtsdatum,
      eintrittsdatum,
    } = body;

    if (!email || !password) throw new Error("E-Mail und Passwort sind erforderlich");

    // Admin-Client mit Service Role Key (umgeht RLS)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Nutzer in Auth anlegen (kein automatisches Login)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // direkt bestätigt, kein E-Mail-Versand nötig
    });

    if (authError || !authData.user) {
      throw new Error("Auth-Fehler: " + authError?.message);
    }

    const userId = authData.user.id;

    // 2. Profil aktualisieren (service role umgeht RLS)
    const { error: profileError } = await supabase.from("profiles").update({
      vorname: vorname ?? "Fahrzeug",
      nachname: nachname ?? "Tablet",
      nutzername: nutzername ?? email.split("@")[0],
      wehr_id: wehr_id ?? null,
      rolle: rolle ?? "kamerad",
      status,
      telefon: telefon ?? null,
      geburtsdatum: geburtsdatum ?? null,
      eintrittsdatum: eintrittsdatum ?? null,
    }).eq("id", userId);

    if (profileError) {
      // Nutzer wieder löschen wenn Profil-Update fehlschlägt
      await supabase.auth.admin.deleteUser(userId);
      throw new Error("Profil-Fehler: " + profileError.message);
    }

    return json({ success: true, user_id: userId });
  } catch (err) {
    console.error("create-user error:", err);
    return json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      400
    );
  }
});
