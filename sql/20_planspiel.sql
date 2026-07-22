-- Migration 20: Planspiel-Sessions
CREATE TABLE IF NOT EXISTS public.planspiel_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titel           text NOT NULL,
  szenario_id     uuid REFERENCES public.szenarien(id) ON DELETE SET NULL,
  wehr_id         uuid REFERENCES public.wehren(id) ON DELETE CASCADE,
  erstellt_von    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv', 'abgeschlossen')),
  kartenzustand   jsonb NOT NULL DEFAULT '{"elemente":[],"linien":[],"zonen":[]}',
  phasen          jsonb NOT NULL DEFAULT '[]',
  lage_updates    jsonb NOT NULL DEFAULT '[]',
  map_center      jsonb DEFAULT '{"lng": 10.4515, "lat": 51.1657, "zoom": 14}',
  erstellt_am     timestamptz NOT NULL DEFAULT now(),
  abgeschlossen_am timestamptz
);

ALTER TABLE public.planspiel_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ps_select_wehr" ON public.planspiel_sessions
  FOR SELECT USING (
    wehr_id IN (SELECT wehr_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT rolle FROM public.profiles WHERE id = auth.uid()) = 'gemeindebrandmeister'
  );

CREATE POLICY "ps_insert_ausbilder" ON public.planspiel_sessions
  FOR INSERT WITH CHECK (erstellt_von = auth.uid());

CREATE POLICY "ps_update_ausbilder" ON public.planspiel_sessions
  FOR UPDATE USING (erstellt_von = auth.uid());

CREATE POLICY "ps_delete_ausbilder" ON public.planspiel_sessions
  FOR DELETE USING (erstellt_von = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planspiel_sessions TO authenticated;
GRANT ALL ON public.planspiel_sessions TO service_role;
