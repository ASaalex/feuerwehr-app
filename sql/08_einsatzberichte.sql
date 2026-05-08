-- ============================================================
-- Migration 08: Einsatzberichte
-- Ausfuehren in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Neue Spalte auf wehren
ALTER TABLE public.wehren
  ADD COLUMN IF NOT EXISTS einsatzbericht_email text;

-- 2. Neue Tabelle einsatzberichte
CREATE TABLE IF NOT EXISTS public.einsatzberichte (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  wehr_id             uuid NOT NULL REFERENCES public.wehren(id) ON DELETE CASCADE,
  erstellt_von        uuid NOT NULL REFERENCES public.profiles(id),
  erstellt_am         timestamptz DEFAULT now(),
  aktualisiert_am     timestamptz DEFAULT now(),

  -- Abschnitt 1: Kopfdaten
  einsatzart          text,
  einsatzort          text,
  km_gesamt           numeric,
  datum               date,
  alarmzeit           time,

  -- Abschnitt 2: Fahrzeuge & Zeiten
  -- [{fahrzeug, ab, raus, an, zurueck, bereit, km}]
  fahrzeuge           jsonb DEFAULT '[]'::jsonb,

  -- Abschnitt 3: Einsatzkraefte
  -- [{kamerad_id, name, funktion, fahrzeug, atemschutz}]
  einsatzkraefte      jsonb DEFAULT '[]'::jsonb,

  -- Abschnitt 4: Eingesetzte Mittel
  bioversal_l         numeric,
  absodan_kg          numeric,
  loeschwasser_l      numeric,
  schaummittel_l      numeric,
  mittel_sonstiges    text,

  -- Abschnitt 5: Beteiligte Organisationen
  -- {feuerwehren:[], polizei:{}, rettungsdienste:[], einsatzleitung:{}, uebergabe:{}, betroffene:[]}
  organisationen      jsonb DEFAULT '{}'::jsonb,

  -- Abschnitt 6: Kurzbericht & Fotos
  lage_eintreffen     text,
  taetigkeiten        text,
  erlaeuterung        text,
  foto_pfade          text[] DEFAULT ARRAY[]::text[],

  -- Abschnitt 7: Abschluss
  abschluss_name      text,

  abgeschlossen       boolean DEFAULT false
);

-- Trigger fuer aktualisiert_am (sofern Funktion existiert)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'set_aktualisiert_am'
  ) THEN
    CREATE TRIGGER einsatzberichte_aktualisiert
      BEFORE UPDATE ON public.einsatzberichte
      FOR EACH ROW EXECUTE PROCEDURE public.set_aktualisiert_am();
  END IF;
END;
$$;

-- 3. RLS aktivieren
ALTER TABLE public.einsatzberichte ENABLE ROW LEVEL SECURITY;

-- SELECT: Eigene Wache oder Admin
CREATE POLICY "Kameraden sehen Berichte ihrer Wache"
  ON public.einsatzberichte FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE status = 'aktiv'
        AND (wehr_id = einsatzberichte.wehr_id OR rolle = 'gemeindebrandmeister')
    )
  );

-- INSERT: Wehrleiter, GBM, Gruppenfuehrer
CREATE POLICY "Wehrleiter und Gruppenfuehrer erstellen Berichte"
  ON public.einsatzberichte FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE status = 'aktiv'
        AND rolle IN ('wehrleiter', 'gemeindebrandmeister', 'gruppenfuehrer', 'ausbilder')
    )
  );

-- UPDATE: Ersteller oder Admin
CREATE POLICY "Ersteller und Admin bearbeiten Berichte"
  ON public.einsatzberichte FOR UPDATE
  USING (
    erstellt_von = auth.uid()
    OR auth.uid() IN (
      SELECT id FROM public.profiles WHERE rolle IN ('wehrleiter', 'gemeindebrandmeister')
    )
  );

-- DELETE: Ersteller oder Admin
CREATE POLICY "Ersteller und Admin loeschen Berichte"
  ON public.einsatzberichte FOR DELETE
  USING (
    erstellt_von = auth.uid()
    OR auth.uid() IN (
      SELECT id FROM public.profiles WHERE rolle IN ('wehrleiter', 'gemeindebrandmeister')
    )
  );

-- 4. Storage-Bucket fuer Fotos (manuell im Dashboard anlegen falls nicht vorhanden)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('einsatz-fotos', 'einsatz-fotos', false)
-- ON CONFLICT DO NOTHING;
