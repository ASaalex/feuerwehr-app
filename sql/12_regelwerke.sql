-- ============================================================
-- Migration 12: Regelwerke fuer KI-Ausbildungschatbot
--
-- Admins laden PDFs hoch, Text wird client-seitig extrahiert
-- und hier gespeichert. Die Edge Function laedt die Texte
-- und gibt sie der KI als exakten Regelwerk-Kontext.
--
-- Einmalig im Supabase SQL-Editor ausfuehren.
-- ============================================================

create table if not exists public.regelwerke (
  id           uuid primary key default gen_random_uuid(),
  titel        text not null,
  beschreibung text,
  datei_pfad   text,
  datei_name   text,
  inhalt_text  text,
  -- Extrahierter Volltext des PDFs (wird client-seitig befuellt)
  aktiv        boolean not null default true,
  erstellt_von uuid references public.profiles(id) on delete set null,
  erstellt_am  timestamptz not null default now()
);

create index if not exists idx_regelwerke_aktiv on public.regelwerke(aktiv);

-- GRANTs
grant select, insert, update, delete on public.regelwerke to authenticated;
grant select, insert, update, delete on public.regelwerke to service_role;

-- RLS
alter table public.regelwerke enable row level security;

-- Alle authentifizierten Nutzer duerfen lesen
drop policy if exists "regelwerke_select" on public.regelwerke;
create policy "regelwerke_select" on public.regelwerke
  for select using (auth.role() = 'authenticated');

-- Nur Wehrleiter / Ausbilder / GBM duerfen schreiben
drop policy if exists "regelwerke_insert" on public.regelwerke;
create policy "regelwerke_insert" on public.regelwerke
  for insert with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and rolle in ('wehrleiter', 'gemeindebrandmeister', 'ausbilder')
    )
  );

drop policy if exists "regelwerke_update" on public.regelwerke;
create policy "regelwerke_update" on public.regelwerke
  for update using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and rolle in ('wehrleiter', 'gemeindebrandmeister', 'ausbilder')
    )
  );

drop policy if exists "regelwerke_delete" on public.regelwerke;
create policy "regelwerke_delete" on public.regelwerke
  for delete using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and rolle in ('wehrleiter', 'gemeindebrandmeister', 'ausbilder')
    )
  );

-- ============================================================
-- Storage-Bucket-Policies fuer den "regelwerke"-Bucket
--
-- WICHTIG: Zuerst den Bucket im Supabase-Dashboard anlegen:
-- Storage → New Bucket → Name: "regelwerke" → Private → Save
--
-- Dann diese Policies hier ausfuehren.
-- ============================================================

drop policy if exists "regelwerke_storage_select" on storage.objects;
create policy "regelwerke_storage_select"
  on storage.objects for select
  using (bucket_id = 'regelwerke' and auth.role() = 'authenticated');

drop policy if exists "regelwerke_storage_insert" on storage.objects;
create policy "regelwerke_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'regelwerke'
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
      and rolle in ('wehrleiter', 'gemeindebrandmeister', 'ausbilder')
    )
  );

drop policy if exists "regelwerke_storage_delete" on storage.objects;
create policy "regelwerke_storage_delete"
  on storage.objects for delete
  using (
    bucket_id = 'regelwerke'
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
      and rolle in ('wehrleiter', 'gemeindebrandmeister', 'ausbilder')
    )
  );
