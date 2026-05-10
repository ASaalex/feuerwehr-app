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

-- 4. Storage-Bucket fuer Fotos anlegen
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'einsatz-fotos',
  'einsatz-fotos',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage-Policies fuer einsatz-fotos
-- Hochladen: alle eingeloggten Nutzer
CREATE POLICY "Authentifizierte Nutzer laden Fotos hoch"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'einsatz-fotos');

-- Anzeigen / Download: alle eingeloggten Nutzer
CREATE POLICY "Authentifizierte Nutzer sehen Fotos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'einsatz-fotos');

-- Loeschen: nur der Uploader (Ordner = wehr_id)
CREATE POLICY "Authentifizierte Nutzer loeschen eigene Fotos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'einsatz-fotos');
