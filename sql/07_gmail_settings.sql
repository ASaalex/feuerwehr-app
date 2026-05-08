-- Gmail SMTP Einstellungen
-- Ausfuehren in: Supabase Dashboard → SQL Editor

INSERT INTO public.system_einstellungen (schluessel, wert) VALUES
  ('smtp_user', ''),
  ('smtp_pass', '')
ON CONFLICT (schluessel) DO NOTHING;
