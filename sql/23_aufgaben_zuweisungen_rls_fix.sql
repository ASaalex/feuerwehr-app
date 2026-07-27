-- Migration 23: RLS-Fix fuer Mehrfach-Zuweisungen bei Aufgaben
--   Seit Migration 15 laeuft die Personen-Zuweisung ueber die
--   Junction-Tabelle aufgaben_zuweisungen statt ueber die alte
--   Einzel-Spalte aufgaben.zugewiesen_an. Die RLS-Policies auf
--   aufgaben selbst wurden dabei nicht angepasst: zugewiesene
--   Kameraden konnten ihre Aufgaben weder sehen noch deren Status
--   aendern, da SELECT/UPDATE ausschliesslich zugewiesen_an prueften.

DROP POLICY IF EXISTS "Nutzer sieht zugewiesene Aufgaben" ON public.aufgaben;
CREATE POLICY "Nutzer sieht zugewiesene Aufgaben"
  ON public.aufgaben FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.aufgaben_zuweisungen az
      WHERE az.aufgabe_id = aufgaben.id AND az.user_id = auth.uid()
    ) AND public.is_aktiv()
  );

DROP POLICY IF EXISTS "Admin und Ersteller bearbeiten Aufgaben" ON public.aufgaben;
CREATE POLICY "Admin und Ersteller bearbeiten Aufgaben"
  ON public.aufgaben FOR UPDATE
  USING (
    public.is_admin() OR
    erstellt_von = auth.uid() OR
    zugewiesen_an = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.aufgaben_zuweisungen az
      WHERE az.aufgabe_id = aufgaben.id AND az.user_id = auth.uid()
    )
  );
