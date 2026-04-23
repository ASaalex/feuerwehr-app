-- ============================================================
-- FEUERWEHR APP – Sicherheitsregeln (Row Level Security)
-- Ausführen NACH 01_schema.sql
-- ============================================================

-- RLS aktivieren
alter table public.profiles              enable row level security;
alter table public.wehren                enable row level security;
alter table public.dokumente             enable row level security;
alter table public.pruefungen            enable row level security;
alter table public.fragen                enable row level security;
alter table public.pruefungs_ergebnisse  enable row level security;
alter table public.aufgaben              enable row level security;

-- ============================================================
-- Hilfsfunktion: Rolle des eingeloggten Nutzers abrufen
-- ============================================================
create or replace function public.get_my_rolle()
returns text language sql security definer stable as $$
  select rolle from public.profiles where id = auth.uid();
$$;

create or replace function public.get_my_status()
returns text language sql security definer stable as $$
  select status from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select rolle in ('wehrleiter','gemeindebrandmeister')
  from public.profiles where id = auth.uid();
$$;

create or replace function public.is_aktiv()
returns boolean language sql security definer stable as $$
  select status = 'aktiv' from public.profiles where id = auth.uid();
$$;

-- ============================================================
-- PROFILES Policies
-- ============================================================
-- Jeder aktive Nutzer sieht alle aktiven Profile (für Aufgaben-Zuweisung)
create policy "Aktive Nutzer sehen alle Profile"
  on public.profiles for select
  using (public.is_aktiv() and status = 'aktiv');

-- Jeder sieht sein eigenes Profil (auch wenn noch ausstehend)
create policy "Eigenes Profil immer sichtbar"
  on public.profiles for select
  using (id = auth.uid());

-- Nur Admins sehen ausstehende Profile
create policy "Admins sehen alle Profile"
  on public.profiles for select
  using (public.is_admin());

-- Nutzer kann eigenes Profil bearbeiten
create policy "Eigenes Profil bearbeiten"
  on public.profiles for update
  using (id = auth.uid());

-- Admin kann alle Profile bearbeiten
create policy "Admin bearbeitet alle Profile"
  on public.profiles for update
  using (public.is_admin());

-- ============================================================
-- WEHREN Policies
-- ============================================================
create policy "Aktive Nutzer sehen Wehren"
  on public.wehren for select
  using (public.is_aktiv());

create policy "Nur Admin verwaltet Wehren"
  on public.wehren for all
  using (public.is_admin());

-- ============================================================
-- DOKUMENTE Policies
-- ============================================================
create policy "Dokumente lesen nach Rolle"
  on public.dokumente for select
  using (
    public.is_aktiv() and
    public.get_my_rolle() = any(sichtbar_fuer)
  );

create policy "Admin und Ausbilder laden Dokumente hoch"
  on public.dokumente for insert
  with check (
    public.is_aktiv() and
    public.get_my_rolle() in ('wehrleiter','gemeindebrandmeister','ausbilder')
  );

create policy "Admin löscht Dokumente"
  on public.dokumente for delete
  using (public.is_admin());

-- ============================================================
-- PRUEFUNGEN Policies
-- ============================================================
create policy "Aktive Nutzer sehen aktive Prüfungen"
  on public.pruefungen for select
  using (public.is_aktiv() and (aktiv = true or public.get_my_rolle() in ('wehrleiter','gemeindebrandmeister','ausbilder')));

create policy "Ausbilder und Admin verwalten Prüfungen"
  on public.pruefungen for all
  using (
    public.is_aktiv() and
    public.get_my_rolle() in ('wehrleiter','gemeindebrandmeister','ausbilder')
  );

-- ============================================================
-- FRAGEN Policies
-- ============================================================
create policy "Aktive Nutzer sehen Fragen"
  on public.fragen for select
  using (public.is_aktiv());

create policy "Ausbilder verwalten Fragen"
  on public.fragen for all
  using (
    public.is_aktiv() and
    public.get_my_rolle() in ('wehrleiter','gemeindebrandmeister','ausbilder')
  );

-- ============================================================
-- PRUEFUNGS_ERGEBNISSE Policies
-- ============================================================
create policy "Nutzer sieht eigene Ergebnisse"
  on public.pruefungs_ergebnisse for select
  using (kamerad_id = auth.uid());

create policy "Admin sieht alle Ergebnisse"
  on public.pruefungs_ergebnisse for select
  using (public.is_admin() or public.get_my_rolle() = 'ausbilder');

create policy "Nutzer legt eigenes Ergebnis ab"
  on public.pruefungs_ergebnisse for insert
  with check (kamerad_id = auth.uid() and public.is_aktiv());

-- ============================================================
-- AUFGABEN Policies
-- ============================================================
create policy "Nutzer sieht eigene Aufgaben"
  on public.aufgaben for select
  using (zugewiesen_an = auth.uid() and public.is_aktiv());

create policy "Admin sieht alle Aufgaben"
  on public.aufgaben for select
  using (public.is_admin() or public.get_my_rolle() = 'gruppenfuehrer');

create policy "Admin erstellt Aufgaben"
  on public.aufgaben for insert
  with check (
    public.is_aktiv() and
    public.get_my_rolle() in ('wehrleiter','gemeindebrandmeister','gruppenfuehrer')
  );

create policy "Admin und Ersteller bearbeiten Aufgaben"
  on public.aufgaben for update
  using (
    public.is_admin() or
    erstellt_von = auth.uid() or
    zugewiesen_an = auth.uid()
  );

create policy "Admin löscht Aufgaben"
  on public.aufgaben for delete
  using (public.is_admin() or erstellt_von = auth.uid());

-- ============================================================
-- STORAGE Bucket für Dokumente
-- (Im Supabase Dashboard unter Storage ausführen)
-- ============================================================
-- insert into storage.buckets (id, name, public) 
--   values ('dokumente', 'dokumente', false);

-- create policy "Aktive Nutzer lesen Dokumente"
--   on storage.objects for select
--   using (bucket_id = 'dokumente' and public.is_aktiv());

-- create policy "Ausbilder laden hoch"
--   on storage.objects for insert
--   with check (
--     bucket_id = 'dokumente' and
--     public.get_my_rolle() in ('wehrleiter','gemeindebrandmeister','ausbilder')
--   );
