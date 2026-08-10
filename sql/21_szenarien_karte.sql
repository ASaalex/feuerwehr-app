-- Szenarien: Kartenposition, Kartenvorgabe (Objekte/Zonen), Wetterinfo, Phasen

ALTER TABLE public.szenarien
  ADD COLUMN IF NOT EXISTS kartenposition JSONB,
  ADD COLUMN IF NOT EXISTS kartenvorgabe  JSONB DEFAULT '{"elemente":[],"zonen":[]}',
  ADD COLUMN IF NOT EXISTS wetterinfo     JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS phasen         JSONB;
