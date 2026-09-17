import { useCallback, useEffect, useRef, useState } from 'react'
import { Marker } from 'maplibre-gl'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { PUNKT_TYPEN, ZONE_TYPEN, elEmoji, elFarbe } from '../lib/planspielTypen'
import {
  erstelleKarte, fx3DElementeSynchronisieren, setZonenDaten, setLinienDaten,
  setVorschauZone, clearVorschau, ist3DFahrzeug,
} from '../lib/planspiel3d'

const KATEGORIEN = [
  { value: 'verkehrsunfall',          label: 'Verkehrsunfall',         icon: '🚗' },
  { value: 'wohnungsbrand',           label: 'Wohnungsbrand',          icon: '🔥' },
  { value: 'technische_hilfeleistung',label: 'Techn. Hilfeleistung',   icon: '🔧' },
  { value: 'gefahrgut',               label: 'Gefahrgut',              icon: '☢️' },
  { value: 'waldbrand',               label: 'Waldbrand',              icon: '🌲' },
  { value: 'sonstiges',               label: 'Sonstiges',              icon: '📋' },
]

const SCHWIERIGKEITEN = [
  { value: 'leicht', label: 'Leicht' },
  { value: 'mittel', label: 'Mittel' },
  { value: 'schwer', label: 'Schwer' },
]

const WETTER_LAGEN = ['Sonnig', 'Leicht bewölkt', 'Bewölkt', 'Bedeckt', 'Regen', 'Gewitter', 'Schnee', 'Nebel']
const WINDRICHTUNGEN = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW']
const WINDSTAERKEN = ['Windstille', 'Schwacher Wind', 'Mäßiger Wind', 'Frischer Wind', 'Starker Wind', 'Sturm']


const DEFAULT_PHASEN = [
  { id: 'wache',         name: 'Wache',         emoji: '🏠', checkpunkte: [
    '10er-Regel: Besatzung vollständig prüfen',
    'Alle Türen geschlossen, alle angeschnallt',
    'Maschinist fahrtauglich (0,0‰)',
    'Führungsmittel vorhanden (Karte, Funk)',
    'Sondersignal prüfen (Blaulicht, Martinshorn)',
  ]},
  { id: 'anfahrt',       name: 'Anfahrt',       emoji: '🚒', checkpunkte: [
    'Eigene Anfahrt der Leitstelle melden',
    'Anfrage: Weitere Lageinformationen?',
    'Weitere Kräfte nachalarmieren?',
    'Anfahrtsweg festlegen',
    'Erkundung auf Anfahrt einleiten',
  ]},
  { id: 'einsatzstelle', name: 'Einsatzstelle', emoji: '🔥', checkpunkte: [
    'Fahrzeug sicher abstellen',
    'Lagemeldung an Leitstelle',
    'Erkundung durchführen',
    'Wasserversorgung sicherstellen',
    'Sicherheitstrupp einteilen',
    'Maßnahmen einleiten',
  ]},
  { id: 'nachbereitung', name: 'Nachbereitung', emoji: '📋', checkpunkte: [
    'Einsatz-Ende an Leitstelle melden',
    'Ausrüstung vollständig?',
    'Material reinigen und verstauen',
    'Einsatzbericht erstellen',
  ]},
]

function leerPhasen() {
  return DEFAULT_PHASEN.map(p => ({ ...p, checkpunkte: [...p.checkpunkte] }))
}

const LEER_FORM = {
  titel: '',
  kategorie: 'verkehrsunfall',
  anfangs_meldung: '',
  beschreibung: '',
  schwierigkeitsgrad: 'mittel',
  aktiv: true,
  kartenposition: null,
  kartenvorgabe: { elemente: [], zonen: [] },
  wetterinfo: { wetterlage: '', windrichtung: '', windstaerke: '' },
  phasen: leerPhasen(),
}

// ─── Karten-Editor ────────────────────────────────────────────────────────────

// Alte Vorlagen (Leaflet-Editor) speicherten Elemente als {id, typ, koord:[lng,lat]}
// und Zonenpunkte als [lat,lng]. Für die Anzeige hier auf das aktuelle Planspiel-Format bringen.
function migriereElement(e) {
  if (e.position) return { heading: 0, ...e }
  return { id: e.id, typ: 'punkt', subtyp: e.typ, position: e.koord, heading: 0 }
}
function migriereZone(z) {
  const erster = z.punkte?.[0]
  if (!erster) return z
  // In Deutschland liegt die Breite (lat) deutlich über 40, die Länge (lng) deutlich darunter –
  // damit altes [lat,lng] von neuem [lng,lat] unterscheiden.
  const istAltesFormat = Math.abs(erster[0]) > 40
  return istAltesFormat ? { ...z, punkte: z.punkte.map(([lat, lng]) => [lng, lat]) } : z
}

function SzMapEditor({ initialPosition, initialVorgabe, onChange, visible }) {
  const mapRef = useRef(null)
  const fxRef = useRef(null)
  const markerRefs = useRef({})
  const posMarkerRef = useRef(null)

  const [elemente, setElemente] = useState(() => (initialVorgabe?.elemente ?? []).map(migriereElement))
  const [zonen, setZonen] = useState(() => (initialVorgabe?.zonen ?? []).map(migriereZone))
  const [werkzeug, setWerkzeug] = useState(null) // null | 'position' | {typ:'punkt',subtyp} | {typ:'zone',subtyp}
  const [zeichnePunkte, setZeichnePunkte] = useState([])
  const [position, setPosition] = useState(initialPosition)

  const elementeRef = useRef(elemente)
  const zonenRef = useRef(zonen)
  const werkzeugRef = useRef(werkzeug)

  useEffect(() => { elementeRef.current = elemente }, [elemente])
  useEffect(() => { zonenRef.current = zonen }, [zonen])
  useEffect(() => { werkzeugRef.current = werkzeug }, [werkzeug])

  useEffect(() => {
    if (visible && mapRef.current) {
      setTimeout(() => mapRef.current?.resize(), 50)
    }
  }, [visible])

  const mapContainer = useCallback((node) => {
    // Ref-Callback statt useEffect fürs Aufräumen: React 18 StrictMode ruft einen separaten
    // Cleanup-Effect im Dev-Modus doppelt auf und würde die Karte sofort nach dem Erzeugen wieder
    // zerstören, ohne dass der Ref erneut aufgerufen wird. An den Ref-Lebenszyklus gekoppelt
    // passiert das nicht.
    if (!node) {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; fxRef.current = null }
      return
    }
    if (mapRef.current) return
    const center = initialPosition ?? { lng: 10.4515, lat: 51.1657, zoom: 13 }
    const { map, fx } = erstelleKarte(node, center)
    mapRef.current = map
    fxRef.current = fx

    map.on('style.load', () => {
      fx3DElementeSynchronisieren(fx, elementeRef.current, elFarbe)
      setZonenDaten(map, zonenRef.current)
      setLinienDaten(map, [])
    })

    map.on('click', (e) => {
      const wz = werkzeugRef.current
      if (!wz) return
      const pos = [e.lngLat.lng, e.lngLat.lat]

      if (wz === 'position') {
        const neu = { lng: pos[0], lat: pos[1], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() }
        setPosition(neu)
        onChange({ kartenposition: neu })
        return
      }

      if (wz.typ === 'punkt') {
        const id = crypto.randomUUID()
        setElemente(prev => {
          const next = [...prev, { id, typ: 'punkt', subtyp: wz.subtyp, position: pos, heading: 0 }]
          onChange({ kartenvorgabe: { elemente: next, zonen: zonenRef.current } })
          return next
        })
        return
      }

      if (wz.typ === 'zone') {
        setZeichnePunkte(pp => [...pp, pos])
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Positions-Marker (Startblickwinkel der Übung)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (posMarkerRef.current) { posMarkerRef.current.remove(); posMarkerRef.current = null }
    if (position) {
      const el = document.createElement('div')
      el.style.cssText = 'width:16px;height:16px;border-radius:50%;background:#3B82F6;border:3px solid white;box-shadow:0 0 0 2px #3B82F6;'
      posMarkerRef.current = new Marker({ element: el }).setLngLat([position.lng, position.lat]).addTo(map)
    }
  }, [position])

  // Objekt-Marker (2D-Pille, ziehbar; Doppelklick löscht)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const aktuelleIds = new Set(elemente.map(e => e.id))
    Object.entries(markerRefs.current).forEach(([id, m]) => {
      if (!aktuelleIds.has(id)) { m.remove(); delete markerRefs.current[id] }
    })
    elemente.forEach(el => {
      if (!markerRefs.current[el.id]) {
        const el2 = document.createElement('div')
        el2.style.cssText = `background:${elFarbe(el)};color:white;border-radius:6px;padding:3px 7px;font-size:16px;cursor:grab;box-shadow:0 2px 6px rgba(0,0,0,0.4);border:2px solid white;user-select:none;`
        el2.innerHTML = `<span>${elEmoji(el)}</span>`
        const marker = new Marker({ element: el2, draggable: true, anchor: 'top-left' }).setLngLat(el.position).addTo(map)
        marker.on('dragend', () => {
          const { lng, lat } = marker.getLngLat()
          setElemente(prev => {
            const next = prev.map(x => x.id === el.id ? { ...x, position: [lng, lat] } : x)
            onChange({ kartenvorgabe: { elemente: next, zonen: zonenRef.current } })
            return next
          })
        })
        el2.addEventListener('dblclick', (e) => {
          e.stopPropagation()
          elementLoeschen(el.id)
        })
        markerRefs.current[el.id] = marker
      } else {
        markerRefs.current[el.id].setLngLat(el.position)
      }
    })
  }, [elemente]) // eslint-disable-line react-hooks/exhaustive-deps

  // 3D-Fahrzeuge/-Modelle synchron halten
  useEffect(() => {
    const fx = fxRef.current
    if (!fx || !fx.scene) return
    fx3DElementeSynchronisieren(fx, elemente, elFarbe)
  }, [elemente])

  // Zonen rendern
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('planspiel-zonen')) return
    setZonenDaten(map, zonen)
  }, [zonen])

  // Zeichnungsvorschau
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('planspiel-vorschau-zone')) return
    if (!werkzeug || werkzeug.typ !== 'zone' || zeichnePunkte.length < 3) { clearVorschau(map); return }
    setVorschauZone(map, zeichnePunkte, werkzeug.subtyp)
  }, [zeichnePunkte, werkzeug])

  // Cursor
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.getCanvas().style.cursor = werkzeug ? (werkzeug === 'position' || werkzeug.typ === 'zone' ? 'crosshair' : 'copy') : ''
  }, [werkzeug])

  function zoneFertig() {
    if (!werkzeug || werkzeug.typ !== 'zone' || zeichnePunkte.length < 3) return
    const id = crypto.randomUUID()
    setZonen(prev => {
      const next = [...prev, { id, typ: werkzeug.subtyp, punkte: zeichnePunkte }]
      onChange({ kartenvorgabe: { elemente: elementeRef.current, zonen: next } })
      return next
    })
    clearVorschau(mapRef.current)
    setZeichnePunkte([])
    setWerkzeug(null)
  }

  function zeichnenAbbrechen() {
    clearVorschau(mapRef.current)
    setZeichnePunkte([])
    setWerkzeug(null)
  }

  function elementDrehen(id, delta) {
    setElemente(prev => {
      const next = prev.map(x => x.id !== id ? x : { ...x, heading: ((x.heading ?? 0) + delta + 360) % 360 })
      onChange({ kartenvorgabe: { elemente: next, zonen: zonenRef.current } })
      return next
    })
  }

  function elementLoeschen(id) {
    setElemente(prev => {
      const next = prev.filter(x => x.id !== id)
      onChange({ kartenvorgabe: { elemente: next, zonen: zonenRef.current } })
      return next
    })
  }

  function zoneLoeschen(id) {
    setZonen(prev => {
      const next = prev.filter(z => z.id !== id)
      onChange({ kartenvorgabe: { elemente: elementeRef.current, zonen: next } })
      return next
    })
  }

  function loescheAlles() {
    if (!confirm('Alle Objekte und Zonen löschen?')) return
    Object.values(markerRefs.current).forEach(m => m.remove()); markerRefs.current = {}
    fxRef.current?.setVehicles([])
    fxRef.current?.setPersonen([])
    fxRef.current?.setBrandherde([])
    setElemente([])
    setZonen([])
    onChange({ kartenvorgabe: { elemente: [], zonen: [] } })
  }

  const istZoneModus = werkzeug?.typ === 'zone'

  return (
    <div>
      <div style={{ marginBottom: 8, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setWerkzeug('position')}
          className={werkzeug === 'position' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
        >
          🎯 Position
        </button>
        <span style={{ color: 'var(--gray-300)', fontSize: 11 }}>│</span>
        {PUNKT_TYPEN.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setWerkzeug({ typ: 'punkt', subtyp: t.id })}
            className={werkzeug?.subtyp === t.id ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
          >
            {t.emoji} {t.name}
          </button>
        ))}
        <span style={{ color: 'var(--gray-300)', fontSize: 11 }}>│</span>
        {ZONE_TYPEN.map(z => (
          <button
            key={z.id}
            type="button"
            onClick={() => { setZeichnePunkte([]); setWerkzeug({ typ: 'zone', subtyp: z.id }) }}
            className={werkzeug?.typ === 'zone' && werkzeug.subtyp === z.id ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
          >
            {z.name}
          </button>
        ))}
      </div>

      {istZoneModus && (
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#FEF9EC', borderRadius: 6, border: '1px solid #FCD34D', fontSize: 13, flexWrap: 'wrap' }}>
          <span>Punkte auf Karte klicken{zeichnePunkte.length ? ` (${zeichnePunkte.length} gesetzt)` : ''}, dann</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={zoneFertig} disabled={zeichnePunkte.length < 3}>Zone schließen ↩</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={zeichnenAbbrechen}>✕ Abbrechen</button>
        </div>
      )}

      <div ref={mapContainer} style={{ height: 420, borderRadius: 8, border: '1px solid var(--gray-200)' }} />

      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--gray-400)' }}>
        <span>
          {position
            ? `📍 ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`
            : 'Keine Position gesetzt'}
          {' · '}{elemente.length} Objekt{elemente.length !== 1 ? 'e' : ''}
          {' · '}{zonen.length} Zone{zonen.length !== 1 ? 'n' : ''}
        </span>
        {(elemente.length > 0 || zonen.length > 0) && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ color: '#DC2626', fontSize: 12 }} onClick={loescheAlles}>
            Alles löschen
          </button>
        )}
      </div>

      {(elemente.length > 0 || zonen.length > 0) && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
          {elemente.map(el => (
            <div key={el.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, background: 'var(--gray-50)', fontSize: 12 }}>
              <span>{elEmoji(el)}</span>
              <span style={{ flex: 1, color: 'var(--gray-700)' }}>{PUNKT_TYPEN.find(p => p.id === el.subtyp)?.name ?? el.subtyp}</span>
              {ist3DFahrzeug(el) && (
                <>
                  <button type="button" onClick={() => elementDrehen(el.id, -15)} title="Nach links drehen" style={{ background: 'none', border: '1px solid var(--gray-300)', borderRadius: 4, cursor: 'pointer', width: 22, height: 22, lineHeight: 1 }}>⟲</button>
                  <button type="button" onClick={() => elementDrehen(el.id, 15)} title="Nach rechts drehen" style={{ background: 'none', border: '1px solid var(--gray-300)', borderRadius: 4, cursor: 'pointer', width: 22, height: 22, lineHeight: 1 }}>⟳</button>
                </>
              )}
              <button type="button" onClick={() => elementLoeschen(el.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}>✕</button>
            </div>
          ))}
          {zonen.map(z => (
            <div key={z.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, background: 'var(--gray-50)', fontSize: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: ZONE_TYPEN.find(t => t.id === z.typ)?.farbe, display: 'inline-block' }} />
              <span style={{ flex: 1, color: 'var(--gray-700)' }}>{ZONE_TYPEN.find(t => t.id === z.typ)?.name ?? z.typ}</span>
              <button type="button" onClick={() => zoneLoeschen(z.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--gray-400)' }}>
        💡{' '}
        {werkzeug === 'position'
          ? 'Klick auf Karte setzt die Einsatzposition (blauer Punkt) inkl. aktuellem Blickwinkel – die Übung startet später genau so.'
          : istZoneModus
          ? 'Eckpunkte anklicken, dann „Zone schließen".'
          : 'Klick auf Karte platziert das Objekt. Ziehen verschiebt es, Doppelklick löscht es.'}
      </div>
    </div>
  )
}

// ─── Phasen-Editor ───────────────────────────────────────────────────────────

function SzPhasenEditor({ phasen, onChange }) {
  const [offen, setOffen] = useState(null) // which phase id is expanded
  const [neueCP, setNeueCP] = useState({}) // { phaseId: text }

  function updatePhase(id, changes) {
    onChange(phasen.map(p => p.id === id ? { ...p, ...changes } : p))
  }

  function loeschePhase(id) {
    onChange(phasen.filter(p => p.id !== id))
  }

  function verschiebePhase(idx, dir) {
    const next = [...phasen]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(next)
  }

  function updateCP(phaseId, cpIdx, text) {
    const phase = phasen.find(p => p.id === phaseId)
    if (!phase) return
    const cps = [...phase.checkpunkte]
    cps[cpIdx] = text
    updatePhase(phaseId, { checkpunkte: cps })
  }

  function loescheCP(phaseId, cpIdx) {
    const phase = phasen.find(p => p.id === phaseId)
    if (!phase) return
    updatePhase(phaseId, { checkpunkte: phase.checkpunkte.filter((_, i) => i !== cpIdx) })
  }

  function fuegeCP(phaseId) {
    const text = (neueCP[phaseId] ?? '').trim()
    if (!text) return
    const phase = phasen.find(p => p.id === phaseId)
    if (!phase) return
    updatePhase(phaseId, { checkpunkte: [...phase.checkpunkte, text] })
    setNeueCP(n => ({ ...n, [phaseId]: '' }))
  }

  function fuegePhaseHinzu() {
    const id = 'phase_' + Date.now()
    onChange([...phasen, { id, name: 'Neue Phase', emoji: '📋', checkpunkte: [] }])
    setOffen(id)
  }

  function resetDefault() {
    if (!confirm('Standard-Phasen wiederherstellen? Alle Änderungen gehen verloren.')) return
    onChange(leerPhasen())
  }

  const EMOJIS = ['🏠', '🚒', '🔥', '📋', '✅', '🔧', '🚑', '📡', '⚠️', '🛡️']

  return (
    <div>
      {phasen.map((phase, idx) => {
        const istOffen = offen === phase.id
        return (
          <div key={phase.id} style={{ border: '1px solid var(--gray-200)', borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
            {/* Phase-Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--gray-50)', cursor: 'pointer' }}
              onClick={() => setOffen(istOffen ? null : phase.id)}
            >
              <span style={{ fontSize: 18 }}>{phase.emoji}</span>
              <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{phase.name}</span>
              <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>{phase.checkpunkte.length} Checkpunkte</span>
              <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => verschiebePhase(idx, -1)} disabled={idx === 0} style={{ padding: '3px 7px', fontSize: 12 }}>↑</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => verschiebePhase(idx, 1)} disabled={idx === phasen.length - 1} style={{ padding: '3px 7px', fontSize: 12 }}>↓</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => loeschePhase(phase.id)} style={{ padding: '3px 7px', fontSize: 12, color: '#DC2626' }}>✕</button>
              </div>
              <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>{istOffen ? '▲' : '▼'}</span>
            </div>

            {/* Phase-Inhalt */}
            {istOffen && (
              <div style={{ padding: '14px 16px' }}>
                {/* Name & Emoji */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: 'var(--gray-500)', display: 'block', marginBottom: 4 }}>Phasenname</label>
                    <input
                      value={phase.name}
                      onChange={e => updatePhase(phase.id, { name: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--gray-500)', display: 'block', marginBottom: 4 }}>Emoji</label>
                    <select value={phase.emoji} onChange={e => updatePhase(phase.id, { emoji: e.target.value })}
                      style={{ padding: '8px 10px', fontSize: 16, borderRadius: 8, border: '1px solid var(--gray-200)', background: 'white' }}>
                      {EMOJIS.map(em => <option key={em} value={em}>{em}</option>)}
                    </select>
                  </div>
                </div>

                {/* Checkpunkte */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 8, fontWeight: 600 }}>Checkpunkte</div>
                  {phase.checkpunkte.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--gray-400)', padding: '8px 0' }}>Noch keine Checkpunkte.</div>
                  )}
                  {phase.checkpunkte.map((cp, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ color: 'var(--gray-400)', fontSize: 14, flexShrink: 0 }}>☐</span>
                      <input
                        value={cp}
                        onChange={e => updateCP(phase.id, i, e.target.value)}
                        style={{ flex: 1, fontSize: 13 }}
                      />
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => loescheCP(phase.id, i)} style={{ color: '#DC2626', padding: '3px 7px', flexShrink: 0 }}>✕</button>
                    </div>
                  ))}
                </div>

                {/* Neuer Checkpunkt */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    placeholder="Neuer Checkpunkt..."
                    value={neueCP[phase.id] ?? ''}
                    onChange={e => setNeueCP(n => ({ ...n, [phase.id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), fuegeCP(phase.id))}
                    style={{ flex: 1, fontSize: 13 }}
                  />
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => fuegeCP(phase.id)}>+ Hinzufügen</button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" className="btn btn-secondary" onClick={fuegePhaseHinzu}>+ Phase hinzufügen</button>
        <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--gray-400)', fontSize: 12 }} onClick={resetDefault}>
          Standard wiederherstellen
        </button>
      </div>
    </div>
  )
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export default function SzenarienAdminPage() {
  const { profile } = useAuth()
  const [szenarien, setSzenarien] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(LEER_FORM)
  const [tab, setTab] = useState('basis')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgArt, setMsgArt] = useState('success')

  // Standard-Phasen
  const [standardPhasen, setStandardPhasen] = useState(null)
  const [stdModal, setStdModal] = useState(false)
  const [stdPhasen, setStdPhasen] = useState(leerPhasen())
  const [stdSaving, setStdSaving] = useState(false)
  const [stdDirty, setStdDirty] = useState(false)
  const [stdCloseConfirm, setStdCloseConfirm] = useState(false)
  const stdOriginalRef = useRef(null)
  // Admins (Gemeindebrandmeister) haben keine eigene Wehr und müssen sie zum Bearbeiten auswählen
  const istWehrAuswahlNoetig = !profile.wehr_id
  const [wehrenListe, setWehrenListe] = useState([])
  const [stdWehrId, setStdWehrId] = useState(profile.wehr_id ?? '')

  useEffect(() => {
    ladeSzenarien()
    if (istWehrAuswahlNoetig) {
      supabase.from('wehren').select('id,name').order('name').then(({ data }) => setWehrenListe(data ?? []))
    } else {
      ladeStandardPhasen(profile.wehr_id)
    }
  }, [])

  async function ladeStandardPhasen(wehrId) {
    if (!wehrId) { setStandardPhasen(null); return }
    const { data } = await supabase
      .from('planspiel_config')
      .select('standard_phasen')
      .eq('wehr_id', wehrId)
      .maybeSingle()
    setStandardPhasen(data?.standard_phasen ?? null)
  }

  function oeffneStdModal() {
    const initial = standardPhasen ? JSON.parse(JSON.stringify(standardPhasen)) : leerPhasen()
    stdOriginalRef.current = JSON.stringify(initial)
    setStdPhasen(initial)
    setStdDirty(false)
    setStdCloseConfirm(false)
    setStdModal(true)
  }

  function stdOnChange(phasen) {
    setStdPhasen(phasen)
    setStdDirty(JSON.stringify(phasen) !== stdOriginalRef.current)
    setStdCloseConfirm(false)
  }

  function stdVersuchtSchliessen() {
    if (stdDirty) {
      setStdCloseConfirm(true)
    } else {
      setStdModal(false)
    }
  }

  function stdVerwerfen() {
    setStdCloseConfirm(false)
    setStdDirty(false)
    setStdModal(false)
  }

  async function speichereStandard() {
    const wehrId = stdWehrId || profile.wehr_id
    if (!wehrId) return
    setStdSaving(true)
    const { error } = await supabase.from('planspiel_config').upsert(
      { wehr_id: wehrId, standard_phasen: stdPhasen },
      { onConflict: 'wehr_id' }
    )
    if (error) {
      console.error('Standard-Phasen speichern fehlgeschlagen:', error)
      setStdSaving(false)
      setMsgArt('error')
      setMsg('Fehler beim Speichern: ' + error.message)
      setTimeout(() => setMsg(''), 6000)
      return
    }
    // Aus der DB neu laden statt nur lokal zu übernehmen, damit ein evtl. Fehlschlag sofort sichtbar wäre
    await ladeStandardPhasen(wehrId)
    setStdModal(false)
    setStdDirty(false)
    setStdCloseConfirm(false)
    setStdSaving(false)
    setMsgArt('success')
    setMsg('Standard-Phasen gespeichert.')
    setTimeout(() => setMsg(''), 3000)
  }

  async function ladeSzenarien() {
    const { data } = await supabase
      .from('szenarien')
      .select('*, erstellt_von:profiles(vorname,nachname)')
      .order('kategorie')
      .order('titel')
    setSzenarien(data ?? [])
    setLoading(false)
  }

  function oeffneNeu() {
    setEditId(null)
    // Als Ausgangspunkt die eigenen Standard-Phasen übernehmen (nicht die generischen Platzhalter),
    // damit ein neues Szenario ohne weitere Bearbeitung dieselben Phasen wie die eigene Wache nutzt.
    const startPhasen = standardPhasen ? JSON.parse(JSON.stringify(standardPhasen)) : leerPhasen()
    setForm({ ...LEER_FORM, phasen: startPhasen })
    setTab('basis')
    setModal(true)
  }

  function oeffneEdit(sz) {
    setEditId(sz.id)
    setForm({
      titel:              sz.titel,
      kategorie:          sz.kategorie,
      anfangs_meldung:    sz.anfangs_meldung,
      beschreibung:       sz.beschreibung ?? '',
      schwierigkeitsgrad: sz.schwierigkeitsgrad,
      aktiv:              sz.aktiv,
      kartenposition:     sz.kartenposition ?? null,
      kartenvorgabe:      sz.kartenvorgabe ?? { elemente: [], zonen: [] },
      wetterinfo:         sz.wetterinfo ?? { wetterlage: '', windrichtung: '', windstaerke: '' },
      phasen:             sz.phasen ?? leerPhasen(),
    })
    setTab('basis')
    setModal(true)
  }

  async function handleSpeichern(e) {
    e.preventDefault()
    if (!form.titel.trim() || !form.anfangs_meldung.trim()) {
      setTab('basis')
      return
    }
    setSaving(true)

    const payload = {
      titel:              form.titel.trim(),
      kategorie:          form.kategorie,
      anfangs_meldung:    form.anfangs_meldung.trim(),
      beschreibung:       form.beschreibung.trim() || null,
      schwierigkeitsgrad: form.schwierigkeitsgrad,
      aktiv:              form.aktiv,
      kartenposition:     form.kartenposition,
      kartenvorgabe:      form.kartenvorgabe,
      wetterinfo:         form.wetterinfo,
      phasen:             form.phasen,
    }

    const { error } = editId
      ? await supabase.from('szenarien').update(payload).eq('id', editId)
      : await supabase.from('szenarien').insert({ ...payload, erstellt_von: profile.id })

    if (error) {
      console.error('Szenario speichern fehlgeschlagen:', error)
      setSaving(false)
      setMsgArt('error')
      setMsg('Fehler beim Speichern: ' + error.message)
      setTimeout(() => setMsg(''), 6000)
      return
    }

    setMsgArt('success')
    setMsg(editId ? 'Szenario gespeichert.' : 'Szenario angelegt.')
    await ladeSzenarien()
    setModal(false)
    setSaving(false)
    setTimeout(() => setMsg(''), 3000)
  }

  async function handleLoeschen(id, titel) {
    if (!confirm(`"${titel}" wirklich löschen?`)) return
    await supabase.from('szenarien').delete().eq('id', id)
    await ladeSzenarien()
  }

  async function toggleAktiv(sz) {
    await supabase.from('szenarien').update({ aktiv: !sz.aktiv }).eq('id', sz.id)
    setSzenarien(prev => prev.map(s => s.id === sz.id ? { ...s, aktiv: !s.aktiv } : s))
  }

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  const tabStyle = (t) => ({
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: tab === t ? 600 : 400,
    color: tab === t ? 'var(--primary)' : 'var(--gray-500)',
    borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
    background: 'none',
    border: 'none',
    borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
    cursor: 'pointer',
    marginBottom: -1,
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Szenarien verwalten</h1>
          <p style={{ marginTop: 4 }}>{szenarien.length} Szenario{szenarien.length !== 1 ? 's' : ''} gesamt</p>
        </div>
        <button className="btn btn-primary" onClick={oeffneNeu}>
          <span>+</span> Neues Szenario
        </button>
      </div>

      {msg && <div className={`alert alert-${msgArt}`}>{msg}</div>}

      {/* Standard-Phasen */}
      <div className="card" style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px' }}>
        <span style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>📋</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--gray-700)', marginBottom: 4 }}>Standard-Phasen</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', lineHeight: 1.5 }}>
            {istWehrAuswahlNoetig && !stdWehrId
              ? 'Bitte zuerst eine Wehr auswählen.'
              : standardPhasen
                ? standardPhasen.map(p => `${p.emoji ?? ''} ${p.name}`).join(' · ')
                : leerPhasen().map(p => `${p.emoji} ${p.name}`).join(' · ')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
            Werden verwendet wenn ein Szenario keine eigenen Phasen definiert.
          </div>
        </div>
        {istWehrAuswahlNoetig && (
          <select
            value={stdWehrId}
            onChange={e => { const id = e.target.value; setStdWehrId(id); ladeStandardPhasen(id) }}
            style={{ fontSize: 12, padding: '6px 10px' }}
          >
            <option value="">– Wehr wählen –</option>
            {wehrenListe.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}
        <button
          className="btn btn-sm btn-secondary"
          onClick={oeffneStdModal}
          disabled={istWehrAuswahlNoetig && !stdWehrId}
          style={{ flexShrink: 0 }}
        >
          ✏️ Bearbeiten
        </button>
      </div>

      {szenarien.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <p style={{ color: 'var(--gray-400)' }}>Noch keine Szenarien vorhanden.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {szenarien.map(sz => {
            const kat = KATEGORIEN.find(k => k.value === sz.kategorie)
            const hatKarte = sz.kartenposition || (sz.kartenvorgabe?.elemente?.length > 0) || (sz.kartenvorgabe?.zonen?.length > 0)
            const hatWetter = sz.wetterinfo?.wetterlage || sz.wetterinfo?.windrichtung
            return (
              <div key={sz.id} className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px', opacity: sz.aktiv ? 1 : 0.55 }}>
                <span style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>{kat?.icon ?? '📋'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-700)' }}>{sz.titel}</span>
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, background: 'var(--gray-100)', color: 'var(--gray-500)' }}>{kat?.label}</span>
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, background: 'var(--gray-100)', color: 'var(--gray-500)' }}>{sz.schwierigkeitsgrad}</span>
                    {hatKarte && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, background: '#EFF6FF', color: '#1D4ED8' }}>🗺️ Karte</span>}
                    {hatWetter && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, background: '#F0FDF4', color: '#166534' }}>🌤 Wetter</span>}
                    {!sz.aktiv && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, background: '#FFF1F2', color: '#BE123C' }}>Inaktiv</span>}
                  </div>
                  {sz.beschreibung && (
                    <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 4, lineHeight: 1.4 }}>{sz.beschreibung}</div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                    Angelegt: {format(new Date(sz.erstellt_am), 'dd.MM.yyyy', { locale: de })}
                    {sz.erstellt_von && ` von ${sz.erstellt_von.vorname} ${sz.erstellt_von.nachname}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => toggleAktiv(sz)} title={sz.aktiv ? 'Deaktivieren' : 'Aktivieren'}>
                    {sz.aktiv ? '⏸' : '▶'}
                  </button>
                  <button className="btn btn-sm btn-secondary" onClick={() => oeffneEdit(sz)} title="Bearbeiten">✏️</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleLoeschen(sz.id, sz.titel)} title="Löschen">✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal" style={{ maxWidth: '95vw', width: 920, maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3>{editId ? 'Szenario bearbeiten' : 'Neues Szenario anlegen'}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(false)}>✕</button>
            </div>

            {msg && <div className={`alert alert-${msgArt}`} style={{ marginBottom: 16 }}>{msg}</div>}

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--gray-200)', marginBottom: 20 }}>
              <button type="button" style={tabStyle('basis')} onClick={() => setTab('basis')}>Grunddaten</button>
              <button type="button" style={tabStyle('karte')} onClick={() => setTab('karte')}>🗺️ Karte &amp; Objekte</button>
              <button type="button" style={tabStyle('wetter')} onClick={() => setTab('wetter')}>🌤 Wetterlage</button>
              <button type="button" style={tabStyle('phasen')} onClick={() => setTab('phasen')}>📋 Phasen</button>
            </div>

            <form onSubmit={handleSpeichern}>
              {/* Tab: Grunddaten */}
              <div style={{ display: tab === 'basis' ? 'block' : 'none' }}>
                <div className="form-group">
                  <label>Titel *</label>
                  <input
                    value={form.titel}
                    onChange={e => setForm(f => ({ ...f, titel: e.target.value }))}
                    placeholder="z.B. Verkehrsunfall mit eingeklemmter Person"
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Kategorie</label>
                    <select value={form.kategorie} onChange={e => setForm(f => ({ ...f, kategorie: e.target.value }))}>
                      {KATEGORIEN.map(k => <option key={k.value} value={k.value}>{k.icon} {k.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Schwierigkeit</label>
                    <select value={form.schwierigkeitsgrad} onChange={e => setForm(f => ({ ...f, schwierigkeitsgrad: e.target.value }))}>
                      {SCHWIERIGKEITEN.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Alarmierungsmeldung *</label>
                  <textarea
                    value={form.anfangs_meldung}
                    onChange={e => setForm(f => ({ ...f, anfangs_meldung: e.target.value }))}
                    placeholder="ALARMIERUNG: Beschreibung des Einsatzes, Ort, bekannte Lage, alarmierte Kräfte…"
                    rows={4}
                    required
                  />
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                    Diese Meldung wird dem Kamerad zu Beginn präsentiert. Möglichst realistisch formulieren.
                  </div>
                </div>

                <div className="form-group">
                  <label>Interne Beschreibung (optional)</label>
                  <textarea
                    value={form.beschreibung}
                    onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))}
                    placeholder="Lernziele, Schwerpunkte, Hinweise für Ausbilder…"
                    rows={2}
                  />
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                    Nur für Ausbilder sichtbar.
                  </div>
                </div>

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.aktiv} onChange={e => setForm(f => ({ ...f, aktiv: e.target.checked }))} />
                    Szenario aktiv (für Kameraden sichtbar)
                  </label>
                </div>
              </div>

              {/* Tab: Karte & Objekte – immer im DOM, nur versteckt */}
              <div style={{ display: tab === 'karte' ? 'block' : 'none' }}>
                <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 12 }}>
                  Lege die Einsatzposition fest und platziere Objekte vor. Diese werden beim Start einer Übung mit diesem Szenario automatisch übernommen.
                </p>
                <SzMapEditor
                  key={editId ?? 'neu'}
                  initialPosition={form.kartenposition}
                  initialVorgabe={form.kartenvorgabe}
                  onChange={changes => setForm(f => ({ ...f, ...changes }))}
                  visible={tab === 'karte'}
                />
              </div>

              {/* Tab: Wetterlage */}
              <div style={{ display: tab === 'wetter' ? 'block' : 'none' }}>
                <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 16 }}>
                  Die Wetterlage wird beim Planspiel auf der Karte eingeblendet und auf der Anzeigeseite dargestellt.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Wetterlage</label>
                    <select
                      value={form.wetterinfo.wetterlage}
                      onChange={e => setForm(f => ({ ...f, wetterinfo: { ...f.wetterinfo, wetterlage: e.target.value } }))}
                    >
                      <option value="">– keine –</option>
                      {WETTER_LAGEN.map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Windrichtung</label>
                    <select
                      value={form.wetterinfo.windrichtung}
                      onChange={e => setForm(f => ({ ...f, wetterinfo: { ...f.wetterinfo, windrichtung: e.target.value } }))}
                    >
                      <option value="">– keine –</option>
                      {WINDRICHTUNGEN.map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Windstärke</label>
                    <select
                      value={form.wetterinfo.windstaerke}
                      onChange={e => setForm(f => ({ ...f, wetterinfo: { ...f.wetterinfo, windstaerke: e.target.value } }))}
                    >
                      <option value="">– keine –</option>
                      {WINDSTAERKEN.map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                </div>

                {(form.wetterinfo.wetterlage || form.wetterinfo.windrichtung) && (
                  <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--gray-50)', borderRadius: 8, border: '1px solid var(--gray-200)', fontSize: 13, color: 'var(--gray-600)' }}>
                    <strong>Vorschau:</strong>{' '}
                    {[
                      form.wetterinfo.wetterlage,
                      form.wetterinfo.windrichtung && `Wind aus ${form.wetterinfo.windrichtung}`,
                      form.wetterinfo.windstaerke,
                    ].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>

              {/* Tab: Phasen */}
              <div style={{ display: tab === 'phasen' ? 'block' : 'none' }}>
                <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 16 }}>
                  Definiere die Phasen und Checkpunkte für dieses Szenario. Beim Start einer Übung werden diese Phasen übernommen.
                </p>
                <SzPhasenEditor
                  phasen={form.phasen}
                  onChange={phasen => setForm(f => ({ ...f, phasen }))}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--gray-100)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Abbrechen</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Speichern…' : 'Speichern'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Standard-Phasen Modal */}
      {stdModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && stdVersuchtSchliessen()}>
          <div className="modal" style={{ maxWidth: 680, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3>
                Standard-Phasen bearbeiten
                {istWehrAuswahlNoetig && stdWehrId && (
                  <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--gray-400)' }}>
                    {' '}– {wehrenListe.find(w => w.id === stdWehrId)?.name}
                  </span>
                )}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={stdVersuchtSchliessen}>✕</button>
            </div>
            {msg && <div className={`alert alert-${msgArt}`} style={{ marginBottom: 12 }}>{msg}</div>}
            <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 16 }}>
              Diese Phasen werden für alle Planspiel-Übungen verwendet, bei denen das Szenario keine eigenen Phasen definiert.
            </p>
            {stdCloseConfirm && (
              <div style={{ background: '#FEF9EC', border: '1px solid #FCD34D', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ flex: 1, fontSize: 14 }}>⚠️ Es gibt ungespeicherte Änderungen. Möchtest du sie speichern oder verwerfen?</span>
                <button className="btn btn-secondary btn-sm" onClick={stdVerwerfen}>Verwerfen</button>
                <button className="btn btn-primary btn-sm" onClick={speichereStandard} disabled={stdSaving}>
                  {stdSaving ? 'Speichern…' : 'Speichern'}
                </button>
              </div>
            )}
            <SzPhasenEditor phasen={stdPhasen} onChange={stdOnChange} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--gray-100)' }}>
              <button className="btn btn-secondary" onClick={stdVersuchtSchliessen}>Abbrechen</button>
              <button className="btn btn-primary" onClick={speichereStandard} disabled={stdSaving}>
                {stdSaving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
