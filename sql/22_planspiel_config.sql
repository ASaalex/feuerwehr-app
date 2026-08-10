-- Planspiel-Konfiguration pro Wehr (Standard-Phasen editierbar)

CREATE TABLE IF NOT EXISTS public.planspiel_config (
  wehr_id        UUID PRIMARY KEY REFERENCES public.wehren(id) ON DELETE CASCADE,
  standard_phasen JSONB
);

ALTER TABLE public.planspiel_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pc_select" ON public.planspiel_config
  FOR SELECT USING (
    wehr_id = (SELECT wehr_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "pc_upsert" ON public.planspiel_config
  FOR ALL USING (
    wehr_id = (SELECT wehr_id FROM public.profiles WHERE id = auth.uid())
  );
