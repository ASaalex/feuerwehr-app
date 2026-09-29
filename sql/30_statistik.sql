-- ============================================================
-- Migration 30: Statistik (Einsatzauswertung)
--
-- 1. Fahrzeuge bekommen eine eigene Tabelle (statt wehren.fahrzeuge
--    als reines String-Array) inkl. Inventarnummer.
-- 2. Neue Tabellen fuer den PDF-Import der Gemeinde-Einsatzliste:
--    statistik_einsaetze (Kopfdaten je Einsatz),
--    statistik_einsatz_fahrzeuge (beteiligte Fahrzeuge je Einsatz),
--    statistik_einsatz_personal (beteiligte Kameraden je Einsatz).
--
-- Einmalig im Supabase SQL-Editor ausfuehren.
-- ============================================================

-- ============================================================
-- 1. Fahrzeuge-Tabelle
-- ============================================================

create table if not exists public.fahrzeuge (
  id              uuid primary key default gen_random_uuid(),
  wehr_id         uuid not null references public.wehren(id) on delete cascade,
  name            text not null,
  inventarnummer  text,
  sortierung      integer not null default 0,
  erstellt_am     timestamptz not null default now()
);

create index if not exists idx_fahrzeuge_wehr on public.fahrzeuge(wehr_id);

-- Bestehende wehren.fahrzeuge (text[]) einmalig uebernehmen,
-- nur fuer Wachen die noch keine Zeilen in der neuen Tabelle haben.
insert into public.fahrzeuge (wehr_id, name, sortierung)
select w.id, t.elem, (t.ord - 1)::int
from public.wehren w
cross join lateral unnest(coalesce(w.fahrzeuge, array[]::text[])) with ordinality as t(elem, ord)
where w.fahrzeuge is not null
  and array_length(w.fahrzeuge, 1) > 0
  and not exists (select 1 from public.fahrzeuge f where f.wehr_id = w.id);

-- Alte Spalte wird von WachenPage/AuthContext nicht mehr genutzt
alter table public.wehren drop column if exists fahrzeuge;

grant select, insert, update, delete on public.fahrzeuge to authenticated;
grant select, insert, update, delete on public.fahrzeuge to service_role;

alter table public.fahrzeuge enable row level security;

-- SELECT: Kameraden der eigenen Wache oder GBM (wird u.a. im Einsatzbericht gebraucht)
drop policy if exists "fahrzeuge_select" on public.fahrzeuge;
create policy "fahrzeuge_select" on public.fahrzeuge
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'aktiv'
        and (p.wehr_id = fahrzeuge.wehr_id or p.rolle = 'gemeindebrandmeister')
    )
  );

-- INSERT/UPDATE/DELETE: nur GBM (WachenPage ist GbmRoute-geschuetzt)
drop policy if exists "fahrzeuge_insert" on public.fahrzeuge;
create policy "fahrzeuge_insert" on public.fahrzeuge
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and rolle = 'gemeindebrandmeister')
  );

drop policy if exists "fahrzeuge_update" on public.fahrzeuge;
create policy "fahrzeuge_update" on public.fahrzeuge
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and rolle = 'gemeindebrandmeister')
  );

drop policy if exists "fahrzeuge_delete" on public.fahrzeuge;
create policy "fahrzeuge_delete" on public.fahrzeuge
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and rolle = 'gemeindebrandmeister')
  );

-- ============================================================
-- 2. Statistik: importierte Gemeinde-Einsatzliste
-- ============================================================

create table if not exists public.statistik_einsaetze (
  id                uuid primary key default gen_random_uuid(),
  einsatznummer     text not null unique,
  datum             date not null,
  alarmzeit         text,
  stichwort         text,
  einsatzort        text,
  importiert_von    uuid references public.profiles(id) on delete set null,
  importiert_am     timestamptz not null default now(),
  quelle_dateiname  text
);

create index if not exists idx_statistik_einsaetze_datum on public.statistik_einsaetze(datum);

create table if not exists public.statistik_einsatz_fahrzeuge (
  id                  uuid primary key default gen_random_uuid(),
  einsatz_id          uuid not null references public.statistik_einsaetze(id) on delete cascade,
  fahrzeug_name_pdf   text not null,
  inventarnummer_pdf  text,
  fahrzeug_id         uuid references public.fahrzeuge(id) on delete set null,
  wehr_id             uuid references public.wehren(id) on delete set null,
  zeit_alarmiert      text,
  zeit_ende           text,
  minuten             integer
);

create index if not exists idx_statistik_ef_einsatz on public.statistik_einsatz_fahrzeuge(einsatz_id);
create index if not exists idx_statistik_ef_wehr on public.statistik_einsatz_fahrzeuge(wehr_id);

create table if not exists public.statistik_einsatz_personal (
  id                  uuid primary key default gen_random_uuid(),
  einsatz_id          uuid not null references public.statistik_einsaetze(id) on delete cascade,
  name_pdf            text not null,
  profile_id          uuid references public.profiles(id) on delete set null,
  wehr_id             uuid references public.wehren(id) on delete set null,
  fahrzeug_name_pdf   text,
  zeit_alarmiert      text,
  zeit_ende           text,
  minuten             integer
);

create index if not exists idx_statistik_ep_einsatz on public.statistik_einsatz_personal(einsatz_id);
create index if not exists idx_statistik_ep_wehr on public.statistik_einsatz_personal(wehr_id);
create index if not exists idx_statistik_ep_profile on public.statistik_einsatz_personal(profile_id);

grant select, insert, update, delete on public.statistik_einsaetze to authenticated;
grant select, insert, update, delete on public.statistik_einsaetze to service_role;
grant select, insert, update, delete on public.statistik_einsatz_fahrzeuge to authenticated;
grant select, insert, update, delete on public.statistik_einsatz_fahrzeuge to service_role;
grant select, insert, update, delete on public.statistik_einsatz_personal to authenticated;
grant select, insert, update, delete on public.statistik_einsatz_personal to service_role;

alter table public.statistik_einsaetze enable row level security;
alter table public.statistik_einsatz_fahrzeuge enable row level security;
alter table public.statistik_einsatz_personal enable row level security;

-- ---- statistik_einsaetze ----

-- GBM sieht alle importierten Einsaetze (Gemeinde-weit)
drop policy if exists "statistik_einsaetze_select_gbm" on public.statistik_einsaetze;
create policy "statistik_einsaetze_select_gbm" on public.statistik_einsaetze
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and status = 'aktiv' and rolle = 'gemeindebrandmeister')
  );

-- Wehrleiter/Gruppenfuehrer sehen nur Einsaetze, an denen ihre Wache beteiligt war
drop policy if exists "statistik_einsaetze_select_wache" on public.statistik_einsaetze;
create policy "statistik_einsaetze_select_wache" on public.statistik_einsaetze
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'aktiv' and p.rolle in ('wehrleiter', 'gruppenfuehrer')
        and (
          exists (select 1 from public.statistik_einsatz_fahrzeuge f where f.einsatz_id = statistik_einsaetze.id and f.wehr_id = p.wehr_id)
          or exists (select 1 from public.statistik_einsatz_personal pe where pe.einsatz_id = statistik_einsaetze.id and pe.wehr_id = p.wehr_id)
        )
    )
  );

drop policy if exists "statistik_einsaetze_insert" on public.statistik_einsaetze;
create policy "statistik_einsaetze_insert" on public.statistik_einsaetze
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and rolle = 'gemeindebrandmeister')
  );

drop policy if exists "statistik_einsaetze_update" on public.statistik_einsaetze;
create policy "statistik_einsaetze_update" on public.statistik_einsaetze
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and rolle = 'gemeindebrandmeister')
  );

drop policy if exists "statistik_einsaetze_delete" on public.statistik_einsaetze;
create policy "statistik_einsaetze_delete" on public.statistik_einsaetze
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and rolle = 'gemeindebrandmeister')
  );

-- ---- statistik_einsatz_fahrzeuge ----

drop policy if exists "statistik_ef_select_gbm" on public.statistik_einsatz_fahrzeuge;
create policy "statistik_ef_select_gbm" on public.statistik_einsatz_fahrzeuge
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and status = 'aktiv' and rolle = 'gemeindebrandmeister')
  );

drop policy if exists "statistik_ef_select_wache" on public.statistik_einsatz_fahrzeuge;
create policy "statistik_ef_select_wache" on public.statistik_einsatz_fahrzeuge
  for select using (
    wehr_id in (
      select wehr_id from public.profiles
      where id = auth.uid() and status = 'aktiv' and rolle in ('wehrleiter', 'gruppenfuehrer')
    )
  );

drop policy if exists "statistik_ef_insert" on public.statistik_einsatz_fahrzeuge;
create policy "statistik_ef_insert" on public.statistik_einsatz_fahrzeuge
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and rolle = 'gemeindebrandmeister')
  );

drop policy if exists "statistik_ef_update" on public.statistik_einsatz_fahrzeuge;
create policy "statistik_ef_update" on public.statistik_einsatz_fahrzeuge
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and rolle = 'gemeindebrandmeister')
  );

drop policy if exists "statistik_ef_delete" on public.statistik_einsatz_fahrzeuge;
create policy "statistik_ef_delete" on public.statistik_einsatz_fahrzeuge
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and rolle = 'gemeindebrandmeister')
  );

-- ---- statistik_einsatz_personal ----

drop policy if exists "statistik_ep_select_gbm" on public.statistik_einsatz_personal;
create policy "statistik_ep_select_gbm" on public.statistik_einsatz_personal
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and status = 'aktiv' and rolle = 'gemeindebrandmeister')
  );

drop policy if exists "statistik_ep_select_wache" on public.statistik_einsatz_personal;
create policy "statistik_ep_select_wache" on public.statistik_einsatz_personal
  for select using (
    wehr_id in (
      select wehr_id from public.profiles
      where id = auth.uid() and status = 'aktiv' and rolle in ('wehrleiter', 'gruppenfuehrer')
    )
  );

drop policy if exists "statistik_ep_insert" on public.statistik_einsatz_personal;
create policy "statistik_ep_insert" on public.statistik_einsatz_personal
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and rolle = 'gemeindebrandmeister')
  );

drop policy if exists "statistik_ep_update" on public.statistik_einsatz_personal;
create policy "statistik_ep_update" on public.statistik_einsatz_personal
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and rolle = 'gemeindebrandmeister')
  );

drop policy if exists "statistik_ep_delete" on public.statistik_einsatz_personal;
create policy "statistik_ep_delete" on public.statistik_einsatz_personal
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and rolle = 'gemeindebrandmeister')
  );

-- ============================================================
-- Storage-Bucket fuer die Original-PDFs (Audit-Trail)
--
-- WICHTIG: Zuerst im Supabase-Dashboard anlegen:
-- Storage → New Bucket → Name: "statistik-import" → Private → Save
-- Dann diese Policies hier ausfuehren.
-- ============================================================

drop policy if exists "statistik_import_storage_select" on storage.objects;
create policy "statistik_import_storage_select"
  on storage.objects for select
  using (
    bucket_id = 'statistik-import'
    and exists (select 1 from public.profiles where id = auth.uid() and rolle = 'gemeindebrandmeister')
  );

drop policy if exists "statistik_import_storage_insert" on storage.objects;
create policy "statistik_import_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'statistik-import'
    and exists (select 1 from public.profiles where id = auth.uid() and rolle = 'gemeindebrandmeister')
  );

drop policy if exists "statistik_import_storage_delete" on storage.objects;
create policy "statistik_import_storage_delete"
  on storage.objects for delete
  using (
    bucket_id = 'statistik-import'
    and exists (select 1 from public.profiles where id = auth.uid() and rolle = 'gemeindebrandmeister')
  );
