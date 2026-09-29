-- ============================================================
-- Watch-Diktat Setup (Sprachaufnahme per Apple Watch Shortcut)
-- Im Supabase Dashboard → SQL Editor ausführen
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS watch_token TEXT UNIQUE;
