-- ============================================================
-- Migration 11: Einsatz-Simulations-Chatbot
--   - szenarien        : Vordefinierte Einsatzszenarien
--   - uebungs_sessions : Gespeicherte Übungssessions je Kamerad
--
-- Einmalig im Supabase SQL-Editor ausführen.
-- ============================================================

-- ── Tabellen ─────────────────────────────────────────────────

create table if not exists public.szenarien (
  id                uuid primary key default gen_random_uuid(),
  titel             text not null,
  kategorie         text not null,
  -- Kategorie-Werte: 'verkehrsunfall' | 'wohnungsbrand' | 'technische_hilfeleistung'
  --                  | 'gefahrgut' | 'waldbrand' | 'sonstiges'
  anfangs_meldung   text not null,
  -- Text der Alarmierungsmeldung, die dem Kamerad gezeigt wird
  beschreibung      text,
  -- Interne Beschreibung für Ausbilder (nicht sichtbar für Kameraden)
  schwierigkeitsgrad text not null default 'mittel',
  -- 'leicht' | 'mittel' | 'schwer'
  aktiv             boolean not null default true,
  erstellt_von      uuid references public.profiles(id) on delete set null,
  erstellt_am       timestamptz not null default now()
);

create table if not exists public.uebungs_sessions (
  id               uuid primary key default gen_random_uuid(),
  kamerad_id       uuid not null references public.profiles(id) on delete cascade,
  szenario_id      uuid references public.szenarien(id) on delete set null,
  szenario_titel   text,
  -- Gecachter Titel, bleibt erhalten auch wenn Szenario gelöscht wird
  nachrichten      jsonb not null default '[]'::jsonb,
  -- [{role: 'user'|'assistant', content: '...', ts: '...'}]
  abgeschlossen    boolean not null default false,
  erstellt_am      timestamptz not null default now(),
  beendet_am       timestamptz
);

-- Indizes
create index if not exists idx_uebungs_sessions_kamerad on public.uebungs_sessions(kamerad_id);
create index if not exists idx_uebungs_sessions_szenario on public.uebungs_sessions(szenario_id);
create index if not exists idx_szenarien_aktiv on public.szenarien(aktiv);

-- ── GRANTs ───────────────────────────────────────────────────

grant select, insert, update, delete on public.szenarien to authenticated;
grant select, insert, update, delete on public.szenarien to service_role;

grant select, insert, update, delete on public.uebungs_sessions to authenticated;
grant select, insert, update, delete on public.uebungs_sessions to service_role;

-- ── RLS ──────────────────────────────────────────────────────

alter table public.szenarien enable row level security;
alter table public.uebungs_sessions enable row level security;

-- szenarien: alle authentifizierten Nutzer dürfen lesen
drop policy if exists "szenarien_select" on public.szenarien;
create policy "szenarien_select" on public.szenarien
  for select using (auth.role() = 'authenticated');

-- szenarien: nur Wehrleiter, Ausbilder, GBM dürfen schreiben
drop policy if exists "szenarien_insert" on public.szenarien;
create policy "szenarien_insert" on public.szenarien
  for insert with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and rolle in ('wehrleiter', 'gemeindebrandmeister', 'ausbilder')
    )
  );

drop policy if exists "szenarien_update" on public.szenarien;
create policy "szenarien_update" on public.szenarien
  for update using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and rolle in ('wehrleiter', 'gemeindebrandmeister', 'ausbilder')
    )
  );

drop policy if exists "szenarien_delete" on public.szenarien;
create policy "szenarien_delete" on public.szenarien
  for delete using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and rolle in ('wehrleiter', 'gemeindebrandmeister', 'ausbilder')
    )
  );

-- uebungs_sessions: jeder liest/schreibt nur seine eigenen Sessions
drop policy if exists "uebungs_sessions_select" on public.uebungs_sessions;
create policy "uebungs_sessions_select" on public.uebungs_sessions
  for select using (
    kamerad_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
      and rolle in ('wehrleiter', 'gemeindebrandmeister', 'ausbilder')
    )
  );

drop policy if exists "uebungs_sessions_insert" on public.uebungs_sessions;
create policy "uebungs_sessions_insert" on public.uebungs_sessions
  for insert with check (kamerad_id = auth.uid());

drop policy if exists "uebungs_sessions_update" on public.uebungs_sessions;
create policy "uebungs_sessions_update" on public.uebungs_sessions
  for update using (
    kamerad_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
      and rolle in ('wehrleiter', 'gemeindebrandmeister', 'ausbilder')
    )
  );

drop policy if exists "uebungs_sessions_delete" on public.uebungs_sessions;
create policy "uebungs_sessions_delete" on public.uebungs_sessions
  for delete using (kamerad_id = auth.uid());

-- ── Seed-Daten: Standard-Szenarien ───────────────────────────

insert into public.szenarien (titel, kategorie, schwierigkeitsgrad, anfangs_meldung, beschreibung) values

(
  'Verkehrsunfall mit eingeklemmter Person',
  'verkehrsunfall',
  'mittel',
  'ALARMIERUNG: Verkehrsunfall mit eingeklemmter Person auf der B7 zwischen Nohra und Hopfgarten, Höhe Abfahrt Gutendorf. PKW überschlagen, 1 Person im Fahrzeug eingeklemmt, Ersthelfer vor Ort. Weitere Kräfte: Rettungsdienst (ETA 6 min), Polizei angefordert.',
  'Klassischer VU mit Eingeklemmten. Prüft Eigenschutz, Absicherung, Patientenversorgung, Zusammenarbeit Rettungsdienst.'
),

(
  'Wohnungsbrand im Erdgeschoss',
  'wohnungsbrand',
  'mittel',
  'ALARMIERUNG: Zimmerbrand in der Hauptstraße 12 in Nohra, zweigeschossiges Wohnhaus. Rauchentwicklung aus dem Erdgeschoss, Anwohner melden Flammen sichtbar. Laut Meldung 3 Personen im Gebäude, 1 Person konnte sich selbst befreien. Weiteres Fahrzeug aus Isseroda wird nachgefordert.',
  'Wohnungsbrand mit Menschenleben in Gefahr. Prüft Erstmaßnahmen, Atemschutzeinsatz, Personensuche, Riegelstellung.'
),

(
  'Waldbrand - Ausgedehnter Flächenbrand',
  'waldbrand',
  'schwer',
  'ALARMIERUNG: Flächenbrand im Waldgebiet südlich von Grammetal, Nähe Forstweg "Langer Grund". Geschätzte Fläche 2 ha, starke Rauchentwicklung. Wind aus SW mit ca. 20 km/h. Kein Löschwasser in unmittelbarer Nähe. Weitere Einsatzkräfte aus dem Landkreis Weimarer Land werden alarmiert.',
  'Waldbrand mit Wasserversorgungsproblem. Prüft Windrichtung, Pendelverkehr, Nachforderung, Riegellinie.'
),

(
  'Gefahrgutunfall auf der Autobahn',
  'gefahrgut',
  'schwer',
  'ALARMIERUNG: LKW-Unfall auf der A4 Richtung Erfurt, Höhe Ausfahrt Nohra. LKW liegt auf der Seite, orangefarbene Warntafel sichtbar: Nummer 1203 (Kraftstoff). Austretende Flüssigkeit, kein Feuer. Fahrer meldet sich nicht. Autobahn teilgesperrt durch Polizei.',
  'Gefahrgut UN 1203 (Benzin). Prüft Sicherheitsabstand, Kennzeichnungslesung, Windrichtung, Schadensabwehr.'
),

(
  'Sturmschaden - Baum auf Fahrbahn',
  'technische_hilfeleistung',
  'leicht',
  'ALARMIERUNG: Sturmschaden in der Dorfstraße Isseroda. Baum auf Fahrbahn umgestürzt, Straße vollständig blockiert. Keine Verletzten gemeldet. Strom- und Telefonleitungen möglicherweise betroffen.',
  'Einfache technische Hilfeleistung. Einstieg für neue Kameraden. Prüft Absicherung, Leitungen, Motorsäge-Einsatz.'
),

(
  'Kellerbrand mit verqualmtem Treppenhaus',
  'wohnungsbrand',
  'schwer',
  'ALARMIERUNG: Kellerbrand in einem 4-geschossigen Mehrfamilienhaus, Ringstraße 7 in Nohra. Starke Rauchentwicklung aus dem Kellerbereich, Rauch im gesamten Treppenhaus. Mehrere Bewohner melden sich an Fenstern (3. OG, 2x 2. OG). Rauchmelder aktiviert.',
  'Schwieriger Kellerbrand mit vermissten Personen. Prüft Personenrettung vs. Brandbekämpfung, PA-Einsatz, Riegelstellung Treppenhaus.'
)

on conflict do nothing;
