-- Auf Brevo umstellen (ersetzt Resend)
-- Ausfuehren in: Supabase Dashboard → SQL Editor

-- Neue generische Keys anlegen
INSERT INTO public.system_einstellungen (schluessel, wert) VALUES
  ('mail_api_key', ''),
  ('mail_from', '')
ON CONFLICT (schluessel) DO NOTHING;

-- Alte Resend-Keys koennen bleiben, werden nicht mehr verwendet
-- Optional: alte Keys loeschen
-- DELETE FROM public.system_einstellungen WHERE schluessel IN ('resend_api_key', 'resend_from', 'smtp_username', 'smtp_password');
