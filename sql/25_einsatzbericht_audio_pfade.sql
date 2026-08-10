-- Mehrere Sprachaufnahmen pro Einsatzbericht (Array statt einzelner Pfad)
ALTER TABLE public.einsatzberichte
  ADD COLUMN IF NOT EXISTS audio_pfade JSONB DEFAULT '[]';
-- audio_pfad (TEXT) bleibt für bestehende Einträge erhalten
