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

    // Hilfsfunktion: Aufrufer-Profil über JWT laden (zuverlässig ohne RLS-Probleme)
    async function getCallerProfile(adminClient: ReturnType<typeof createClient>, token: string) {
      const { data: { user }, error } = await adminClient.auth.getUser(token);
      if (error || !user) return null;
      const { data } = await adminClient.from("profiles").select("id,rolle,wehr_id").eq("id", user.id).single();
      return data;
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const callerToken = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";

    // ── Passwort setzen ───────────────────────────────────────────────────────
    if (body.action === "set-password") {
      const { user_id, new_password } = body;
      if (!user_id || !new_password) return json({ success: false, error: "user_id und new_password erforderlich" });
      if (new_password.length < 6) return json({ success: false, error: "Passwort mind. 6 Zeichen" });
      const caller = await getCallerProfile(adminClient, callerToken);
      if (!["gemeindebrandmeister", "wehrleiter", "ausbilder"].includes(caller?.rolle)) {
        return json({ success: false, error: "Keine Berechtigung" });
      }
      const { error } = await adminClient.auth.admin.updateUserById(user_id, { password: new_password });
      if (error) return json({ success: false, error: error.message });
      return json({ success: true });
    }

    // ── Nutzer löschen ────────────────────────────────────────────────────────
    if (body.action === "delete-user") {
      const { user_id } = body;
      if (!user_id) return json({ success: false, error: "user_id erforderlich" });
      const caller = await getCallerProfile(adminClient, callerToken);
      if (!["gemeindebrandmeister", "wehrleiter"].includes(caller?.rolle)) {
        return json({ success: false, error: "Keine Berechtigung (Rolle: " + (caller?.rolle ?? "unbekannt") + ")" });
      }
      const { data: ziel } = await adminClient.from("profiles").select("id,rolle,wehr_id").eq("id", user_id).single();
      if (!ziel) return json({ success: false, error: "Nutzer nicht gefunden" });
      // Wehrleiter darf nur Nutzer seiner eigenen Wache löschen
      // (aber NICHT den eigenen Account und NICHT den GBM)
      if (caller.rolle === "wehrleiter") {
        if (ziel.rolle === "gemeindebrandmeister") {
          return json({ success: false, error: "Gemeindebrandmeister kann nicht gelöscht werden" });
        }
        if (caller.id === user_id) {
          return json({ success: false, error: "Eigener Account kann nicht gelöscht werden" });
        }
        if (ziel.wehr_id !== caller.wehr_id) {
          return json({ success: false, error: "Nur Nutzer der eigenen Wache können gelöscht werden" });
        }
      }
      // Abhängige Daten zuerst löschen / entkoppeln (FK-Constraints vermeiden)
      await adminClient.from("uebungs_sessions").delete().eq("kamerad_id", user_id);
      await adminClient.from("ki_transaktionen").delete().eq("kamerad_id", user_id);
      await adminClient.from("ki_transaktionen").delete().eq("erstellt_von", user_id);
      await adminClient.from("kamerad_lehrgaenge").delete().eq("kamerad_id", user_id);
      await adminClient.from("kamerad_wehren").delete().eq("kamerad_id", user_id);
      // Dokumente & Prüfungen: erstellt_von auf NULL setzen (Inhalte bleiben erhalten)
      await adminClient.from("dokumente").update({ hochgeladen_von: null }).eq("hochgeladen_von", user_id);
      await adminClient.from("pruefungen").update({ erstellt_von: null }).eq("erstellt_von", user_id);

      // Profil löschen
      const { error: profileErr } = await adminClient.from("profiles").delete().eq("id", user_id);
      if (profileErr) return json({ success: false, error: "Profil konnte nicht gelöscht werden: " + profileErr.message });

      // Auth-User löschen
      const { error: authErr } = await adminClient.auth.admin.deleteUser(user_id);
      if (authErr) return json({ success: false, error: "Auth-User konnte nicht gelöscht werden: " + authErr.message });

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

    // 1. Nutzer in Auth anlegen (kein automatisches Login)
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // direkt bestätigt, kein E-Mail-Versand nötig
    });

    if (authError || !authData.user) {
      throw new Error("Auth-Fehler: " + authError?.message);
    }

    const userId = authData.user.id;

    // 2. Profil aktualisieren (service role umgeht RLS)
    const { error: profileError } = await adminClient.from("profiles").update({
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
      await adminClient.auth.admin.deleteUser(userId);
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
