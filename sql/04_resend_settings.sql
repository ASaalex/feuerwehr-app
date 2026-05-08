-- Resend API-Einstellungen hinzufuegen
-- Ausfuehren in: Supabase Dashboard → SQL Editor

INSERT INTO public.system_einstellungen (schluessel, wert) VALUES
  ('resend_api_key', ''),
  ('resend_from', '')
ON CONFLICT (schluessel) DO NOTHING;

-- Alte SMTP-Eintraege koennen bleiben, werden nicht mehr verwendet
