-- Migration 17: Push-Benachrichtigungen
-- Speichert Web-Push-Subscriptions der Kameraden

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ps_select_own" ON public.push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ps_insert_own" ON public.push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ps_delete_own" ON public.push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

-- ── pg_cron: Tägliche Erinnerungen um 08:00 Uhr ──────────────────────────────
-- Voraussetzung: pg_cron Extension muss aktiviert sein (Database → Extensions)
-- Und SUPABASE_SERVICE_ROLE_KEY + Projekt-URL müssen bekannt sein.
-- Diesen Block nach dem Aktivieren von pg_cron ausführen:

/*
SELECT cron.schedule(
  'daily-task-reminders',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://fxckpztnfuebbdidypoi.supabase.co/functions/v1/daily-task-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
*/
