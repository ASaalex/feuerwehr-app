-- ============================================================
-- SMTP & Drucker-E-Mail Setup
-- Ausfuehren in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Drucker-E-Mail pro Wache
ALTER TABLE public.wehren
  ADD COLUMN IF NOT EXISTS drucker_email text;

-- Systemweite Einstellungen (SMTP-Zugangsdaten)
CREATE TABLE IF NOT EXISTS public.system_einstellungen (
  schluessel   text PRIMARY KEY,
  wert         text NOT NULL DEFAULT '',
  geaendert_am timestamptz DEFAULT now()
);

-- Standardwerte eintragen
INSERT INTO public.system_einstellungen (schluessel, wert) VALUES
  ('smtp_username', ''),
  ('smtp_password', '')
ON CONFLICT (schluessel) DO NOTHING;

-- RLS aktivieren
ALTER TABLE public.system_einstellungen ENABLE ROW LEVEL SECURITY;

-- Alle dürfen lesen (Edge Function Service Role braucht das nicht, aber für zukünftige Verwendung)
DROP POLICY IF EXISTS "gbm_select_einstellungen" ON public.system_einstellungen;
DROP POLICY IF EXISTS "gbm_update_einstellungen" ON public.system_einstellungen;
DROP POLICY IF EXISTS "gbm_insert_einstellungen" ON public.system_einstellungen;

-- SELECT: alle authentifizierten Nutzer (Edge Function nutzt Service Role = RLS bypass)
CREATE POLICY "gbm_select_einstellungen" ON public.system_einstellungen
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE rolle = 'gemeindebrandmeister'
    )
  );

-- INSERT: nur Gemeindebrandmeister
CREATE POLICY "gbm_insert_einstellungen" ON public.system_einstellungen
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE rolle = 'gemeindebrandmeister'
    )
  );

-- UPDATE: nur Gemeindebrandmeister
CREATE POLICY "gbm_update_einstellungen" ON public.system_einstellungen
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE rolle = 'gemeindebrandmeister'
    )
  );
