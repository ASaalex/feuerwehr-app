-- ============================================================
-- Migration 10: RLS + GRANT für kamerad_wehren
--
-- Damit Kameraden die Nebenwachen-Zuordnungen ihrer eigenen
-- Wache lesen können (für Dashboard-Anzeige), muss die
-- SELECT-Policy entsprechend erweitert werden.
--
-- Diese Datei einmalig im Supabase SQL-Editor ausführen.
-- ============================================================

-- GRANT (falls noch nicht vorhanden)
grant select, insert, update, delete on public.kamerad_wehren to authenticated;
grant select, insert, update, delete on public.kamerad_wehren to service_role;

-- RLS aktivieren (falls noch nicht aktiv)
alter table public.kamerad_wehren enable row level security;

-- Alte Policy entfernen (falls vorhanden)
drop policy if exists "kamerad_wehren_select" on public.kamerad_wehren;
drop policy if exists "Eigene Nebenwachen lesen" on public.kamerad_wehren;

-- Neue SELECT-Policy:
-- Ein Kamerad darf lesen:
--   1. Seine eigenen Zeilen (kamerad_id = eigene ID)
--   2. Alle Zeilen, deren wehr_id zur eigenen Hauptwache gehört
--   3. Alle Zeilen, deren wehr_id zu einer eigenen Nebenwache gehört
create policy "kamerad_wehren_select"
on public.kamerad_wehren
for select
using (
  -- eigene Zeilen
  kamerad_id = auth.uid()
  -- oder die Wache gehört zum angemeldeten Nutzer (Hauptwache)
  or wehr_id in (
    select wehr_id from public.profiles where id = auth.uid()
  )
  -- oder die Wache ist eine Nebenwache des angemeldeten Nutzers
  or wehr_id in (
    select wehr_id from public.kamerad_wehren where kamerad_id = auth.uid()
  )
);

-- INSERT: nur eigene Zeilen anlegen dürfen
drop policy if exists "kamerad_wehren_insert" on public.kamerad_wehren;
create policy "kamerad_wehren_insert"
on public.kamerad_wehren
for insert
with check (
  kamerad_id = auth.uid()
  or exists (
    select 1 from public.profiles
    where id = auth.uid()
    and rolle in ('wehrleiter', 'gemeindebrandmeister', 'admin')
  )
);

-- DELETE: nur eigene Zeilen oder Admins/Wehrleiter
drop policy if exists "kamerad_wehren_delete" on public.kamerad_wehren;
create policy "kamerad_wehren_delete"
on public.kamerad_wehren
for delete
using (
  kamerad_id = auth.uid()
  or exists (
    select 1 from public.profiles
    where id = auth.uid()
    and rolle in ('wehrleiter', 'gemeindebrandmeister', 'admin')
  )
);
