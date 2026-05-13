-- ============================================================
-- Migration 09: Explizite GRANT-Statements (Supabase ab 30.05.2026)
--
-- Ab 30.05.2026 werden neue Tabellen im public-Schema NICHT mehr
-- automatisch über die Data API (supabase-js / PostgREST) zugänglich.
-- Ab 30.10.2026 gilt das für ALLE Projekte.
--
-- Diese Datei muss einmalig im Supabase SQL-Editor ausgeführt werden.
-- Bei künftigen neuen Tabellen: GRANTs direkt in die jeweilige Migration!
-- ============================================================

-- ── profiles ─────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

-- ── wehren ───────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.wehren to authenticated;
grant select, insert, update, delete on public.wehren to service_role;

-- ── dokumente ────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.dokumente to authenticated;
grant select, insert, update, delete on public.dokumente to service_role;

-- ── pruefungen ───────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.pruefungen to authenticated;
grant select, insert, update, delete on public.pruefungen to service_role;

-- ── fragen ───────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.fragen to authenticated;
grant select, insert, update, delete on public.fragen to service_role;

-- ── pruefungs_ergebnisse ──────────────────────────────────────────────────────
grant select, insert, update, delete on public.pruefungs_ergebnisse to authenticated;
grant select, insert, update, delete on public.pruefungs_ergebnisse to service_role;

-- ── aufgaben ─────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.aufgaben to authenticated;
grant select, insert, update, delete on public.aufgaben to service_role;

-- ── einsatzberichte (Migration 08) ───────────────────────────────────────────
grant select, insert, update, delete on public.einsatzberichte to authenticated;
grant select, insert, update, delete on public.einsatzberichte to service_role;
