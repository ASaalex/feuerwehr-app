-- Audio-Pfad für Einsatzberichte (in Supabase Storage gespeichert)
ALTER TABLE public.einsatzberichte
  ADD COLUMN IF NOT EXISTS audio_pfad TEXT;

-- Bucket "einsatz-audio" muss im Supabase Dashboard unter Storage angelegt werden:
-- Name: einsatz-audio, Private bucket (nicht public)
-- Policy: Authenticated users können in eigene wehr_id-Pfade schreiben/lesen
