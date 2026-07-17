-- ============================================================
-- Migration 15: Aufgaben-Erweiterungen
--   - Mehrfach-Zuweisung (Junction-Tabelle)
--   - Bild-Anhänge
--   - Checklisten
-- ============================================================

-- ── 1. Mehrfach-Zuweisung ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.aufgaben_zuweisungen (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aufgabe_id  uuid NOT NULL REFERENCES public.aufgaben(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  zugewiesen_am timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aufgabe_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_az_aufgabe ON public.aufgaben_zuweisungen(aufgabe_id);
CREATE INDEX IF NOT EXISTS idx_az_user   ON public.aufgaben_zuweisungen(user_id);

GRANT SELECT, INSERT, DELETE ON public.aufgaben_zuweisungen TO authenticated;
GRANT ALL ON public.aufgaben_zuweisungen TO service_role;

ALTER TABLE public.aufgaben_zuweisungen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "az_select" ON public.aufgaben_zuweisungen;
CREATE POLICY "az_select" ON public.aufgaben_zuweisungen
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "az_insert" ON public.aufgaben_zuweisungen;
CREATE POLICY "az_insert" ON public.aufgaben_zuweisungen
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "az_delete" ON public.aufgaben_zuweisungen;
CREATE POLICY "az_delete" ON public.aufgaben_zuweisungen
  FOR DELETE USING (auth.role() = 'authenticated');

-- ── 2. Bild-Anhänge ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.aufgaben_bilder (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aufgabe_id      uuid NOT NULL REFERENCES public.aufgaben(id) ON DELETE CASCADE,
  storage_pfad    text NOT NULL,
  dateiname       text NOT NULL,
  hochgeladen_von uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  hochgeladen_am  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ab_aufgabe ON public.aufgaben_bilder(aufgabe_id);

GRANT SELECT, INSERT, DELETE ON public.aufgaben_bilder TO authenticated;
GRANT ALL ON public.aufgaben_bilder TO service_role;

ALTER TABLE public.aufgaben_bilder ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ab_select" ON public.aufgaben_bilder;
CREATE POLICY "ab_select" ON public.aufgaben_bilder
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "ab_insert" ON public.aufgaben_bilder;
CREATE POLICY "ab_insert" ON public.aufgaben_bilder
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "ab_delete" ON public.aufgaben_bilder;
CREATE POLICY "ab_delete" ON public.aufgaben_bilder
  FOR DELETE USING (auth.role() = 'authenticated');

-- ── 3. Checklisten-Punkte ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.aufgaben_checkpunkte (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aufgabe_id   uuid NOT NULL REFERENCES public.aufgaben(id) ON DELETE CASCADE,
  titel        text NOT NULL,
  reihenfolge  integer NOT NULL DEFAULT 0,
  mit_kommentar boolean NOT NULL DEFAULT false  -- Kommentar beim Abhaken verlangen?
);

CREATE INDEX IF NOT EXISTS idx_acp_aufgabe ON public.aufgaben_checkpunkte(aufgabe_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aufgaben_checkpunkte TO authenticated;
GRANT ALL ON public.aufgaben_checkpunkte TO service_role;

ALTER TABLE public.aufgaben_checkpunkte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acp_select" ON public.aufgaben_checkpunkte;
CREATE POLICY "acp_select" ON public.aufgaben_checkpunkte
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "acp_write" ON public.aufgaben_checkpunkte;
CREATE POLICY "acp_write" ON public.aufgaben_checkpunkte
  FOR ALL USING (auth.role() = 'authenticated');

-- ── 4. Checklisten-Status (wer hat was abgehakt) ──────────
CREATE TABLE IF NOT EXISTS public.aufgaben_checkpunkt_status (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpunkt_id uuid NOT NULL REFERENCES public.aufgaben_checkpunkte(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  erledigt     boolean NOT NULL DEFAULT false,
  kommentar    text,
  erledigt_am  timestamptz,
  UNIQUE (checkpunkt_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_acps_punkt ON public.aufgaben_checkpunkt_status(checkpunkt_id);
CREATE INDEX IF NOT EXISTS idx_acps_user  ON public.aufgaben_checkpunkt_status(user_id);

GRANT SELECT, INSERT, UPDATE ON public.aufgaben_checkpunkt_status TO authenticated;
GRANT ALL ON public.aufgaben_checkpunkt_status TO service_role;

ALTER TABLE public.aufgaben_checkpunkt_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acps_select" ON public.aufgaben_checkpunkt_status;
CREATE POLICY "acps_select" ON public.aufgaben_checkpunkt_status
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "acps_write" ON public.aufgaben_checkpunkt_status;
CREATE POLICY "acps_write" ON public.aufgaben_checkpunkt_status
  FOR ALL USING (auth.role() = 'authenticated');

-- ── Storage-Bucket Policies für "aufgaben"-Bucket ─────────
-- WICHTIG: Zuerst im Dashboard anlegen: Storage → New Bucket → "aufgaben" → Private

DROP POLICY IF EXISTS "aufgaben_storage_select" ON storage.objects;
CREATE POLICY "aufgaben_storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'aufgaben' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "aufgaben_storage_insert" ON storage.objects;
CREATE POLICY "aufgaben_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'aufgaben' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "aufgaben_storage_delete" ON storage.objects;
CREATE POLICY "aufgaben_storage_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'aufgaben' AND auth.role() = 'authenticated');
