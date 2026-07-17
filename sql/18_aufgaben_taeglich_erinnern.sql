-- Migration 18: Tägliche Erinnerung pro Aufgabe schaltbar
ALTER TABLE public.aufgaben
  ADD COLUMN IF NOT EXISTS taeglich_erinnern boolean NOT NULL DEFAULT true;
