-- ============================================================
-- Lehrgangsausbildung Setup
-- Im Supabase Dashboard → SQL Editor ausführen
-- ============================================================

-- 1. Lehrgang-Vorbereitungen (die Lehrgänge selbst)
CREATE TABLE IF NOT EXISTS lehrgang_vorbereitungen (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  beschreibung TEXT,
  vorlage_typ TEXT,           -- z.B. 'truppmann1', 'atemschutz' etc. (Standard-Vorlagen)
  aktiv       BOOLEAN NOT NULL DEFAULT true,
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Themenblöcke pro Lehrgang
CREATE TABLE IF NOT EXISTS lehrgang_themen (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vorbereitung_id  UUID NOT NULL REFERENCES lehrgang_vorbereitungen(id) ON DELETE CASCADE,
  titel            TEXT NOT NULL,
  reihenfolge      INT NOT NULL DEFAULT 0
);

-- 3. Fragen pro Thema
CREATE TABLE IF NOT EXISTS lehrgang_fragen (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thema_id  UUID NOT NULL REFERENCES lehrgang_themen(id) ON DELETE CASCADE,
  typ       TEXT NOT NULL CHECK (typ IN ('multiple_choice','ja_nein','karteikarte','freitext')),
  frage     TEXT NOT NULL,
  -- Für multiple_choice: [{"text":"Antwort A","richtig":true}, ...]
  -- Für ja_nein:         [{"text":"Richtig","richtig":true},{"text":"Falsch","richtig":false}]
  -- Für karteikarte:     null (Antwort steht in erklaerung)
  -- Für freitext:        null (KI bewertet)
  antworten JSONB,
  erklaerung TEXT,            -- Richtige Antwort / Erklärung (immer sichtbar nach Beantwortung)
  reihenfolge INT NOT NULL DEFAULT 0,
  ki_generiert BOOLEAN NOT NULL DEFAULT false,
  freigegeben  BOOLEAN NOT NULL DEFAULT true  -- KI-Fragen starten auf false bis Admin freigibt
);

-- 4. Dokumente/Materialien je Lehrgang (PDFs etc.)
CREATE TABLE IF NOT EXISTS lehrgang_dokumente (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vorbereitung_id  UUID NOT NULL REFERENCES lehrgang_vorbereitungen(id) ON DELETE CASCADE,
  titel            TEXT NOT NULL,
  datei_pfad       TEXT NOT NULL,   -- Supabase Storage Pfad
  quelle           TEXT,            -- z.B. 'Landkreis', 'DFV', 'intern'
  hochgeladen_am   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Zuweisungen: Welcher User → welcher Lehrgang
CREATE TABLE IF NOT EXISTS lehrgang_zuweisungen (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vorbereitung_id  UUID NOT NULL REFERENCES lehrgang_vorbereitungen(id) ON DELETE CASCADE,
  zugewiesen_am    TIMESTAMPTZ NOT NULL DEFAULT now(),
  zugewiesen_von   UUID REFERENCES profiles(id),
  UNIQUE(user_id, vorbereitung_id)
);

-- 6. Fortschritt: User × Frage
CREATE TABLE IF NOT EXISTS lehrgang_fortschritt (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  frage_id      UUID NOT NULL REFERENCES lehrgang_fragen(id) ON DELETE CASCADE,
  richtig       BOOLEAN NOT NULL,
  versuche      INT NOT NULL DEFAULT 1,
  letzter_versuch TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, frage_id)
);

-- ── RLS Policies ─────────────────────────────────────────────

ALTER TABLE lehrgang_vorbereitungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE lehrgang_themen         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lehrgang_fragen         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lehrgang_dokumente      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lehrgang_zuweisungen    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lehrgang_fortschritt    ENABLE ROW LEVEL SECURITY;

-- Vorbereitungen: alle eingeloggten User lesen, Admin schreibt
DROP POLICY IF EXISTS "lv_read"  ON lehrgang_vorbereitungen;
DROP POLICY IF EXISTS "lv_admin" ON lehrgang_vorbereitungen;
CREATE POLICY "lv_read"   ON lehrgang_vorbereitungen FOR SELECT TO authenticated USING (true);
CREATE POLICY "lv_admin"  ON lehrgang_vorbereitungen FOR ALL    TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('wehrleiter','gemeindebrandmeister')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('wehrleiter','gemeindebrandmeister')));

-- Themen: wie Vorbereitungen
DROP POLICY IF EXISTS "lt_read"  ON lehrgang_themen;
DROP POLICY IF EXISTS "lt_admin" ON lehrgang_themen;
CREATE POLICY "lt_read"   ON lehrgang_themen FOR SELECT TO authenticated USING (true);
CREATE POLICY "lt_admin"  ON lehrgang_themen FOR ALL    TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('wehrleiter','gemeindebrandmeister')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('wehrleiter','gemeindebrandmeister')));

-- Fragen: nur freigegebene für normale User; Admin sieht alle
DROP POLICY IF EXISTS "lf_read_freigegeben" ON lehrgang_fragen;
DROP POLICY IF EXISTS "lf_admin"            ON lehrgang_fragen;
CREATE POLICY "lf_read_freigegeben" ON lehrgang_fragen FOR SELECT TO authenticated
  USING (freigegeben = true OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('wehrleiter','gemeindebrandmeister')));
CREATE POLICY "lf_admin" ON lehrgang_fragen FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('wehrleiter','gemeindebrandmeister')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('wehrleiter','gemeindebrandmeister')));

-- Dokumente: alle lesen, Admin schreibt
DROP POLICY IF EXISTS "ld_read"  ON lehrgang_dokumente;
DROP POLICY IF EXISTS "ld_admin" ON lehrgang_dokumente;
CREATE POLICY "ld_read"  ON lehrgang_dokumente FOR SELECT TO authenticated USING (true);
CREATE POLICY "ld_admin" ON lehrgang_dokumente FOR ALL    TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('wehrleiter','gemeindebrandmeister')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('wehrleiter','gemeindebrandmeister')));

-- Zuweisungen: User sieht eigene; Admin sieht + verwaltet alle
DROP POLICY IF EXISTS "lz_eigene" ON lehrgang_zuweisungen;
DROP POLICY IF EXISTS "lz_admin"  ON lehrgang_zuweisungen;
CREATE POLICY "lz_eigene" ON lehrgang_zuweisungen FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('wehrleiter','gemeindebrandmeister')));
CREATE POLICY "lz_admin"  ON lehrgang_zuweisungen FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('wehrleiter','gemeindebrandmeister')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('wehrleiter','gemeindebrandmeister')));

-- Fortschritt: User verwaltet eigenen; Admin liest alle
DROP POLICY IF EXISTS "fp_eigene_select" ON lehrgang_fortschritt;
DROP POLICY IF EXISTS "fp_eigene_insert" ON lehrgang_fortschritt;
DROP POLICY IF EXISTS "fp_eigene_update" ON lehrgang_fortschritt;
CREATE POLICY "fp_eigene_select" ON lehrgang_fortschritt FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle IN ('wehrleiter','gemeindebrandmeister')));
CREATE POLICY "fp_eigene_insert" ON lehrgang_fortschritt FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "fp_eigene_update" ON lehrgang_fortschritt FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── Standard-Lehrgänge (Vorlagen) ────────────────────────────
-- Werden beim ersten Öffnen des Admin-Bereichs in der App angelegt,
-- ODER hier vorab als Seed-Daten einfügen:

INSERT INTO lehrgang_vorbereitungen (name, beschreibung, vorlage_typ) VALUES
  ('Truppmann Teil 1',         'Grundausbildung Feuerwehr – Modul 1',                     'truppmann1'),
  ('Truppmann Teil 2',         'Grundausbildung Feuerwehr – Modul 2 (Atemschutz/Technik)', 'truppmann2'),
  ('Truppführer',              'Führen eines Trupps im Innen- und Außenangriff',            'truppfuehrer'),
  ('Gruppenführer',            'Führen einer Gruppe, Lagekarte, Einsatztaktik',             'gruppenfuehrer'),
  ('Atemschutzgeräteträger',   'Theorie + Praxis Atemschutz nach FwDV 7',                  'atemschutz'),
  ('Maschinisten',             'Bedienung Löschfahrzeuge, Pumpen, Aggregate',               'maschinisten'),
  ('Sprechfunker',             'BOS-Funk, Digitalfunk TETRA, Sprechregeln',                'sprechfunker')
ON CONFLICT DO NOTHING;
