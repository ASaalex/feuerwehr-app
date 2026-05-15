-- ============================================================
-- Migration 13: KI-Guthaben fuer Einsatz-Simulation
--
-- Jeder Kamerad hat ein Guthaben in Eurocent.
-- Der Admin laedt Guthaben auf, die KI-Edge-Function bucht ab.
-- Einmalig im Supabase SQL-Editor ausfuehren.
-- ============================================================

-- Guthaben-Spalte in profiles
alter table public.profiles
  add column if not exists ki_guthaben_cent integer not null default 0;

-- Transaktions-Tabelle fuer Audit-Trail
create table if not exists public.ki_transaktionen (
  id            uuid primary key default gen_random_uuid(),
  kamerad_id    uuid not null references public.profiles(id) on delete cascade,
  betrag_cent   integer not null,  -- positiv = Aufladung, negativ = Abbuchung
  typ           text not null check (typ in ('aufladung', 'abbuchung')),
  beschreibung  text,
  session_id    uuid references public.uebungs_sessions(id) on delete set null,
  erstellt_von  uuid references public.profiles(id) on delete set null,
  erstellt_am   timestamptz not null default now()
);

create index if not exists idx_ki_transaktionen_kamerad on public.ki_transaktionen(kamerad_id);
create index if not exists idx_ki_transaktionen_am on public.ki_transaktionen(erstellt_am desc);

-- GRANTs
grant select, insert on public.ki_transaktionen to authenticated;
grant select, insert, update on public.ki_transaktionen to service_role;

-- RLS
alter table public.ki_transaktionen enable row level security;

-- Kamerad sieht nur eigene Transaktionen
drop policy if exists "ki_transaktionen_select_eigen" on public.ki_transaktionen;
create policy "ki_transaktionen_select_eigen" on public.ki_transaktionen
  for select using (kamerad_id = auth.uid());

-- Wehrleiter/GBM sehen alle
drop policy if exists "ki_transaktionen_select_admin" on public.ki_transaktionen;
create policy "ki_transaktionen_select_admin" on public.ki_transaktionen
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and rolle in ('wehrleiter', 'gemeindebrandmeister')
    )
  );

-- Aufladungen duerfen nur Admins einfuegen
drop policy if exists "ki_transaktionen_insert_admin" on public.ki_transaktionen;
create policy "ki_transaktionen_insert_admin" on public.ki_transaktionen
  for insert with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and rolle in ('wehrleiter', 'gemeindebrandmeister')
    )
  );
