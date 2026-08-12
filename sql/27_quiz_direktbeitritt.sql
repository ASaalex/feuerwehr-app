-- ============================================================
-- Migration 27: Direktbeitritt fuer eingeloggte Kameraden
-- Ausführen in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Profilbild direkt am Teilnehmer speichern (nicht ueber profiles-Join),
-- damit auch Gaeste (anon, ohne Leserecht auf "profiles") die Rangliste
-- inkl. Foto sehen koennen.
ALTER TABLE public.quiz_teilnehmer
  ADD COLUMN IF NOT EXISTS avatar_url text;
