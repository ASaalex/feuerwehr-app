import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

/**
 * Liest ein PDF ein und rekonstruiert die visuellen Zeilen (nicht nur den
 * nackten Text), indem Textfragmente nach ihrer Y-Position gruppiert und
 * innerhalb einer Zeile nach X-Position sortiert werden. Fuer die tabellarische
 * Einsatzliste wird das gebraucht, um Zeilen sauber auseinanderzuhalten.
 */
export async function extrahierePdfZeilen(datei) {
  const arrayBuffer = await datei.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const zeilen = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const seite = await pdf.getPage(i)
    const inhalt = await seite.getTextContent()
    const items = inhalt.items.filter(it => it.str && it.str.trim())
    items.sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])

    let gruppe = []
    let refY = null
    for (const item of items) {
      const y = item.transform[5]
      if (refY === null || Math.abs(y - refY) < 2) {
        gruppe.push(item)
        if (refY === null) refY = y
      } else {
        zeilen.push(zeileAusGruppe(gruppe))
        gruppe = [item]
        refY = y
      }
    }
    if (gruppe.length) zeilen.push(zeileAusGruppe(gruppe))
  }
  return zeilen.filter(Boolean)
}

function zeileAusGruppe(gruppe) {
  gruppe.sort((a, b) => a.transform[4] - b.transform[4])
  return gruppe.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim()
}

/** Grobe Heuristik, ob die Einsatzliste mit Personal exportiert wurde. */
export function hatVermutlichPersonal(zeilen) {
  if (!zeilen?.length) return null
  return zeilen.some(z => z === 'Mannschaft' || z === 'Mannschaft unter Atemschutz')
}

function dauerZuMinuten(dauer) {
  const m = dauer?.match(/^(\d{1,3}):(\d{2})$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function isoDatum(ddmmyyyy) {
  const [t, m, j] = ddmmyyyy.split('.')
  return `${j}-${m}-${t}`
}

// Die Gesamtdauer am Zeilenende fehlt bei manchen (sehr kurzen/abgebrochenen)
// Einsaetzen komplett in der PDF, daher optional.
const HEADER_RE = /^(\d{4,})\s+(.+?)\s+(\d{2}\.\d{2}\.\d{4})\s*(?:\d{1,3}:\d{2})?\s*$/
// "Art" ist bewusst eine feste Liste (statt eines generischen Wort-Musters):
// ein generisches \w+ wuerde bei Zeilen ohne Art-Angabe (z.B. "Mannschaft unter
// Atemschutz") faelschlich den Vornamen als "Art" einlesen und den Namen kappen.
const PERSON_MIT_ART_RE = /^(?<name>.+?)(?:\s*\((?<funktion>[A-Za-zÄÖÜäöüß]{1,5})\))?\s+(?<art>Einsatz|Sicherheitswache|Übung|Bereitschaft|Alarmierung)\s+(?<d1>\d{2}\.\d{2}\.\d{4})\s+(?<t1>\d{2}:\d{2})\s*-\s*(?<d2>\d{2}\.\d{2}\.\d{4})\s+(?<t2>\d{2}:\d{2})\s+(?<dauer>\d{1,3}:\d{2})\s*$/
const PERSON_OHNE_ART_RE = /^(?<name>.+?)(?:\s*\((?<funktion>[A-Za-zÄÖÜäöüß]{1,5})\))?\s+(?<d1>\d{2}\.\d{2}\.\d{4})\s+(?<t1>\d{2}:\d{2})\s*-\s*(?<d2>\d{2}\.\d{2}\.\d{4})\s+(?<t2>\d{2}:\d{2})\s+(?<dauer>\d{1,3}:\d{2})\s*$/
const FUNKRUFNAME_RE = /\d{1,2}\/\d{1,3}\/\d{1,2}/
const DAUER_AM_ENDE_RE = /(\d{1,3}:\d{2})\s*$/
// Wiederkehrende Kopf-/Fusszeilen jeder PDF-Seite (nicht Teil der eigentlichen Daten).
const BOILERPLATE_RE = /^(Im Jahr \d{4}|\d{2}\.\d{2}\.\d{4}|Freiwillige .+|Liste aller .+|.*zum Einsatz.*|.*Seite \d+.*)$/

function parsePersonZeile(zeile) {
  const m = zeile.match(PERSON_MIT_ART_RE) ?? zeile.match(PERSON_OHNE_ART_RE)
  if (!m?.groups) return null
  const { name, d1, t1, d2, t2, dauer } = m.groups
  if (!name?.includes(',')) return null
  return {
    name: name.trim(),
    zeit_alarmiert: `${d1} ${t1}`,
    zeit_ende: `${d2} ${t2}`,
    minuten: dauerZuMinuten(dauer),
  }
}

function parseFahrzeugZeile(zeile) {
  const dauerMatch = zeile.match(DAUER_AM_ENDE_RE)
  const minuten = dauerMatch ? dauerZuMinuten(dauerMatch[1]) : null
  const rest = dauerMatch ? zeile.slice(0, dauerMatch.index).trim() : zeile
  const funkMatch = rest.match(FUNKRUFNAME_RE)
  const name = (funkMatch ? rest.slice(0, funkMatch.index) : rest).trim()
  return { name: name || rest, zeile_roh: zeile, minuten }
}

/**
 * Parst die Zeilen der Gemeinde-Einsatzliste ("LE02"-Personal-Export) in
 * einzelne Einsaetze inkl. Mannschaft und Fahrzeuge. Die Zuordnung zu
 * Wache/Profil (per Inventarnummer bzw. Name) passiert NICHT hier, sondern
 * erst beim Abgleich mit der Datenbank (siehe statistik.js) — der Parser
 * bleibt bewusst reine Textverarbeitung ohne DB-Zugriff.
 */
export function parseEinsatzliste(zeilen, { dateiname } = {}) {
  const einsaetze = []
  const nichtErkannt = []
  let aktuell = null
  let sektion = null

  for (const zeileRoh of zeilen) {
    const zeile = zeileRoh.trim()
    if (!zeile) continue

    const header = zeile.match(HEADER_RE)
    if (header) {
      if (aktuell) einsaetze.push(abschliessen(aktuell))
      aktuell = {
        einsatznummer: header[1],
        stichwort: header[2].trim(),
        datum: isoDatum(header[3]),
        personal: [],
        fahrzeuge: [],
      }
      sektion = null
      continue
    }

    if (!aktuell) continue

    if (zeile === 'Mannschaft' || zeile === 'Mannschaft unter Atemschutz') { sektion = 'mannschaft'; continue }
    if (zeile === 'Fahrzeuge') { sektion = 'fahrzeuge'; continue }
    if (zeile === 'Atemschutzgeräte' || zeile === 'Material') { sektion = 'ignoriert'; continue }

    if (sektion === 'mannschaft') {
      const p = parsePersonZeile(zeile)
      if (p) aktuell.personal.push(p)
      else if (!BOILERPLATE_RE.test(zeile)) nichtErkannt.push({ einsatznummer: aktuell.einsatznummer, zeile })
    } else if (sektion === 'fahrzeuge') {
      const f = parseFahrzeugZeile(zeile)
      if (f) aktuell.fahrzeuge.push(f)
    }
  }
  if (aktuell) einsaetze.push(abschliessen(aktuell))

  return {
    unterstuetzt: einsaetze.length > 0,
    hinweis: einsaetze.length > 0 ? null : 'Es konnten keine Einsätze im erwarteten Format erkannt werden. Bitte prüfen, ob es sich um den Personal-Export "LE02" handelt.',
    dateiname: dateiname ?? null,
    einsaetze,
    nichtErkannt,
  }
}

function abschliessen(einsatz) {
  // Mehrfachnennung derselben Person (z.B. Mannschaft + "unter Atemschutz")
  // zusammenfassen, jeweils den Eintrag mit der laengeren Dauer behalten.
  const personalMap = new Map()
  for (const p of einsatz.personal) {
    const key = p.name.toLowerCase()
    const bestehend = personalMap.get(key)
    if (!bestehend || (p.minuten ?? 0) > (bestehend.minuten ?? 0)) personalMap.set(key, p)
  }

  const alarmzeiten = [...personalMap.values()]
    .map(p => p.zeit_alarmiert?.match(/(\d{2}):(\d{2})$/))
    .filter(Boolean)
    .map(m => ({ text: `${m[1]}:${m[2]}`, key: Number(m[1]) * 60 + Number(m[2]) }))
  alarmzeiten.sort((a, b) => a.key - b.key)

  return {
    ...einsatz,
    alarmzeit: alarmzeiten[0]?.text ?? null,
    personal: [...personalMap.values()],
  }
}
