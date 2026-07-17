-- Migration 16: Wiederkehrende Aufgaben
-- Spalten an bestehende aufgaben-Tabelle anhängen

ALTER TABLE public.aufgaben
  ADD COLUMN IF NOT EXISTS wiederholung text
    CHECK (wiederholung IN ('monatlich', 'quartal', 'halbjährlich', 'jährlich'));

-- Letzte Erledigung merken (für nächste Fälligkeit)
ALTER TABLE public.aufgaben
  ADD COLUMN IF NOT EXISTS letzte_erledigung timestamptz;
