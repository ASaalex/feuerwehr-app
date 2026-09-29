import { supabase } from './supabase'

const EINSATZ_SELECT = `
  id, einsatznummer, datum, alarmzeit, stichwort, einsatzort,
  fahrzeuge:statistik_einsatz_fahrzeuge(id, fahrzeug_name_pdf, inventarnummer_pdf, fahrzeug_id, wehr_id, zeit_alarmiert, zeit_ende, minuten),
  personal:statistik_einsatz_personal(id, name_pdf, profile_id, wehr_id, fahrzeug_name_pdf, zeit_alarmiert, zeit_ende, minuten)
`

/**
 * Laedt alle importierten Einsaetze eines Jahres.
 * RLS regelt die Sichtbarkeit: GBM sieht alle Einsaetze der Gemeinde vollstaendig,
 * Wehrleiter/Gruppenfuehrer sehen nur Einsaetze ihrer eigenen Wache (und darin auch
 * nur die Fahrzeug-/Personal-Zeilen ihrer eigenen Wache).
 */
export async function ladeEinsaetzeJahr(jahr) {
  const von = `${jahr}-01-01`
  const bis = `${jahr}-12-31`
  const { data, error } = await supabase
    .from('statistik_einsaetze')
    .select(EINSATZ_SELECT)
    .gte('datum', von)
    .lte('datum', bis)
    .order('datum')
  if (error) throw error
  return data ?? []
}

/**
 * Leichtgewichtige Version von ladeEinsaetzeJahr fuer den Mehrjahresvergleich:
 * laedt nur die Fahrzeug-Zeilen (keine Personal-Daten), da die Jahresuebersicht
 * wie die Monatsansicht rein fahrzeugbasiert ist.
 */
export async function ladeJahresAggregat(jahr) {
  const von = `${jahr}-01-01`
  const bis = `${jahr}-12-31`
  const { data, error } = await supabase
    .from('statistik_einsaetze')
    .select('id, fahrzeuge:statistik_einsatz_fahrzeuge(wehr_id, minuten)')
    .gte('datum', von)
    .lte('datum', bis)
  if (error) throw error
  return data ?? []
}

/** Ermittelt alle Jahre, fuer die bereits Einsaetze importiert wurden (neueste zuerst). */
export async function ladeVerfuegbareJahre() {
  const { data, error } = await supabase.from('statistik_einsaetze').select('datum').order('datum', { ascending: false })
  if (error) throw error
  const jahre = new Set((data ?? []).map(r => Number(r.datum.slice(0, 4))))
  return [...jahre].sort((a, b) => b - a)
}

export async function ladeWachen() {
  const { data, error } = await supabase.from('wehren').select('id, name, ort').order('name')
  if (error) throw error
  return data ?? []
}

/** Kameraden der Wache inkl. Zweitwachen-Mitgliedern (Tabelle kamerad_wehren). */
export async function ladeKameradenFuerWache(wehrId) {
  const [hauptRes, nebenIdsRes] = await Promise.all([
    supabase.from('profiles').select('id, vorname, nachname')
      .eq('wehr_id', wehrId).eq('status', 'aktiv').neq('rolle', 'tablet').order('nachname'),
    supabase.from('kamerad_wehren').select('kamerad_id').eq('wehr_id', wehrId),
  ])
  if (hauptRes.error) throw hauptRes.error
  if (nebenIdsRes.error) throw nebenIdsRes.error

  const alle = [...(hauptRes.data ?? [])]
  const ids = new Set(alle.map(k => k.id))
  const fremdIds = (nebenIdsRes.data ?? []).map(n => n.kamerad_id).filter(id => !ids.has(id))

  if (fremdIds.length > 0) {
    const { data: nebenProfile, error } = await supabase
      .from('profiles').select('id, vorname, nachname')
      .eq('status', 'aktiv').neq('rolle', 'tablet').in('id', fremdIds)
    if (error) throw error
    for (const k of (nebenProfile ?? [])) {
      if (!ids.has(k.id)) { alle.push(k); ids.add(k.id) }
    }
  }

  alle.sort((a, b) => a.nachname.localeCompare(b.nachname, 'de'))
  return alle
}

/** Alle Fahrzeuge aller Wachen (fuer den Import-Abgleich per Inventarnummer). */
export async function ladeAlleFahrzeuge() {
  const { data, error } = await supabase.from('fahrzeuge').select('id, wehr_id, name, inventarnummer')
  if (error) throw error
  return (data ?? []).filter(f => f.inventarnummer?.trim())
}

/** Alle aktiven Kameraden aller Wachen (fuer den Import-Abgleich per Name). */
export async function ladeAlleKameraden() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, vorname, nachname, wehr_id')
    .eq('status', 'aktiv')
    .neq('rolle', 'tablet')
  if (error) throw error
  return data ?? []
}

/** Bereits importierte Einsatznummern (fuer die Duplikat-Erkennung beim Import). */
export async function ladeVorhandeneEinsatznummern() {
  const { data, error } = await supabase.from('statistik_einsaetze').select('einsatznummer')
  if (error) throw error
  return new Set((data ?? []).map(r => r.einsatznummer))
}

/** Findet das Fahrzeug, dessen Inventarnummer als Text in der rohen PDF-Zeile vorkommt. */
export function findeFahrzeugInZeile(zeileRoh, fahrzeuge) {
  const ziel = zeileRoh.toUpperCase()
  let treffer = null
  for (const f of fahrzeuge) {
    if (ziel.includes(f.inventarnummer.toUpperCase())) {
      if (!treffer || f.inventarnummer.length > treffer.inventarnummer.length) treffer = f
    }
  }
  return treffer
}

/** Normalisiert einen Namen fuer den exakten Abgleich PDF <-> Profil ("Nachname, Vorname" oder "Vorname Nachname"). */
export function normalisiereName(name) {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z,\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Sucht ein exakt passendes Profil zu einem PDF-Namen (Kamerad einer bestimmten Wache). */
export function findeProfilFuerName(namePdf, kameraden) {
  const ziel = normalisiereName(namePdf)
  if (!ziel) return null
  return kameraden.find(k => {
    const a = normalisiereName(`${k.nachname}, ${k.vorname}`)
    const b = normalisiereName(`${k.vorname} ${k.nachname}`)
    return ziel === a || ziel === b
  }) ?? null
}

export function minutenZuStunden(minuten) {
  return Math.round((minuten / 60) * 10) / 10
}
