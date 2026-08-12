-- ============================================================
-- Migration 26: Live-Quiz (Kahoot-Stil)
-- Ausführen in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ============================================================
-- Profilbild für Kameraden
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS avatar_key text;

-- ============================================================
-- TABELLE: quiz_sessions
-- ============================================================
create table public.quiz_sessions (
  id                  uuid primary key default uuid_generate_v4(),
  code                text not null unique,
  pruefung_id         uuid not null references public.pruefungen(id) on delete cascade,
  erstellt_von        uuid not null references public.profiles(id),
  wehr_id             uuid references public.wehren(id),
  status              text not null default 'lobby'
                        check (status in ('lobby','frage_aktiv','frage_ausgewertet','beendet')),
  aktuelle_frage_index integer not null default 0,
  frage_gestartet_am  timestamptz,
  sekunden_pro_frage  integer not null default 20,
  erstellt_am         timestamptz default now()
);

create index quiz_sessions_code_idx on public.quiz_sessions(code);

-- ============================================================
-- TABELLE: quiz_teilnehmer
-- ============================================================
create table public.quiz_teilnehmer (
  id            uuid primary key default uuid_generate_v4(),
  session_id    uuid not null references public.quiz_sessions(id) on delete cascade,
  profile_id    uuid references public.profiles(id) on delete cascade,
  gast_name     text,
  avatar_key    text,
  punkte        integer not null default 0,
  beigetreten_am timestamptz default now(),
  constraint quiz_teilnehmer_name_check check (profile_id is not null or gast_name is not null)
);

-- Ein eingeloggter Kamerad kann pro Session nur einmal teilnehmen
create unique index quiz_teilnehmer_session_profile_uidx
  on public.quiz_teilnehmer(session_id, profile_id) where profile_id is not null;

-- ============================================================
-- TABELLE: quiz_antworten
-- ============================================================
create table public.quiz_antworten (
  id             uuid primary key default uuid_generate_v4(),
  session_id     uuid not null references public.quiz_sessions(id) on delete cascade,
  teilnehmer_id  uuid not null references public.quiz_teilnehmer(id) on delete cascade,
  frage_id       uuid not null references public.fragen(id) on delete cascade,
  antwort        jsonb,
  richtig        boolean not null default false,
  antwortzeit_ms integer,
  punkte         integer not null default 0,
  erstellt_am    timestamptz default now(),
  unique(teilnehmer_id, frage_id)
);

-- ============================================================
-- Serverseitige Bewertung (verhindert Schummeln über den Client)
-- ============================================================
create or replace function public.quiz_bewerte_antwort()
returns trigger language plpgsql security definer as $$
declare
  f record;
  sess record;
  richtige_texte text[];
  auswahl_arr text[];
  ist_richtig boolean := false;
  elapsed_ms integer;
  limit_ms integer;
  geschw_faktor numeric;
  basis_punkte integer;
begin
  select typ, antworten, punkte into f from public.fragen where id = new.frage_id;
  select frage_gestartet_am, sekunden_pro_frage into sess from public.quiz_sessions where id = new.session_id;

  if f.typ = 'freitext' then
    -- Freitext wird im Live-Quiz nicht automatisch bewertet
    new.richtig := false;
    new.punkte := 0;
    return new;
  end if;

  select array_agg(a->>'text') into richtige_texte
    from jsonb_array_elements(coalesce(f.antworten, '[]'::jsonb)) a
    where (a->>'richtig')::boolean is true;

  if new.antwort is null then
    auswahl_arr := '{}';
  elsif jsonb_typeof(new.antwort) = 'array' then
    select array_agg(x) into auswahl_arr from jsonb_array_elements_text(new.antwort) x;
  else
    auswahl_arr := array[new.antwort#>>'{}'];
  end if;

  if f.typ = 'mehrfachauswahl' then
    ist_richtig := (
      richtige_texte <@ auswahl_arr and auswahl_arr <@ richtige_texte
    );
  else
    ist_richtig := (
      array_length(auswahl_arr, 1) = 1 and auswahl_arr[1] = any(richtige_texte)
    );
  end if;

  limit_ms := coalesce(sess.sekunden_pro_frage, 20) * 1000;
  if sess.frage_gestartet_am is null then
    elapsed_ms := limit_ms;
  else
    elapsed_ms := greatest(0, extract(epoch from (now() - sess.frage_gestartet_am)) * 1000)::integer;
  end if;
  elapsed_ms := least(elapsed_ms, limit_ms);

  basis_punkte := coalesce(f.punkte, 1) * 1000;
  -- Geschwindigkeitsbonus: 100% bei sofortiger Antwort, 50% bei Ausnutzung der vollen Zeit
  geschw_faktor := 1 - (elapsed_ms::numeric / limit_ms::numeric) * 0.5;

  new.richtig := ist_richtig;
  new.antwortzeit_ms := elapsed_ms;
  new.punkte := case when ist_richtig then round(basis_punkte * geschw_faktor) else 0 end;

  return new;
end;
$$;

create trigger quiz_antwort_bewerten
  before insert on public.quiz_antworten
  for each row execute function public.quiz_bewerte_antwort();

create or replace function public.quiz_punkte_gutschreiben()
returns trigger language plpgsql security definer as $$
begin
  update public.quiz_teilnehmer
    set punkte = punkte + new.punkte
    where id = new.teilnehmer_id;
  return new;
end;
$$;

create trigger quiz_antwort_punkte_gutschreiben
  after insert on public.quiz_antworten
  for each row execute function public.quiz_punkte_gutschreiben();

-- ============================================================
-- RLS
-- ============================================================
alter table public.quiz_sessions   enable row level security;
alter table public.quiz_teilnehmer enable row level security;
alter table public.quiz_antworten  enable row level security;

-- quiz_sessions: Zugriff per Code auch ohne Login nötig (Gast-Beitritt, Anzeige)
create policy "Jeder liest Quiz-Sessions"
  on public.quiz_sessions for select
  using (true);

create policy "Ausbilder und Admin starten Quiz-Sessions"
  on public.quiz_sessions for insert
  with check (
    public.is_aktiv() and
    public.get_my_rolle() in ('wehrleiter','gemeindebrandmeister','ausbilder') and
    erstellt_von = auth.uid()
  );

create policy "Ersteller steuert eigene Quiz-Session"
  on public.quiz_sessions for update
  using (erstellt_von = auth.uid());

create policy "Ersteller und Admin löschen Quiz-Session"
  on public.quiz_sessions for delete
  using (erstellt_von = auth.uid() or public.is_admin());

-- quiz_teilnehmer: Gäste (anon) müssen beitreten und den Live-Stand sehen können
create policy "Jeder liest Teilnehmerliste"
  on public.quiz_teilnehmer for select
  using (true);

create policy "Beitritt nur waehrend Lobby"
  on public.quiz_teilnehmer for insert
  with check (
    (profile_id is null or profile_id = auth.uid())
    and exists (
      select 1 from public.quiz_sessions s
      where s.id = session_id and s.status = 'lobby'
    )
  );

create policy "Ersteller entfernt Teilnehmer"
  on public.quiz_teilnehmer for delete
  using (
    exists (select 1 from public.quiz_sessions s where s.id = session_id and s.erstellt_von = auth.uid())
  );

-- quiz_antworten: Bewertung läuft serverseitig über den Trigger, Client liefert nur die Auswahl
create policy "Jeder liest Antworten"
  on public.quiz_antworten for select
  using (true);

create policy "Teilnehmer reicht eigene Antwort ein"
  on public.quiz_antworten for insert
  with check (
    exists (
      select 1 from public.quiz_teilnehmer t
      where t.id = teilnehmer_id
        and (t.profile_id is null or t.profile_id = auth.uid())
    )
    and exists (
      select 1 from public.quiz_sessions s
      where s.id = session_id and s.status = 'frage_aktiv'
    )
  );

-- ============================================================
-- Oeffentliche Fragen-Sicht fuer Teilnehmer (auch Gaeste ohne Login)
-- Zeigt nur Fragen aktiver/abgeschlossener Quiz-Sessions und OHNE die
-- "richtig"-Markierung — verhindert, dass die Loesung im Netzwerk-Payload
-- sichtbar ist, bevor die Frage ausgewertet wurde.
-- ============================================================
create or replace view public.fragen_oeffentlich as
select
  f.id, f.pruefung_id, f.frage_text, f.typ, f.punkte, f.reihenfolge,
  (
    select jsonb_agg(elem - 'richtig' order by ord)
    from jsonb_array_elements(coalesce(f.antworten, '[]'::jsonb)) with ordinality as t(elem, ord)
  ) as antworten
from public.fragen f
where f.typ <> 'freitext'
  and exists (
    select 1 from public.quiz_sessions s
    where s.pruefung_id = f.pruefung_id and s.status <> 'lobby'
  );

grant select on public.fragen_oeffentlich to anon, authenticated;

-- Gaeste (auch ohne Login) duerfen den Titel einer Pruefung sehen, zu der
-- bereits eine Quiz-Session existiert (Code muss ohnehin bekannt sein)
create policy "Gaeste sehen Pruefung aktiver Quiz-Sessions"
  on public.pruefungen for select
  using (
    exists (select 1 from public.quiz_sessions s where s.pruefung_id = pruefungen.id)
  );

-- ============================================================
-- Realtime aktivieren (Live-Sync fuer Host- und Teilnehmer-Ansicht)
-- ============================================================
alter publication supabase_realtime add table public.quiz_sessions;
alter publication supabase_realtime add table public.quiz_teilnehmer;
alter publication supabase_realtime add table public.quiz_antworten;

-- ============================================================
-- STORAGE Bucket für Profilbilder / Avatare
-- (Im Supabase Dashboard unter Storage ausführen bzw. dort pruefen, ob bereits vorhanden)
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('avatare', 'avatare', true)
  on conflict (id) do nothing;

create policy "Jeder liest Avatare"
  on storage.objects for select
  using (bucket_id = 'avatare');

create policy "Nutzer laedt eigenes Profilbild hoch"
  on storage.objects for insert
  with check (bucket_id = 'avatare' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Nutzer aktualisiert eigenes Profilbild"
  on storage.objects for update
  using (bucket_id = 'avatare' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Nutzer loescht eigenes Profilbild"
  on storage.objects for delete
  using (bucket_id = 'avatare' and (storage.foldername(name))[1] = auth.uid()::text);
