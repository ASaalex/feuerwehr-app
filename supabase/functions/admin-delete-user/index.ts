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
    const { user_id } = await req.json();
    if (!user_id) throw new Error("user_id ist erforderlich");

    // Aufrufer prüfen
    const callerToken = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${callerToken}` } } }
    );
    const { data: caller } = await callerClient
      .from("profiles")
      .select("id, rolle, wehr_id")
      .single();

    const erlaubteRollen = ["gemeindebrandmeister", "wehrleiter"];
    if (!erlaubteRollen.includes(caller?.rolle)) {
      return json({ success: false, error: "Keine Berechtigung" }, 403);
    }

    // Admin-Client
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Ziel-Profil laden (für Berechtigungs-Check)
    const { data: ziel } = await adminClient
      .from("profiles")
      .select("id, rolle, wehr_id")
      .eq("id", user_id)
      .single();

    if (!ziel) throw new Error("Nutzer nicht gefunden");

    // Wehrleiter darf nur Kameraden seiner eigenen Wache löschen
    // und keine anderen Wehrleiter oder höhere Rollen
    if (caller.rolle === "wehrleiter") {
      const geschuetzteRollen = ["gemeindebrandmeister", "wehrleiter"];
      if (geschuetzteRollen.includes(ziel.rolle)) {
        return json({ success: false, error: "Wehrleiter kann keine anderen Wehrleiter oder Gemeindebrandmeister löschen" }, 403);
      }
      if (ziel.wehr_id !== caller.wehr_id) {
        return json({ success: false, error: "Nur Kameraden der eigenen Wache können gelöscht werden" }, 403);
      }
    }

    // Profil löschen (Service Role umgeht RLS)
    await adminClient.from("profiles").delete().eq("id", user_id);

    // Auth-User löschen
    const { error: authErr } = await adminClient.auth.admin.deleteUser(user_id);
    if (authErr) {
      console.warn("Auth-User-Löschung fehlgeschlagen (Profil bereits gelöscht):", authErr.message);
      // Kein harter Fehler – Profil ist weg, Login schlägt sowieso fehl
    }

    return json({ success: true });
  } catch (err) {
    console.error("admin-delete-user error:", err);
    return json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      400
    );
  }
});
