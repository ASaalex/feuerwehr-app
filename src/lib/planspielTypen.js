// Gemeinsame Konstanten & Helfer für PlanspielPage + PlanspielAnzeigePage

export const STANDARD_PHASEN = [
  {
    id: 'wache', name: 'Wache',
    checkpunkte: [
      '10er-Regel: Besatzung vollständig prüfen',
      'Alle Türen geschlossen, alle angeschnallt',
      'Maschinist fahrtauglich (0,0‰)',
      'Führungsmittel vorhanden (Karte, Funk)',
      'Sondersignal prüfen (Blaulicht, Martinshorn)',
    ]
  },
  {
    id: 'anfahrt', name: 'Anfahrt',
    checkpunkte: [
      'Eigene Anfahrt der Leitstelle melden',
      'Anfrage: Weitere Lageinformationen?',
      'Weitere Kräfte nachalarmieren?',
      'Anfahrtsweg festlegen',
      'Erkundung auf Anfahrt einleiten',
    ]
  },
  {
    id: 'einsatzstelle', name: 'Einsatzstelle',
    checkpunkte: [
      'Fahrzeug sicher abstellen',
      'Lagemeldung an Leitstelle',
      'Erkundung durchführen',
      'Wasserversorgung sicherstellen',
      'Sicherheitstrupp einteilen',
      'Maßnahmen einleiten',
    ]
  },
  {
    id: 'nachbereitung', name: 'Nachbereitung',
    checkpunkte: [
      'Einsatz-Ende an Leitstelle melden',
      'Ausrüstung vollständig?',
      'Material reinigen und verstauen',
      'Einsatzbericht erstellen',
    ]
  },
]

export const FAHRZEUG_TYPEN = [
  { id: 'lf10',  name: 'LF 10',  emoji: '🚒', farbe: '#DC2626' },
  { id: 'hlf20', name: 'HLF 20', emoji: '🚒', farbe: '#B91C1C' },
  { id: 'tlf',   name: 'TLF',    emoji: '🚒', farbe: '#EA580C' },
  { id: 'dlk',   name: 'DLK',    emoji: '🚒', farbe: '#CA8A04' },
  { id: 'rw',    name: 'RW',     emoji: '🔧', farbe: '#16A34A' },
  { id: 'elw',   name: 'ELW',    emoji: '🚐', farbe: '#7C3AED' },
  { id: 'rtw',   name: 'RTW',    emoji: '🚑', farbe: '#2563EB' },
  { id: 'ktw',   name: 'KTW',    emoji: '🚑', farbe: '#1D4ED8' },
]

export const TRUPP_TYPEN = [
  { id: 'at', name: 'Angriffstrupp',    emoji: '🧑‍🚒', farbe: '#DC2626' },
  { id: 'wt', name: 'Wassertrupp',      emoji: '🧑‍🚒', farbe: '#2563EB' },
  { id: 'st', name: 'Sicherheitstrupp', emoji: '🧑‍🚒', farbe: '#16A34A' },
  { id: 'me', name: 'Melder',           emoji: '🧑‍🚒', farbe: '#D97706' },
  { id: 'gf', name: 'Gruppenführer',    emoji: '⭐', farbe: '#111827' },
]

export const PUNKT_TYPEN = [
  { id: 'hydrant',    name: 'Hydrant',      emoji: '💧', farbe: '#2563EB' },
  { id: 'verteiler',  name: 'Verteiler',    emoji: '🔵', farbe: '#0891B2' },
  { id: 'brandherd',  name: 'Brandherd',    emoji: '🔥', farbe: '#DC2626' },
  { id: 'pkw',        name: 'PKW',          emoji: '🚗', farbe: '#6B7280' },
  { id: 'lkw',        name: 'LKW',          emoji: '🚛', farbe: '#374151' },
  { id: 'person',     name: 'Person/Opfer', emoji: '👤', farbe: '#7C3AED' },
  { id: 'gefahrstoff',name: 'Gefahrstoff',  emoji: '☢️', farbe: '#F59E0B' },
  { id: 'pin',        name: 'Markierung',   emoji: '📍', farbe: '#DC2626' },
]

export const LINIE_TYPEN = [
  { id: 'b_schlauch', name: 'B-Schlauch', farbe: '#2563EB', breite: 5 },
  { id: 'c_schlauch', name: 'C-Schlauch', farbe: '#16A34A', breite: 3 },
]

export const ZONE_TYPEN = [
  { id: 'absperrung',    name: 'Absperrbereich',      farbe: '#DC2626', fill: 0,    dash: false },
  { id: 'bereitstellung',name: 'Bereitstellungsraum', farbe: '#D97706', fill: 0,    dash: false },
  { id: 'abschnitt',    name: 'Einsatzabschnitt',    farbe: '#7C3AED', fill: 0.15, dash: false },
  { id: 'rauch',        name: 'Rauchsäule',          farbe: '#6B7280', fill: 0.3,  dash: true  },
  { id: 'fluessigkeit', name: 'Auslauffläche',        farbe: '#92400E', fill: 0.3,  dash: true  },
]

export function phasenVonStandard() {
  return STANDARD_PHASEN.map(p => ({
    ...p,
    aktiv: p.id === 'wache',
    abgeschlossen: false,
    checkpunkte: p.checkpunkte.map((t, i) => ({ id: p.id + '_' + i, text: t, status: null })),
    extra: [],
  }))
}

export function elEmoji(el) {
  if (el.typ === 'fahrzeug') return FAHRZEUG_TYPEN.find(f => f.id === el.subtyp)?.emoji ?? '🚒'
  if (el.typ === 'trupp')   return TRUPP_TYPEN.find(t => t.id === el.subtyp)?.emoji ?? '🧑‍🚒'
  return PUNKT_TYPEN.find(p => p.id === el.subtyp)?.emoji ?? '📍'
}

export function elName(el) {
  if (el.typ === 'fahrzeug') return FAHRZEUG_TYPEN.find(f => f.id === el.subtyp)?.name ?? el.subtyp
  if (el.typ === 'trupp')   return TRUPP_TYPEN.find(t => t.id === el.subtyp)?.name ?? el.subtyp
  return PUNKT_TYPEN.find(p => p.id === el.subtyp)?.name ?? el.subtyp
}

export function elFarbe(el) {
  if (el.typ === 'fahrzeug') return FAHRZEUG_TYPEN.find(f => f.id === el.subtyp)?.farbe ?? '#DC2626'
  if (el.typ === 'trupp')   return TRUPP_TYPEN.find(t => t.id === el.subtyp)?.farbe ?? '#DC2626'
  return PUNKT_TYPEN.find(p => p.id === el.subtyp)?.farbe ?? '#DC2626'
}
