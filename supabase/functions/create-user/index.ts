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

    // ── Passwort setzen ───────────────────────────────────────────────────────
    if (body.action === "set-password") {
      const { user_id, new_password } = body;
      if (!user_id || !new_password) throw new Error("user_id und new_password erforderlich");
      if (new_password.length < 6) throw new Error("Passwort mind. 6 Zeichen");
      const callerToken = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
      const callerClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${callerToken}` } } }
      );
      const { data: callerProfile } = await callerClient.from("profiles").select("rolle").single();
      if (!["gemeindebrandmeister", "wehrleiter", "ausbilder"].includes(callerProfile?.rolle)) {
        return json({ success: false, error: "Keine Berechtigung" }, 403);
      }
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const { error } = await adminClient.auth.admin.updateUserById(user_id, { password: new_password });
      if (error) throw new Error(error.message);
      return json({ success: true });
    }

    // ── Nutzer löschen ────────────────────────────────────────────────────────
    if (body.action === "delete-user") {
      const { user_id } = body;
      if (!user_id) throw new Error("user_id erforderlich");
      const callerToken = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
      const callerClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${callerToken}` } } }
      );
      const { data: caller } = await callerClient.from("profiles").select("id,rolle,wehr_id").single();
      if (!["gemeindebrandmeister", "wehrleiter"].includes(caller?.rolle)) {
        return json({ success: false, error: "Keine Berechtigung" }, 403);
      }
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const { data: ziel } = await adminClient.from("profiles").select("id,rolle,wehr_id").eq("id", user_id).single();
      if (!ziel) throw new Error("Nutzer nicht gefunden");
      if (caller.rolle === "wehrleiter") {
        if (["gemeindebrandmeister", "wehrleiter"].includes(ziel.rolle)) {
          return json({ success: false, error: "Wehrleiter kann keine anderen Wehrleiter löschen" }, 403);
        }
        if (ziel.wehr_id !== caller.wehr_id) {
          return json({ success: false, error: "Nur Kameraden der eigenen Wache können gelöscht werden" }, 403);
        }
      }
      await adminClient.from("profiles").delete().eq("id", user_id);
      const { error: authErr } = await adminClient.auth.admin.deleteUser(user_id);
      if (authErr) console.warn("Auth-Delete fehlgeschlagen:", authErr.message);
      return json({ success: true });
    }

    // ── Nutzer anlegen (bestehende Logik) ─────────────────────────────────────
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
