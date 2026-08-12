-- ============================================================
-- Migration 28: Antworten anhand der Options-Position statt Text vergleichen
-- Ausführen in: Supabase Dashboard → SQL Editor
--
-- Grund: Enthaelt eine Antwortoption Sonderzeichen (z.B. eingebettete
-- Anfuehrungszeichen wie bei Funkspruechen), konnte der Text-Vergleich
-- zwischen eingesandter Antwort und Antwortoption fehlschlagen -> die
-- prozentuale Auswertung zeigte faelschlich 0% fuer alle Optionen.
-- Ab jetzt sendet der Client die Options-Position (Index), die serverseitige
-- Bewertung vergleicht ebenfalls per Index. Robuster, unabhaengig vom Text.
-- ============================================================

create or replace function public.quiz_bewerte_antwort()
returns trigger language plpgsql security definer as $$
declare
  f record;
  sess record;
  richtige_idx int[];
  auswahl_idx int[];
  ist_richtig boolean := false;
  elapsed_ms integer;
  limit_ms integer;
  geschw_faktor numeric;
  basis_punkte integer;
begin
  select typ, antworten, punkte into f from public.fragen where id = new.frage_id;
  select frage_gestartet_am, sekunden_pro_frage into sess from public.quiz_sessions where id = new.session_id;

  if f.typ = 'freitext' then
    -- Freitext wird im Live-Quiz nicht automatisch bewertet
    new.richtig := false;
    new.punkte := 0;
    return new;
  end if;

  select coalesce(array_agg((ord - 1)::int), '{}') into richtige_idx
    from jsonb_array_elements(coalesce(f.antworten, '[]'::jsonb)) with ordinality as t(elem, ord)
    where (elem->>'richtig')::boolean is true;

  if new.antwort is null then
    auswahl_idx := '{}';
  elsif jsonb_typeof(new.antwort) = 'array' then
    select coalesce(array_agg(x::int), '{}') into auswahl_idx from jsonb_array_elements_text(new.antwort) x;
  else
    auswahl_idx := array[(new.antwort#>>'{}')::int];
  end if;

  if f.typ = 'mehrfachauswahl' then
    ist_richtig := (
      richtige_idx <@ auswahl_idx and auswahl_idx <@ richtige_idx
    );
  else
    ist_richtig := (
      array_length(auswahl_idx, 1) = 1 and auswahl_idx[1] = any(richtige_idx)
    );
  end if;

  limit_ms := coalesce(sess.sekunden_pro_frage, 20) * 1000;
  if sess.frage_gestartet_am is null then
    elapsed_ms := limit_ms;
  else
    elapsed_ms := greatest(0, extract(epoch from (now() - sess.frage_gestartet_am)) * 1000)::integer;
  end if;
  elapsed_ms := least(elapsed_ms, limit_ms);

  basis_punkte := coalesce(f.punkte, 1) * 1000;
  geschw_faktor := 1 - (elapsed_ms::numeric / limit_ms::numeric) * 0.5;

  new.richtig := ist_richtig;
  new.antwortzeit_ms := elapsed_ms;
  new.punkte := case when ist_richtig then round(basis_punkte * geschw_faktor) else 0 end;

  return new;
end;
$$;
