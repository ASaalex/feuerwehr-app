-- Migration 19: Freitext-Fragen + Sofortfeedback
ALTER TABLE public.pruefungen
  ADD COLUMN IF NOT EXISTS sofortfeedback boolean NOT NULL DEFAULT false;

ALTER TABLE public.fragen
  ADD COLUMN IF NOT EXISTS musterloesung text;
