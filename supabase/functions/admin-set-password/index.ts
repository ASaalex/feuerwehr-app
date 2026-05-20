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
    const { user_id, new_password } = await req.json();

    if (!user_id || !new_password) {
      throw new Error("user_id und new_password sind erforderlich");
    }
    if (new_password.length < 6) {
      throw new Error("Passwort muss mindestens 6 Zeichen haben");
    }

    // Aufrufer-Token prüfen: Nur Wehrleiter / GBM / Ausbilder dürfen das
    const callerToken = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${callerToken}` } } }
    );
    const { data: callerProfile } = await callerClient
      .from("profiles")
      .select("rolle")
      .single();
    const erlaubteRollen = ["gemeindebrandmeister", "wehrleiter", "ausbilder"];
    if (!erlaubteRollen.includes(callerProfile?.rolle)) {
      return json({ success: false, error: "Keine Berechtigung" }, 403);
    }

    // Admin-Client mit Service Role Key
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { error } = await adminClient.auth.admin.updateUserById(user_id, {
      password: new_password,
    });

    if (error) throw new Error(error.message);

    return json({ success: true });
  } catch (err) {
    console.error("admin-set-password error:", err);
    return json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      400
    );
  }
});
