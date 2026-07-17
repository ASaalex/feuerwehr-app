-- Migration 14: PDF-Upload für Versammlungsprotokolle
ALTER TABLE versammlungen ADD COLUMN IF NOT EXISTS pdf_pfad TEXT;
