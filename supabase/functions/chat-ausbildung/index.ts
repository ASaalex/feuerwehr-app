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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json({ error: "ANTHROPIC_API_KEY nicht konfiguriert" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const sb = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

    const body = await req.json();
    const { nachrichten, szenario, kamerad_id, funktion } = body as {
      nachrichten: Array<{ role: string; content: string }>;
      szenario?: string;
      kamerad_id?: string;
      funktion?: string;
    };

    if (!nachrichten || !Array.isArray(nachrichten)) {
      return json({ error: "nachrichten fehlt oder ungueltig" });
    }

    // ── Guthaben prüfen ──────────────────────────────────────────────────────
    let guthabenVorher = 9999; // Fallback: kein Limit wenn kein kamerad_id
    if (kamerad_id && sb) {
      const { data: profil, error: profErr } = await sb
        .from("profiles")
        .select("ki_guthaben_cent")
        .eq("id", kamerad_id)
        .single();

      if (profErr || !profil) {
        return json({ error: "Profil nicht gefunden" });
      }

      guthabenVorher = profil.ki_guthaben_cent ?? 0;

      if (guthabenVorher <= 0) {
        return json({ error: "KEIN_GUTHABEN" });
      }
    }

    // ── Regelwerke aus Supabase laden ────────────────────────────────────────
    let regelwerkeText = "";
    let regelwerkeGeladen = false;
    if (sb) {
      try {
        const { data: rw } = await sb
          .from("regelwerke")
          .select("titel, inhalt_text")
          .eq("aktiv", true)
          .not("inhalt_text", "is", null);
        if (rw && rw.length > 0) {
          regelwerkeGeladen = true;
          regelwerkeText = "\n\n=== DIENSTVORSCHRIFTEN (einzige Grundlage fuer Bewertung) ===\n";
          for (const r of rw) {
            const text = (r.inhalt_text ?? "").slice(0, 6000);
            regelwerkeText += "\n--- " + r.titel + " ---\n" + text + "\n";
          }
          regelwerkeText += "\n=== ENDE DIENSTVORSCHRIFTEN ===\n";
        }
      } catch (rwErr) {
        console.warn("Regelwerke konnten nicht geladen werden:", rwErr);
      }
    }

    // ── Funktions-spezifische Anweisungen ────────────────────────────────────
    const funktionAnweisungen: Record<string, string> = {
      gruppenfuehrer: `FUNKTION: Gruppenführer (GF)
Stelle NUR Fragen und Situationen die für den Gruppenführer relevant sind:
- Lageerkundung und Lagemeldung an die Einsatzleitung
- Befehlsgebung an die Trupps nach FwDV 3 (Auftrag, Mittel, Ziel, Weg, Zeit)
- Kommunikation per Funk (Einsatzstellenfunk)
- Sicherheitsbeobachtung, Rückzugssignal
- Führungsvorgang: Erkundung → Entschluss → Befehl → Kontrolle
Ignoriere Detailaufgaben der einzelnen Trupps (Schlauchlegen, Pumpe etc.).`,
      melder: `FUNKTION: Melder (Me)
Stelle NUR Fragen und Situationen die für den Melder relevant sind:
- Entgegennahme und Übermittlung von Meldungen (exakt, vollständig)
- Verbindung zwischen Einheiten und Einsatzleitung
- Lagemeldungen formulieren (Ort, Lage, Massnahmen, Kräfte)
- Funkkommunikation und Meldungsprotokoll
Keine taktischen Führungsentscheidungen oder Truppaufgaben.`,
      angriffstrupp: `FUNKTION: Angriffstrupp (A-Trupp)
Stelle NUR Fragen und Situationen die für den Angriffstrupp relevant sind:
- Vornahme des C-Rohrs / Hohlstrahlrohrs
- Menschenrettung und Personensuche
- Atemschutzeinsatz (PA anlegen, Druckkontrolle, Notfallsignal)
- Eindringen in verrauchte Bereiche, Riegelstellung
- Kommunikation mit GF und Atemschutzüberwachung
Keine Wasserversorgungsaufgaben oder Pumpenführung.`,
      wassertrupp: `FUNKTION: Wassertrupp (W-Trupp)
Stelle NUR Fragen und Situationen die für den Wassertrupp relevant sind:
- Aufbau der Wasserversorgung vom Hydrant zum Fahrzeug
- Bedienung des B-Schlauch und Übergangsstück
- Sicherstellung der Wasserversorgung (Meldung: "Wasser marsch/halt")
- Rettungsunterstützung als Sicherungstrupp
- Strahlrohrführung als Backup des Angriffstrupps
Keine Pumpen- oder Fahrzeugbedienung.`,
      schlauchtrupp: `FUNKTION: Schlauchtrupp (S-Trupp)
Stelle NUR Fragen und Situationen die für den Schlauchtrupp relevant sind:
- Verlegen von B- und C-Schläuchen
- Aufbau der langen Wegstrecke / Pendelverkehr
- Sichern der Schlauchleitung, Kupplungen schließen
- Absicherung der Einsatzstelle (Warndreieck, Leitkegel)
- Unterstützung Wasserversorgung über lange Strecken
Keine Brandbekämpfung im Innenangriff.`,
      maschinist: `FUNKTION: Maschinist (Ma)
Stelle NUR Fragen und Situationen die für den Maschinisten relevant sind:
- Inbetriebnahme der Feuerlöschkreiselpumpe (FP)
- Hydrantenbetrieb: Standrohr setzen, Hydrant öffnen
- Druckeinstellung und Überwachung (Eingangs-/Ausgangsdruck)
- Pumpenleistung anpassen, Kavitation vermeiden
- Fahrzeugaufstellung, Sicherung (Unterlegkeile, Feststellbremse)
- Aggregat und Stromversorgung bedienen
Keine Aufgaben im Innenangriff oder Schlauchmanagement.`,
    };

    const funktionText = funktion && funktionAnweisungen[funktion]
      ? "\n\n" + funktionAnweisungen[funktion]
      : "";

    // ── Statischer System-Prompt (wird gecacht) ──────────────────────────────
    const statischerText = [
      "Du bist ein erfahrener Feuerwehr-Ausbilder der Freiwilligen Feuerwehr Grammetal (Thueringen).",
      "Fuehre einen Kamerad durch ein taktisches Einsatz-Szenario. Antworte immer auf Deutsch.",
      "Bleibe ausschliesslich beim Thema Feuerwehr-Ausbildung.",
      "",
      regelwerkeGeladen
        ? "WICHTIG: Bewerte und erklaere AUSSCHLIESSLICH nach den unten bereitgestellten Dienstvorschriften. Erfinde keine Paragraphen, Abschnitte oder Regeln die nicht darin stehen. Wenn etwas nicht in den Vorschriften steht, erwaehne es nicht."
        : "WICHTIG: Es wurden keine Dienstvorschriften hinterlegt. Teile dem Kamerad mit, dass der Administrator zuerst die offiziellen PDFs (FwDV, ThuerBKG) unter Administration -> Regelwerke hochladen muss, bevor Uebungen bewertet werden koennen.",
      "",
      "ABLAUF (ca. 5-8 Schritte):",
      "1. Alarmierungsmeldung beschreiben (Szenario nutzen)",
      "2. Konkrete Frage zum naechsten Handlungsschritt stellen – NUR aus Sicht der angegebenen Funktion",
      "3. Antwort bewerten und naechste Situation beschreiben",
      "4. Nach letztem Schritt: Gesamtbewertung mit Note",
      "",
      "ANTWORTFORMAT (exakt einhalten, Emojis nicht weglassen):",
      "✅ RICHTIG: [Was korrekt war]",
      "❌ FEHLT: [Was fehlte oder falsch war]",
      "📖 VORSCHRIFT: [Exakter Titel des Dokuments aus den Dienstvorschriften]",
      "▶ SITUATION: [Naechste Einsatzsituation und Frage]",
      "",
      "Regeln:",
      "- Erster Schritt NUR: ▶ SITUATION mit Alarmierung und erster Frage",
      "- ✅ RICHTIG und ▶ SITUATION sind immer Pflicht",
      "- ❌ FEHLT und 📖 VORSCHRIFT nur wenn etwas fehlte",
      "- Letzter Schritt: 🏁 UEBUNG BEENDET: [Note A/B/C/D und Zusammenfassung]",
      regelwerkeText,
    ].join("\n");

    // Dynamischer Teil (nicht gecacht): Szenario + Funktion
    const dynamischerText = [
      szenario ? "\n\nAKTUELLES SZENARIO:\n" + szenario : "",
      funktionText,
    ].join("");

    // ── Nachrichten aufbereiten ──────────────────────────────────────────────
    const letzteNachrichten = nachrichten
      .filter(m => !(m.role === "user" && m.content === "Starte das Szenario. Beschreibe die Alarmierungsmeldung."))
      .slice(-10);

    const messages = letzteNachrichten.map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    if (messages.length === 0 || messages[0].role !== "user") {
      messages.unshift({ role: "user", content: "Starte das Szenario." });
    }

    // ── Anthropic API mit Prompt Caching ─────────────────────────────────────
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        system: [
          {
            type: "text",
            text: statischerText,
            cache_control: { type: "ephemeral" }, // Regelwerke werden gecacht
          },
          ...(dynamischerText.trim()
            ? [{ type: "text", text: dynamischerText }]
            : []),
        ],
        messages,
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      console.error("Anthropic Fehler:", anthropicRes.status, err);
      return json({ error: "KI-Fehler " + anthropicRes.status + ": " + err.slice(0, 200) });
    }

    const anthropicData = await anthropicRes.json();
    const antwort = anthropicData?.content?.[0]?.text ?? "";

    if (!antwort) {
      console.error("Leere Antwort von Anthropic:", JSON.stringify(anthropicData));
      return json({ error: "Keine Antwort von der KI erhalten." });
    }

    // ── Kosten berechnen (in Cent, ≈ USD-Cent ≈ EUR-Cent) ───────────────────
    // Claude Haiku 4.5: Input $0.80/MTok, Output $4.00/MTok
    // Cache Write $1.00/MTok, Cache Read $0.08/MTok
    const usage = anthropicData.usage ?? {};
    const inputCost    = (usage.input_tokens                  ?? 0) * 0.00008;
    const outputCost   = (usage.output_tokens                 ?? 0) * 0.00040;
    const cacheWrCost  = (usage.cache_creation_input_tokens   ?? 0) * 0.00010;
    const cacheRdCost  = (usage.cache_read_input_tokens       ?? 0) * 0.000008;
    const totalCostCent = inputCost + outputCost + cacheWrCost + cacheRdCost;
    const kostenCent = Math.max(1, Math.round(totalCostCent));

    console.log(
      `Tokens: in=${usage.input_tokens} out=${usage.output_tokens} ` +
      `cache_wr=${usage.cache_creation_input_tokens} cache_rd=${usage.cache_read_input_tokens} ` +
      `→ ${totalCostCent.toFixed(4)} Cent (abgebucht: ${kostenCent} Cent)`
    );

    // ── Guthaben abbuchen ────────────────────────────────────────────────────
    let guthabenRestCent = guthabenVorher;
    if (kamerad_id && sb && guthabenVorher < 9999) {
      const neuesGuthaben = Math.max(0, guthabenVorher - kostenCent);

      await sb
        .from("profiles")
        .update({ ki_guthaben_cent: neuesGuthaben })
        .eq("id", kamerad_id);

      await sb.from("ki_transaktionen").insert({
        kamerad_id,
        betrag_cent: -kostenCent,
        typ: "abbuchung",
        beschreibung:
          `KI-Simulation: ${usage.input_tokens ?? 0} Input ` +
          `+ ${usage.output_tokens ?? 0} Output Token ` +
          `(Cache: ${usage.cache_read_input_tokens ?? 0} gelesen, ` +
          `${usage.cache_creation_input_tokens ?? 0} geschrieben)`,
      });

      guthabenRestCent = neuesGuthaben;
    }

    return json({ antwort, kosten_cent: kostenCent, guthaben_rest_cent: guthabenRestCent });
  } catch (err) {
    console.error("Fehler:", err);
    return json({ error: "Interner Fehler: " + String(err) });
  }
});
