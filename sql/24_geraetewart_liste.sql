-- Geraetewart-Pruefliste pro Nutzer (geraeteübergreifend abrufbar)
CREATE TABLE IF NOT EXISTS public.geraetewart_liste (
  user_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  wehr_id   UUID REFERENCES public.wehren(id),
  eintraege JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.geraetewart_liste ENABLE ROW LEVEL SECURITY;

CREATE POLICY "geraetewart_own"
  ON public.geraetewart_liste
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
