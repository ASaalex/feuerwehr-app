-- ============================================================
-- FEUERWEHR APP – Datenbankschema
-- Ausführen in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Erweiterungen
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABELLE: wehren
-- ============================================================
create table public.wehren (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  ort         text,
  erstellt_am timestamptz default now()
);

-- Standardwehr eintragen (anpassen!)
insert into public.wehren (name, ort) values ('Feuerwehr Musterstadt', 'Musterstadt');

-- ============================================================
-- TABELLE: profiles
-- Wird automatisch bei Registrierung befüllt
-- ============================================================
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  vorname        text not null default '',
  nachname       text not null default '',
  email          text,
  telefon        text,
  geburtsdatum   date,
  eintrittsdatum date,
  fuehrerschein  text[] default '{}',
  atemschutz     boolean default false,
  rolle          text not null default 'kamerad'
                   check (rolle in ('gemeindebrandmeister','wehrleiter','gruppenfuehrer','ausbilder','kamerad')),
  status         text not null default 'ausstehend'
                   check (status in ('ausstehend','aktiv','inaktiv')),
  wehr_id        uuid references public.wehren(id),
  erstellt_am    timestamptz default now(),
  aktualisiert_am timestamptz default now()
);

-- ============================================================
-- TABELLE: dokumente
-- ============================================================
create table public.dokumente (
  id              uuid primary key default uuid_generate_v4(),
  titel           text not null,
  beschreibung    text,
  kategorie       text not null
                    check (kategorie in ('dienstanweisung','vorlage','ausbildung','sonstiges')),
  datei_pfad      text not null,
  datei_name      text not null,
  datei_groesse   bigint,
  sichtbar_fuer   text[] default '{"gemeindebrandmeister","wehrleiter","gruppenfuehrer","ausbilder","kamerad"}',
  wehr_id         uuid references public.wehren(id),
  hochgeladen_von uuid references public.profiles(id),
  erstellt_am     timestamptz default now()
);

-- ============================================================
-- TABELLE: pruefungen
-- ============================================================
create table public.pruefungen (
  id            uuid primary key default uuid_generate_v4(),
  titel         text not null,
  beschreibung  text,
  dokument_id   uuid references public.dokumente(id) on delete set null,
  erstellt_von  uuid references public.profiles(id),
  wehr_id       uuid references public.wehren(id),
  aktiv         boolean default false,
  bestehens_prozent integer default 70,
  erstellt_am   timestamptz default now()
);

-- ============================================================
-- TABELLE: fragen
-- ============================================================
create table public.fragen (
  id           uuid primary key default uuid_generate_v4(),
  pruefung_id  uuid not null references public.pruefungen(id) on delete cascade,
  frage_text   text not null,
  typ          text not null
                 check (typ in ('multiple_choice','wahr_falsch','freitext')),
  -- Für multiple_choice/wahr_falsch: [{"text":"Antwort A","richtig":true}, ...]
  antworten    jsonb default '[]',
  punkte       integer default 1,
  reihenfolge  integer default 0
);

-- ============================================================
-- TABELLE: pruefungs_ergebnisse
-- ============================================================
create table public.pruefungs_ergebnisse (
  id               uuid primary key default uuid_generate_v4(),
  kamerad_id       uuid not null references public.profiles(id) on delete cascade,
  pruefung_id      uuid not null references public.pruefungen(id) on delete cascade,
  punkte_erreicht  integer not null default 0,
  punkte_gesamt    integer not null default 0,
  bestanden        boolean not null default false,
  antworten_detail jsonb default '{}',
  abgelegt_am      timestamptz default now(),
  unique(kamerad_id, pruefung_id)
);

-- ============================================================
-- TABELLE: aufgaben
-- ============================================================
create table public.aufgaben (
  id             uuid primary key default uuid_generate_v4(),
  titel          text not null,
  beschreibung   text,
  zugewiesen_an  uuid references public.profiles(id) on delete set null,
  erstellt_von   uuid not null references public.profiles(id),
  wehr_id        uuid references public.wehren(id),
  faellig_am     date,
  prioritaet     text default 'mittel'
                   check (prioritaet in ('niedrig','mittel','hoch')),
  status         text default 'offen'
                   check (status in ('offen','in_arbeit','erledigt')),
  erstellt_am    timestamptz default now(),
  aktualisiert_am timestamptz default now()
);

-- ============================================================
-- AUTOMATISCHER TRIGGER: profile bei Registrierung anlegen
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  erste_wehr_id uuid;
begin
  select id into erste_wehr_id from public.wehren limit 1;

  insert into public.profiles (id, email, wehr_id)
  values (
    new.id,
    new.email,
    erste_wehr_id
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- TRIGGER: aktualisiert_am automatisch setzen
-- ============================================================
create or replace function public.set_aktualisiert_am()
returns trigger language plpgsql as $$
begin
  new.aktualisiert_am = now();
  return new;
end;
$$;

create trigger profiles_aktualisiert
  before update on public.profiles
  for each row execute procedure public.set_aktualisiert_am();

create trigger aufgaben_aktualisiert
  before update on public.aufgaben
  for each row execute procedure public.set_aktualisiert_am();
