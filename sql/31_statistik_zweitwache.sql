-- ============================================================
-- Migration 31: Zweitwachen-Kameraden in der Statistik beruecksichtigen
--
-- Bisher wurde beim Import statistik_einsatz_personal.wehr_id nur auf die
-- Hauptwache (profiles.wehr_id) des erkannten Kameraden gesetzt, und die
-- Wehrleiter/Gruppenfuehrer-Sichtbarkeit (RLS) hat exakt gegen diese Spalte
-- geprueft. Kameraden, die einer Wache nur als Nebenwache/Zweitwache
-- zugeordnet sind (Tabelle kamerad_wehren, siehe 10_kamerad_wehren_rls.sql),
-- waren dadurch in der Kameraden-Statistik dieser Wache unsichtbar.
--
-- Diese Migration stellt auf profil-basierte Sichtbarkeit um: sichtbar ist
-- eine Personal-Zeile fuer einen Wehrleiter/Gruppenfuehrer, wenn der
-- zugeordnete Kamerad zur eigenen Wache gehoert — als Haupt- ODER Nebenwache.
--
-- Einmalig im Supabase SQL-Editor ausfuehren.
-- ============================================================

drop policy if exists "statistik_ep_select_wache" on public.statistik_einsatz_personal;
create policy "statistik_ep_select_wache" on public.statistik_einsatz_personal
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'aktiv' and p.rolle in ('wehrleiter', 'gruppenfuehrer')
        and profile_id in (
          select id from public.profiles where wehr_id = p.wehr_id
          union
          select kamerad_id from public.kamerad_wehren where wehr_id = p.wehr_id
        )
    )
  );

-- Die uebergeordnete Einsatz-Sichtbarkeit muss denselben Zweitwachen-Fall
-- ebenfalls als "Wache beteiligt" werten (sonst fehlt der ganze Einsatz).
drop policy if exists "statistik_einsaetze_select_wache" on public.statistik_einsaetze;
create policy "statistik_einsaetze_select_wache" on public.statistik_einsaetze
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'aktiv' and p.rolle in ('wehrleiter', 'gruppenfuehrer')
        and (
          exists (select 1 from public.statistik_einsatz_fahrzeuge f where f.einsatz_id = statistik_einsaetze.id and f.wehr_id = p.wehr_id)
          or exists (
            select 1 from public.statistik_einsatz_personal pe
            where pe.einsatz_id = statistik_einsaetze.id
              and pe.profile_id in (
                select id from public.profiles where wehr_id = p.wehr_id
                union
                select kamerad_id from public.kamerad_wehren where wehr_id = p.wehr_id
              )
          )
        )
    )
  );
