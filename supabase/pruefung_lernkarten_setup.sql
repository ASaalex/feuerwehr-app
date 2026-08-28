-- ============================================================
-- Pruefungen: Lernkarten-Fortschritt
-- Im Supabase Dashboard → SQL Editor ausführen
-- ============================================================

-- Fortschritt: User × Frage (fragen-Tabelle der Pruefungen)
CREATE TABLE IF NOT EXISTS pruefung_lernkarten_fortschritt (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  frage_id        UUID NOT NULL REFERENCES fragen(id) ON DELETE CASCADE,
  status          TEXT NOT NULL CHECK (status IN ('gewusst','teilweise','nicht_gewusst')),
  versuche        INT NOT NULL DEFAULT 1,
  letzter_versuch TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, frage_id)
);

-- ── RLS Policies ─────────────────────────────────────────────
-- Rein privat: jeder Nutzer sieht/verwaltet ausschliesslich seinen eigenen Fortschritt.

ALTER TABLE pruefung_lernkarten_fortschritt ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plf_eigene_select" ON pruefung_lernkarten_fortschritt;
DROP POLICY IF EXISTS "plf_eigene_insert" ON pruefung_lernkarten_fortschritt;
DROP POLICY IF EXISTS "plf_eigene_update" ON pruefung_lernkarten_fortschritt;

CREATE POLICY "plf_eigene_select" ON pruefung_lernkarten_fortschritt FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "plf_eigene_insert" ON pruefung_lernkarten_fortschritt FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "plf_eigene_update" ON pruefung_lernkarten_fortschritt FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
