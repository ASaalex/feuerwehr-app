-- Planspiel-Konfiguration pro Wehr (Standard-Phasen editierbar)

CREATE TABLE IF NOT EXISTS public.planspiel_config (
  wehr_id        UUID PRIMARY KEY REFERENCES public.wehren(id) ON DELETE CASCADE,
  standard_phasen JSONB
);

ALTER TABLE public.planspiel_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pc_select" ON public.planspiel_config;
DROP POLICY IF EXISTS "pc_upsert" ON public.planspiel_config;

-- get_my_wehr_id() ist SECURITY DEFINER und umgeht damit RLS-Rekursion beim Nachschlagen
-- der eigenen wehr_id in profiles (dieselbe Hilfsfunktion wird auch bei profiles selbst verwendet).
-- Gemeindebrandmeister haben keine eigene wehr_id (betreuen mehrere Wehren) und dürfen daher
-- die Standard-Phasen jeder Wehr sehen/bearbeiten.
CREATE POLICY "pc_select" ON public.planspiel_config
  FOR SELECT USING (
    wehr_id = get_my_wehr_id() OR get_my_rolle() = 'gemeindebrandmeister'
  );

CREATE POLICY "pc_upsert" ON public.planspiel_config
  FOR ALL USING (
    wehr_id = get_my_wehr_id() OR get_my_rolle() = 'gemeindebrandmeister'
  )
  WITH CHECK (
    wehr_id = get_my_wehr_id() OR get_my_rolle() = 'gemeindebrandmeister'
  );
