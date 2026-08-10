import { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

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

const OBJEKT_TYPEN = [
  { id: 'brandherd',   name: 'Brandherd',    emoji: '🔥', farbe: '#DC2626' },
  { id: 'pkw',         name: 'PKW',          emoji: '🚗', farbe: '#6B7280' },
  { id: 'lkw',         name: 'LKW',          emoji: '🚛', farbe: '#374151' },
  { id: 'person',      name: 'Person/Opfer', emoji: '👤', farbe: '#7C3AED' },
  { id: 'gefahrstoff', name: 'Gefahrstoff',  emoji: '☢️', farbe: '#F59E0B' },
  { id: 'hydrant',     name: 'Hydrant',      emoji: '💧', farbe: '#2563EB' },
  { id: 'verteiler',   name: 'Verteiler',    emoji: '🔵', farbe: '#0891B2' },
  { id: 'pin',         name: 'Markierung',   emoji: '📍', farbe: '#DC2626' },
]

const SZ_ZONE_TYPEN = [
  { id: 'absperrung',    name: 'Absperrbereich', farbe: '#DC2626', fill: 0.15, dash: false },
  { id: 'bereitstellung',name: 'Bereitstellung',  farbe: '#D97706', fill: 0.15, dash: false },
  { id: 'rauch',         name: 'Rauchsäule',      farbe: '#6B7280', fill: 0.3,  dash: true  },
  { id: 'fluessigkeit',  name: 'Auslauffläche',   farbe: '#92400E', fill: 0.3,  dash: true  },
]

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

function SzMapEditor({ initialPosition, initialVorgabe, onChange, visible }) {
  const mapRef = useRef(null)
  const layersRef = useRef([])
  const posMarkerRef = useRef(null)
  const zoneVerticesRef = useRef([])
  const zonePreviewRef = useRef(null)
  const zoneVertexMarkersRef = useRef([])

  const [elemente, setElemente] = useState(initialVorgabe?.elemente ?? [])
  const [zonen, setZonen] = useState(initialVorgabe?.zonen ?? [])
  const [werkzeug, setWerkzeug] = useState('position')
  const [position, setPosition] = useState(initialPosition)

  const elementeRef = useRef(elemente)
  const zonenRef = useRef(zonen)
  const werkzeugRef = useRef(werkzeug)

  useEffect(() => { elementeRef.current = elemente }, [elemente])
  useEffect(() => { zonenRef.current = zonen }, [zonen])
  useEffect(() => { werkzeugRef.current = werkzeug }, [werkzeug])

  useEffect(() => {
    if (visible && mapRef.current) {
      setTimeout(() => mapRef.current?.invalidateSize(), 50)
    }
  }, [visible])

  const mapContainer = useCallback((node) => {
    if (!node || mapRef.current) return
    const startPos = initialPosition ? [initialPosition.lat, initialPosition.lng] : [51.1657, 10.4515]
    const startZoom = initialPosition?.zoom ?? 13
    const map = L.map(node).setView(startPos, startZoom)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)

    map.on('click', (e) => {
      const { latlng } = e
      const wz = werkzeugRef.current

      if (wz === 'position') {
        const newPos = { lng: latlng.lng, lat: latlng.lat, zoom: map.getZoom() }
        setPosition(newPos)
        onChange({ kartenposition: newPos })
        return
      }

      if (wz.startsWith('zone:')) {
        const newVerts = [...zoneVerticesRef.current, [latlng.lat, latlng.lng]]
        zoneVerticesRef.current = newVerts
        const vm = L.circleMarker([latlng.lat, latlng.lng], {
          radius: 4, color: '#374151', fillColor: '#374151', fillOpacity: 1,
        }).addTo(map)
        zoneVertexMarkersRef.current.push(vm)
        if (zonePreviewRef.current) map.removeLayer(zonePreviewRef.current)
        if (newVerts.length >= 2) {
          const zoneId = wz.replace('zone:', '')
          const typ = SZ_ZONE_TYPEN.find(z => z.id === zoneId)
          zonePreviewRef.current = L.polygon(newVerts, {
            color: typ?.farbe ?? '#666', fillOpacity: typ?.fill ?? 0.2,
            dashArray: typ?.dash ? '8 6' : null, weight: 2, interactive: false,
          }).addTo(map)
        }
        return
      }

      const typ = OBJEKT_TYPEN.find(t => t.id === wz)
      if (!typ) return
      const el = { id: String(Date.now()) + String(Math.random()), typ: typ.id, koord: [latlng.lng, latlng.lat] }
      setElemente(prev => {
        const next = [...prev, el]
        onChange({ kartenvorgabe: { elemente: next, zonen: zonenRef.current } })
        return next
      })
    })

    mapRef.current = map
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Position-Marker
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (posMarkerRef.current) { map.removeLayer(posMarkerRef.current); posMarkerRef.current = null }
    if (position) {
      const icon = L.divIcon({
        html: '<div style="width:16px;height:16px;border-radius:50%;background:#3B82F6;border:3px solid white;box-shadow:0 0 0 2px #3B82F6"></div>',
        className: '', iconSize: [16, 16], iconAnchor: [8, 8],
      })
      posMarkerRef.current = L.marker([position.lat, position.lng], { icon, interactive: false }).addTo(map)
    }
  }, [position])

  // Objekte & Zonen rendern
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    layersRef.current.forEach(l => map.removeLayer(l))
    layersRef.current = []

    elemente.forEach(el => {
      const typ = OBJEKT_TYPEN.find(t => t.id === el.typ)
      if (!typ) return
      const icon = L.divIcon({
        html: `<div style="font-size:22px;line-height:1;cursor:pointer">${typ.emoji}</div>`,
        className: '', iconSize: [28, 28], iconAnchor: [14, 14],
      })
      const marker = L.marker([el.koord[1], el.koord[0]], { icon })
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        setElemente(prev => {
          const next = prev.filter(x => x.id !== el.id)
          onChange({ kartenvorgabe: { elemente: next, zonen: zonenRef.current } })
          return next
        })
      })
      marker.addTo(map)
      layersRef.current.push(marker)
    })

    zonen.forEach(zone => {
      const typ = SZ_ZONE_TYPEN.find(z => z.id === zone.typ)
      const poly = L.polygon(zone.punkte, {
        color: typ?.farbe ?? '#666', fillOpacity: typ?.fill ?? 0.2,
        dashArray: typ?.dash ? '8 6' : null, weight: 2,
      })
      poly.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        setZonen(prev => {
          const next = prev.filter(z => z.id !== zone.id)
          onChange({ kartenvorgabe: { elemente: elementeRef.current, zonen: next } })
          return next
        })
      })
      poly.addTo(map)
      layersRef.current.push(poly)
    })
  }, [elemente, zonen]) // eslint-disable-line react-hooks/exhaustive-deps

  function schliesseZone() {
    const verts = zoneVerticesRef.current
    if (verts.length < 3) return alert('Mindestens 3 Punkte für eine Zone.')
    const zoneId = werkzeug.replace('zone:', '')
    const zone = { id: String(Date.now()), typ: zoneId, punkte: verts }
    if (zonePreviewRef.current) { mapRef.current?.removeLayer(zonePreviewRef.current); zonePreviewRef.current = null }
    zoneVertexMarkersRef.current.forEach(m => mapRef.current?.removeLayer(m))
    zoneVertexMarkersRef.current = []
    zoneVerticesRef.current = []
    setZonen(prev => {
      const next = [...prev, zone]
      onChange({ kartenvorgabe: { elemente: elementeRef.current, zonen: next } })
      return next
    })
  }

  function clearZoneInProgress() {
    if (zonePreviewRef.current) { mapRef.current?.removeLayer(zonePreviewRef.current); zonePreviewRef.current = null }
    zoneVertexMarkersRef.current.forEach(m => mapRef.current?.removeLayer(m))
    zoneVertexMarkersRef.current = []
    zoneVerticesRef.current = []
  }

  function loescheAlles() {
    layersRef.current.forEach(l => mapRef.current?.removeLayer(l))
    layersRef.current = []
    clearZoneInProgress()
    setElemente([])
    setZonen([])
    onChange({ kartenvorgabe: { elemente: [], zonen: [] } })
  }

  const istZoneModus = werkzeug.startsWith('zone:')

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
        {OBJEKT_TYPEN.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setWerkzeug(t.id)}
            className={werkzeug === t.id ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
          >
            {t.emoji} {t.name}
          </button>
        ))}
        <span style={{ color: 'var(--gray-300)', fontSize: 11 }}>│</span>
        {SZ_ZONE_TYPEN.map(z => (
          <button
            key={z.id}
            type="button"
            onClick={() => { clearZoneInProgress(); setWerkzeug('zone:' + z.id) }}
            className={werkzeug === 'zone:' + z.id ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
          >
            {z.name}
          </button>
        ))}
      </div>

      {istZoneModus && (
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#FEF9EC', borderRadius: 6, border: '1px solid #FCD34D', fontSize: 13 }}>
          <span>Punkte auf Karte klicken, dann</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={schliesseZone}>Zone schließen ↩</button>
        </div>
      )}

      <div ref={mapContainer} style={{ height: 380, borderRadius: 8, border: '1px solid var(--gray-200)' }} />

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

      <div style={{ marginTop: 4, fontSize: 12, color: 'var(--gray-400)' }}>
        💡{' '}
        {werkzeug === 'position'
          ? 'Klick auf Karte setzt die Einsatzposition (blauer Punkt). Die Übungskarte wird darauf zentriert.'
          : istZoneModus
          ? 'Eckpunkte anklicken, dann „Zone schließen". Klick auf Zone entfernt sie.'
          : 'Klick auf Karte platziert das Objekt. Klick auf ein Objekt entfernt es wieder.'}
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

  // Standard-Phasen
  const [standardPhasen, setStandardPhasen] = useState(null)
  const [stdModal, setStdModal] = useState(false)
  const [stdPhasen, setStdPhasen] = useState(leerPhasen())
  const [stdSaving, setStdSaving] = useState(false)
  const [stdDirty, setStdDirty] = useState(false)
  const [stdCloseConfirm, setStdCloseConfirm] = useState(false)
  const stdOriginalRef = useRef(null)

  useEffect(() => { ladeSzenarien(); ladeStandardPhasen() }, [])

  async function ladeStandardPhasen() {
    const { data } = await supabase
      .from('planspiel_config')
      .select('standard_phasen')
      .eq('wehr_id', profile.wehr_id)
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
    setStdSaving(true)
    await supabase.from('planspiel_config').upsert(
      { wehr_id: profile.wehr_id, standard_phasen: stdPhasen },
      { onConflict: 'wehr_id' }
    )
    setStandardPhasen(stdPhasen)
    setStdModal(false)
    setStdDirty(false)
    setStdCloseConfirm(false)
    setStdSaving(false)
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
    setForm(LEER_FORM)
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

    if (editId) {
      await supabase.from('szenarien').update(payload).eq('id', editId)
      setMsg('Szenario gespeichert.')
    } else {
      await supabase.from('szenarien').insert({ ...payload, erstellt_von: profile.id })
      setMsg('Szenario angelegt.')
    }

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

      {msg && <div className="alert alert-success">{msg}</div>}

      {/* Standard-Phasen */}
      <div className="card" style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px' }}>
        <span style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>📋</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--gray-700)', marginBottom: 4 }}>Standard-Phasen</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', lineHeight: 1.5 }}>
            {standardPhasen
              ? standardPhasen.map(p => `${p.emoji ?? ''} ${p.name}`).join(' · ')
              : leerPhasen().map(p => `${p.emoji} ${p.name}`).join(' · ')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
            Werden verwendet wenn ein Szenario keine eigenen Phasen definiert.
          </div>
        </div>
        <button className="btn btn-sm btn-secondary" onClick={oeffneStdModal} style={{ flexShrink: 0 }}>
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
              <h3>Standard-Phasen bearbeiten</h3>
              <button className="btn btn-ghost btn-sm" onClick={stdVersuchtSchliessen}>✕</button>
            </div>
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
