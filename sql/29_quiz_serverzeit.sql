-- ============================================================
-- Migration 29: Frage-Start-Zeit von der Datenbank statt vom Client setzen
-- Ausführen in: Supabase Dashboard → SQL Editor
--
-- Grund: "frage_gestartet_am" wurde bisher mit der Systemzeit des
-- Quizmaster-Browsers gesetzt, die Punktebewertung vergleicht das aber
-- serverseitig gegen now() der Datenbank. Weicht die Client-Uhr auch nur
-- leicht ab, wird die Antwortzeit faelschlich immer auf das Zeitlimit
-- gedeckelt -> es gab bei jeder richtigen Antwort konstant die Haelfte
-- der moeglichen Punkte statt einer geschwindigkeitsabhaengigen Wertung.
-- Diese Funktion setzt den Startzeitpunkt jetzt direkt mit der DB-eigenen
-- Uhr (now()), wodurch Start- und Bewertungszeitpunkt konsistent sind.
-- ============================================================

create or replace function public.quiz_frage_starten(p_session_id uuid, p_frage_index integer)
returns void language plpgsql as $$
begin
  update public.quiz_sessions
    set status = 'frage_aktiv',
        aktuelle_frage_index = p_frage_index,
        frage_gestartet_am = now()
    where id = p_session_id and erstellt_von = auth.uid();
end;
$$;

grant execute on function public.quiz_frage_starten(uuid, integer) to authenticated;
