-- FIX: INSERT-Policy fuer system_einstellungen fehlt
-- Ausfuehren in: Supabase Dashboard → SQL Editor
-- ============================================================

-- INSERT-Policy hinzufügen (war vorher nicht vorhanden → upsert schlug fehl)
DROP POLICY IF EXISTS "gbm_insert_einstellungen" ON public.system_einstellungen;
CREATE POLICY "gbm_insert_einstellungen" ON public.system_einstellungen
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE rolle = 'gemeindebrandmeister'
    )
  );

-- Resend-Einstellungen anlegen (falls noch nicht vorhanden)
INSERT INTO public.system_einstellungen (schluessel, wert) VALUES
  ('resend_api_key', ''),
  ('resend_from', '')
ON CONFLICT (schluessel) DO NOTHING;
