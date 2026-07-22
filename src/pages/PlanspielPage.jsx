import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

// ─── Konstanten ──────────────────────────────────────────────────────────────

const STANDARD_PHASEN = [
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

const FAHRZEUG_TYPEN = [
  { id: 'lf10',  name: 'LF 10',  emoji: '🚒', farbe: '#DC2626' },
  { id: 'hlf20', name: 'HLF 20', emoji: '🚒', farbe: '#B91C1C' },
  { id: 'tlf',   name: 'TLF',    emoji: '🚒', farbe: '#EA580C' },
  { id: 'dlk',   name: 'DLK',    emoji: '🚒', farbe: '#CA8A04' },
  { id: 'rw',    name: 'RW',     emoji: '🔧', farbe: '#16A34A' },
  { id: 'elw',   name: 'ELW',    emoji: '🚐', farbe: '#7C3AED' },
  { id: 'rtw',   name: 'RTW',    emoji: '🚑', farbe: '#2563EB' },
  { id: 'ktw',   name: 'KTW',    emoji: '🚑', farbe: '#1D4ED8' },
]

const TRUPP_TYPEN = [
  { id: 'at', name: 'Angriffstrupp', emoji: '🧑‍🚒', farbe: '#DC2626' },
  { id: 'wt', name: 'Wassertrupp',   emoji: '🧑‍🚒', farbe: '#2563EB' },
  { id: 'st', name: 'Sicherheitstrupp', emoji: '🧑‍🚒', farbe: '#16A34A' },
  { id: 'me', name: 'Melder',         emoji: '🧑‍🚒', farbe: '#D97706' },
]

const PUNKT_TYPEN = [
  { id: 'hydrant',  name: 'Hydrant',   emoji: '💧', farbe: '#2563EB' },
  { id: 'verteiler', name: 'Verteiler', emoji: '🔵', farbe: '#0891B2' },
  { id: 'pin',      name: 'Markierung', emoji: '📍', farbe: '#DC2626' },
]

const LINIE_TYPEN = [
  { id: 'b_schlauch', name: 'B-Schlauch', farbe: '#2563EB', breite: 5 },
  { id: 'c_schlauch', name: 'C-Schlauch', farbe: '#16A34A', breite: 3 },
]

const ZONE_TYPEN = [
  { id: 'absperrung',     name: 'Absperrbereich',    farbe: '#DC2626' },
  { id: 'bereitstellung', name: 'Bereitstellungsraum', farbe: '#D97706' },
  { id: 'abschnitt',     name: 'Einsatzabschnitt',   farbe: '#7C3AED' },
]

function phasenVonStandard() {
  return STANDARD_PHASEN.map(p => ({
    ...p,
    aktiv: p.id === 'wache',
    abgeschlossen: false,
    checkpunkte: p.checkpunkte.map((t, i) => ({ id: p.id + '_' + i, text: t, erledigt: false })),
    extra: [],
  }))
}

// ─── PlanspielPage ────────────────────────────────────────────────────────────

export default function PlanspielPage() {
  const { profile, isAusbilder, isAdmin } = useAuth()
  const kannLeiten = isAusbilder || isAdmin
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('liste') // liste | neu | aktiv | abgeschlossen
  const [aktiveSession, setAktiveSession] = useState(null)

  useEffect(() => { laden() }, [])

  async function laden() {
    const { data } = await supabase
      .from('planspiel_sessions')
      .select('*, erstellt_von:profiles(vorname,nachname), szenario:szenarien(titel,kategorie,anfangs_meldung)')
      .order('erstellt_am', { ascending: false })
    setSessions(data ?? [])
    setLoading(false)
  }

  async function handleLoeschen(s) {
    if (!confirm(`"${s.titel}" wirklich löschen?`)) return
    await supabase.from('planspiel_sessions').delete().eq('id', s.id)
    laden()
  }

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>
  if (view === 'neu') return <PlanspielNeu profile={profile} onBack={() => { setView('liste'); laden() }} />
  if (view === 'aktiv' && aktiveSession) return (
    <PlanspielAktiv
      session={aktiveSession}
      kannLeiten={kannLeiten}
      onBack={() => { setView('liste'); laden() }}
      onUpdate={s => setAktiveSession(s)}
    />
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Planspiel</h1>
          <p style={{ marginTop: 4 }}>Taktische Übungen auf Satellitenkarte</p>
        </div>
        {kannLeiten && (
          <button className="btn btn-primary" onClick={() => setView('neu')}>+ Neue Übung</button>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="empty-state card">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>
          <p>Noch keine Planspiel-Sessions</p>
          {kannLeiten && <button className="btn btn-primary" onClick={() => setView('neu')}>Erste Übung starten</button>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sessions.map(s => (
            <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 500, fontSize: 15, color: 'var(--gray-700)' }}>🗺️ {s.titel}</span>
                  <span className={`badge badge-${s.status === 'aktiv' ? 'green' : 'gray'}`}>
                    {s.status === 'aktiv' ? 'Aktiv' : 'Abgeschlossen'}
                  </span>
                  {s.szenario && <span className="badge badge-amber" style={{ fontSize: 11 }}>{s.szenario.titel}</span>}
                </div>
                <p style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                  {s.erstellt_von?.vorname} {s.erstellt_von?.nachname} · {format(new Date(s.erstellt_am), 'd. MMM yyyy HH:mm', { locale: de })}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn btn-sm btn-primary" onClick={() => { setAktiveSession(s); setView('aktiv') }}>
                  {s.status === 'aktiv' ? '▶ Öffnen' : '👁 Ansehen'}
                </button>
                {kannLeiten && s.status === 'aktiv' && (
                  <button className="btn btn-sm btn-danger" onClick={() => handleLoeschen(s)}>Löschen</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── PlanspielNeu ─────────────────────────────────────────────────────────────

function PlanspielNeu({ profile, onBack }) {
  const [szenarien, setSzenarien] = useState([])
  const [form, setForm] = useState({ titel: '', szenario_id: '', adresse: '' })
  const [extraPhasen, setExtraPhasen] = useState([])
  const [neuePhase, setNeuePhase] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('szenarien').select('id,titel,kategorie,anfangs_meldung').eq('aktiv', true).order('titel')
      .then(({ data }) => setSzenarien(data ?? []))
  }, [])

  async function handleStart() {
    if (!form.titel) return alert('Titel eingeben')
    setSaving(true)

    // Adresse zu Koordinaten auflösen (Mapbox Geocoding)
    let center = { lng: 10.4515, lat: 51.1657, zoom: 13 }
    if (form.adresse.trim() && import.meta.env.VITE_MAPBOX_TOKEN?.startsWith('pk.')) {
      try {
        const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(form.adresse)}.json?access_token=${import.meta.env.VITE_MAPBOX_TOKEN}&country=de&limit=1`)
        const geo = await res.json()
        if (geo.features?.length > 0) {
          const [lng, lat] = geo.features[0].center
          center = { lng, lat, zoom: 16 }
        }
      } catch {}
    }

    // Phasen zusammenbauen
    const phasen = phasenVonStandard()
    extraPhasen.forEach(name => {
      phasen.push({ id: 'extra_' + Date.now() + Math.random(), name, aktiv: false, abgeschlossen: false, checkpunkte: [], extra: [] })
    })

    const { data, error } = await supabase.from('planspiel_sessions').insert({
      titel: form.titel,
      szenario_id: form.szenario_id || null,
      wehr_id: profile.wehr_id,
      erstellt_von: profile.id,
      status: 'aktiv',
      phasen,
      map_center: center,
      kartenzustand: { elemente: [], linien: [], zonen: [] },
      lage_updates: [],
    }).select('*, szenario:szenarien(titel,kategorie,anfangs_meldung)').single()

    setSaving(false)
    if (!error && data) onBack()
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurück</button>
          <h1>Neue Übung</h1>
        </div>
        <button className="btn btn-primary" onClick={handleStart} disabled={saving}>
          {saving ? 'Wird erstellt...' : '▶ Übung starten'}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 16 }}>Grunddaten</h3>
        <div className="form-group">
          <label>Titel der Übung</label>
          <input value={form.titel} onChange={e => setForm(f => ({ ...f, titel: e.target.value }))} placeholder="z.B. Wohnungsbrand Musterstraße" />
        </div>
        <div className="form-group">
          <label>Szenario (optional)</label>
          <select value={form.szenario_id} onChange={e => setForm(f => ({ ...f, szenario_id: e.target.value }))}>
            <option value="">– Kein Szenario –</option>
            {szenarien.map(s => <option key={s.id} value={s.id}>{s.titel}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Einsatzadresse <span style={{ fontWeight: 400, color: 'var(--gray-400)', fontSize: 12 }}>(Karte wird darauf zentriert)</span></label>
          <input value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} placeholder="z.B. Hauptstraße 1, 99310 Arnstadt" />
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Phasen</h3>
        <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 16 }}>Standard-Phasen sind vorbelegt. Weitere Phasen optional ergänzen.</p>
        {STANDARD_PHASEN.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--gray-50)', border: '1px solid var(--gray-200)', marginBottom: 6 }}>
            <span style={{ fontSize: 18 }}>{p.id === 'wache' ? '🏠' : p.id === 'anfahrt' ? '🚗' : p.id === 'einsatzstelle' ? '🔥' : '📋'}</span>
            <span style={{ fontWeight: 500, fontSize: 14 }}>{p.name}</span>
            <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>{p.checkpunkte.length} Checkpunkte</span>
          </div>
        ))}
        {extraPhasen.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: '#FEF9EC', border: '1px solid #FCD34D', marginBottom: 6 }}>
            <span>➕</span>
            <span style={{ flex: 1, fontWeight: 500, fontSize: 14 }}>{p}</span>
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => setExtraPhasen(ep => ep.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input value={neuePhase} onChange={e => setNeuePhase(e.target.value)} placeholder="Neue Phase hinzufügen..." onKeyDown={e => { if (e.key === 'Enter' && neuePhase.trim()) { setExtraPhasen(ep => [...ep, neuePhase.trim()]); setNeuePhase('') } }} />
          <button className="btn btn-secondary" onClick={() => { if (neuePhase.trim()) { setExtraPhasen(ep => [...ep, neuePhase.trim()]); setNeuePhase('') } }}>+ Hinzufügen</button>
        </div>
      </div>
    </div>
  )
}

// ─── PlanspielAktiv ───────────────────────────────────────────────────────────

function PlanspielAktiv({ session: initialSession, kannLeiten, onBack }) {
  const [session, setSession] = useState(initialSession)
  const [phasen, setPhasen] = useState(initialSession.phasen ?? [])
  const [karte, setKarte] = useState(initialSession.kartenzustand ?? { elemente: [], linien: [], zonen: [] })
  const [lageUpdates, setLageUpdates] = useState(initialSession.lage_updates ?? [])
  const [neuesUpdate, setNeuesUpdate] = useState('')
  const [aktivePhasenId, setAktivePhasenId] = useState(initialSession.phasen?.find(p => p.aktiv)?.id ?? initialSession.phasen?.[0]?.id)
  const [neuerCheckpunkt, setNeuerCheckpunkt] = useState('')
  const [werkzeug, setWerkzeug] = useState(null) // { typ: 'fahrzeug'|'trupp'|'punkt'|'linie'|'zone', subtyp: id }
  const [zeichneLinie, setZeichneLinie] = useState(null) // { typ, punkte: [[lng,lat]...] }
  const [saving, setSaving] = useState(false)
  const [seitenleiste, setSeitenleiste] = useState('phasen') // phasen | lage | elemente
  const [seitenleiteOffen, setSeitenleiteOffen] = useState(true)
  const [szenario3D, setSzenario3D] = useState(false)
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const markerRefs = useRef({}) // elementId -> mapboxgl.Marker
  const linieLayerIds = useRef([])
  const zoneLayerIds = useRef([])

  // Karte initialisieren
  useEffect(() => {
    if (!mapContainer.current) return
    const center = session.map_center ?? { lng: 10.4515, lat: 51.1657, zoom: 14 }
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [center.lng, center.lat],
      zoom: center.zoom ?? 14,
    })
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    mapRef.current = map

    map.on('load', () => {
      // Bestehende Linien & Zonen rendern
      renderLinien(map, karte.linien ?? [])
      renderZonen(map, karte.zonen ?? [])
    })

    // Kartenklick: Element platzieren oder Linienpunkt hinzufügen
    map.on('click', (e) => {
      const { lng, lat } = e.lngLat
      setWerkzeug(w => {
        if (!w) return w
        if (w.typ === 'fahrzeug' || w.typ === 'trupp' || w.typ === 'punkt') {
          const id = crypto.randomUUID()
          const neuesElement = { id, typ: w.typ, subtyp: w.subtyp, position: [lng, lat] }
          setKarte(k => {
            const neu = { ...k, elemente: [...k.elemente, neuesElement] }
            return neu
          })
          return null // Werkzeug nach Platzierung zurücksetzen
        }
        if (w.typ === 'linie') {
          setZeichneLinie(zl => {
            if (!zl) return { typ: w.subtyp, punkte: [[lng, lat]] }
            return { ...zl, punkte: [...zl.punkte, [lng, lat]] }
          })
          return w
        }
        if (w.typ === 'zone') {
          setZeichneLinie(zl => {
            if (!zl) return { typ: w.subtyp, isZone: true, punkte: [[lng, lat]] }
            return { ...zl, punkte: [...zl.punkte, [lng, lat]] }
          })
          return w
        }
        return w
      })
    })

    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Marker für Elemente synchron halten
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const aktuelleIds = new Set(karte.elemente.map(e => e.id))

    // Entfernte Marker löschen
    Object.entries(markerRefs.current).forEach(([id, marker]) => {
      if (!aktuelleIds.has(id)) { marker.remove(); delete markerRefs.current[id] }
    })

    // Neue/aktualisierte Marker setzen
    karte.elemente.forEach(el => {
      if (!markerRefs.current[el.id]) {
        const markerEl = document.createElement('div')
        markerEl.style.cssText = `
          background: ${elFarbe(el)}; color: white; border-radius: 6px; padding: 4px 6px;
          font-size: 20px; cursor: grab; box-shadow: 0 2px 6px rgba(0,0,0,0.4);
          border: 2px solid white; display: flex; align-items: center; gap: 4px;
          user-select: none; white-space: nowrap;
        `
        markerEl.innerHTML = `<span>${elEmoji(el)}</span><span style="font-size:10px;font-weight:700;">${elName(el)}</span>`

        // Doppelklick zum Löschen
        markerEl.addEventListener('dblclick', (e) => {
          e.stopPropagation()
          if (kannLeiten) {
            setKarte(k => ({ ...k, elemente: k.elemente.filter(x => x.id !== el.id) }))
          }
        })

        const marker = new mapboxgl.Marker({ element: markerEl, draggable: kannLeiten })
          .setLngLat(el.position)
          .addTo(map)

        marker.on('dragend', () => {
          const pos = marker.getLngLat()
          setKarte(k => ({
            ...k,
            elemente: k.elemente.map(x => x.id === el.id ? { ...x, position: [pos.lng, pos.lat] } : x)
          }))
        })

        markerRefs.current[el.id] = marker
      } else {
        markerRefs.current[el.id].setLngLat(el.position)
      }
    })
  }, [karte.elemente])

  // Linien & Zonen neu rendern wenn sie sich ändern
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    renderLinien(map, karte.linien ?? [])
    renderZonen(map, karte.zonen ?? [])
  }, [karte.linien, karte.zonen])

  // Zeichnungsvorschau (Linie im Aufbau)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const previewId = 'preview-linie'
    if (map.getLayer(previewId)) map.removeLayer(previewId)
    if (map.getSource(previewId)) map.removeSource(previewId)

    if (!zeichneLinie || zeichneLinie.punkte.length < 2) return
    const typ = LINIE_TYPEN.find(l => l.id === zeichneLinie.typ) ?? LINIE_TYPEN[0]
    map.addSource(previewId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: zeichneLinie.punkte } } })
    map.addLayer({ id: previewId, type: 'line', source: previewId, paint: { 'line-color': typ.farbe, 'line-width': typ.breite ?? 3, 'line-dasharray': [4, 2] } })
  }, [zeichneLinie])

  // 3D-Gebäude togglen
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    if (szenario3D) {
      if (!map.getLayer('3d-buildings')) {
        map.addLayer({ id: '3d-buildings', source: 'composite', 'source-layer': 'building', filter: ['==', 'extrude', 'true'], type: 'fill-extrusion', minzoom: 15, paint: { 'fill-extrusion-color': '#aaa', 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-base': ['get', 'min_height'], 'fill-extrusion-opacity': 0.7 } })
      }
    } else {
      if (map.getLayer('3d-buildings')) map.removeLayer('3d-buildings')
    }
  }, [szenario3D])

  function renderLinien(map, linien) {
    linieLayerIds.current.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id) })
    linieLayerIds.current = []
    linien.forEach(l => {
      if (l.punkte.length < 2) return
      const typ = LINIE_TYPEN.find(x => x.id === l.typ) ?? LINIE_TYPEN[0]
      const srcId = 'linie-' + l.id
      map.addSource(srcId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: l.punkte } } })
      map.addLayer({ id: srcId, type: 'line', source: srcId, paint: { 'line-color': typ.farbe, 'line-width': typ.breite ?? 3 } })
      linieLayerIds.current.push(srcId)
    })
  }

  function renderZonen(map, zonen) {
    zoneLayerIds.current.forEach(id => {
      if (map.getLayer(id + '-fill')) map.removeLayer(id + '-fill')
      if (map.getLayer(id + '-border')) map.removeLayer(id + '-border')
      if (map.getSource(id)) map.removeSource(id)
    })
    zoneLayerIds.current = []
    zonen.forEach(z => {
      if (z.punkte.length < 3) return
      const typ = ZONE_TYPEN.find(x => x.id === z.typ) ?? ZONE_TYPEN[0]
      const srcId = 'zone-' + z.id
      const coords = [...z.punkte, z.punkte[0]] // Ring schließen
      map.addSource(srcId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] } } })
      map.addLayer({ id: srcId + '-fill', type: 'fill', source: srcId, paint: { 'fill-color': typ.farbe, 'fill-opacity': 0.2 } })
      map.addLayer({ id: srcId + '-border', type: 'line', source: srcId, paint: { 'line-color': typ.farbe, 'line-width': 2 } })
      zoneLayerIds.current.push(srcId)
    })
  }

  function linieFertig() {
    if (!zeichneLinie || zeichneLinie.punkte.length < 2) { setZeichneLinie(null); setWerkzeug(null); return }
    const id = crypto.randomUUID()
    if (zeichneLinie.isZone) {
      if (zeichneLinie.punkte.length < 3) { setZeichneLinie(null); setWerkzeug(null); return }
      setKarte(k => ({ ...k, zonen: [...k.zonen, { id, typ: zeichneLinie.typ, punkte: zeichneLinie.punkte }] }))
    } else {
      setKarte(k => ({ ...k, linien: [...k.linien, { id, typ: zeichneLinie.typ, punkte: zeichneLinie.punkte }] }))
    }
    setZeichneLinie(null)
    setWerkzeug(null)
  }

  function letztenPunktLoeschen() {
    if (!zeichneLinie) return
    if (zeichneLinie.punkte.length <= 1) { setZeichneLinie(null); setWerkzeug(null); return }
    setZeichneLinie(zl => ({ ...zl, punkte: zl.punkte.slice(0, -1) }))
  }

  function letzteLinieLoeschen() {
    setKarte(k => ({ ...k, linien: k.linien.slice(0, -1) }))
  }

  function letzteZoneLoeschen() {
    setKarte(k => ({ ...k, zonen: k.zonen.slice(0, -1) }))
  }

  function alleElementeLoeschen() {
    if (!confirm('Alle Elemente auf der Karte löschen?')) return
    setKarte({ elemente: [], linien: [], zonen: [] })
  }

  // Checkpunkt togglen
  function checkpunktToggle(phasenId, cpId) {
    if (!kannLeiten) return
    setPhasen(ps => ps.map(p => p.id !== phasenId ? p : {
      ...p,
      checkpunkte: p.checkpunkte.map(cp => cp.id === cpId ? { ...cp, erledigt: !cp.erledigt } : cp)
    }))
  }

  // Extra-Checkpunkt hinzufügen
  function addCheckpunkt(phasenId) {
    if (!neuerCheckpunkt.trim()) return
    setPhasen(ps => ps.map(p => p.id !== phasenId ? p : {
      ...p,
      checkpunkte: [...p.checkpunkte, { id: Date.now() + '', text: neuerCheckpunkt.trim(), erledigt: false }]
    }))
    setNeuerCheckpunkt('')
  }

  // Phase abschließen
  function phaseAbschliessen(phasenId) {
    const idx = phasen.findIndex(p => p.id === phasenId)
    if (idx < 0) return
    setPhasen(ps => ps.map((p, i) => ({
      ...p,
      abgeschlossen: i < idx ? true : p.abgeschlossen,
      aktiv: i === idx + 1,
    })))
    if (idx + 1 < phasen.length) setAktivePhasenId(phasen[idx + 1].id)
  }

  // Lage-Update hinzufügen
  function addLageUpdate() {
    if (!neuesUpdate.trim()) return
    const upd = { id: Date.now() + '', text: neuesUpdate.trim(), zeit: new Date().toISOString() }
    setLageUpdates(lu => [upd, ...lu])
    setNeuesUpdate('')
  }

  // Speichern
  async function speichern(abschliessen = false) {
    setSaving(true)
    const center = mapRef.current ? { lng: mapRef.current.getCenter().lng, lat: mapRef.current.getCenter().lat, zoom: mapRef.current.getZoom() } : session.map_center
    await supabase.from('planspiel_sessions').update({
      kartenzustand: karte,
      phasen,
      lage_updates: lageUpdates,
      map_center: center,
      status: abschliessen ? 'abgeschlossen' : session.status,
      abgeschlossen_am: abschliessen ? new Date().toISOString() : session.abgeschlossen_am,
    }).eq('id', session.id)
    setSaving(false)
    if (abschliessen) onBack()
  }

  const aktivPhase = phasen.find(p => p.id === aktivePhasenId)
  const istAbgeschlossen = session.status === 'abgeschlossen'
  const cursorStyle = werkzeug ? (werkzeug.typ === 'linie' || werkzeug.typ === 'zone' ? 'crosshair' : 'copy') : 'grab'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 130px)', minHeight: 600 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurück</button>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>🗺️ {session.titel}</span>
          {session.szenario && <span className="badge badge-amber" style={{ marginLeft: 8, fontSize: 11 }}>{session.szenario.titel}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--gray-600)', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={szenario3D} onChange={e => setSzenario3D(e.target.checked)} style={{ width: 'auto' }} />
            3D
          </label>
          {kannLeiten && !istAbgeschlossen && (
            <>
              <button className="btn btn-sm btn-secondary" onClick={() => speichern(false)} disabled={saving}>
                {saving ? '…' : '💾 Speichern'}
              </button>
              <button className="btn btn-sm btn-danger" onClick={() => { if (confirm('Übung abschließen?')) speichern(true) }} disabled={saving}>
                ✓ Abschließen
              </button>
            </>
          )}
        </div>
      </div>

      {/* Szenario-Meldung Banner */}
      {session.szenario?.anfangs_meldung && (
        <div style={{ background: '#FEF9EC', border: '1px solid #FCD34D', borderRadius: 8, padding: '10px 14px', marginBottom: 10, fontSize: 13, color: '#92400E' }}>
          <strong>Lagedarstellung:</strong> {session.szenario.anfangs_meldung}
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, gap: 10, minHeight: 0 }}>
        {/* Seitenleiste */}
        <div style={{ width: seitenleiteOffen ? 300 : 36, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0, transition: 'width 200ms', overflow: 'hidden' }}>
          <button
            onClick={() => setSeitenleiteOffen(o => !o)}
            style={{ width: '100%', padding: '6px 8px', background: 'var(--gray-800)', color: 'white', border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            {seitenleiteOffen ? <span>◀ Einklappen</span> : <span style={{ writingMode: 'vertical-rl', fontSize: 10 }}>▶</span>}
          </button>

          {seitenleiteOffen && (
            <div style={{ flex: 1, background: 'white', border: '1px solid var(--gray-200)', borderRadius: '0 0 8px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Tab-Leiste */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--gray-200)' }}>
                {[['phasen', '📋 Phasen'], ['lage', '⚡ Lage'], ['elemente', '🗂 Elemente']].map(([key, label]) => (
                  <button key={key} onClick={() => setSeitenleiste(key)} style={{
                    flex: 1, padding: '8px 4px', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: seitenleiste === key ? 600 : 400,
                    background: seitenleiste === key ? 'var(--gray-50)' : 'white',
                    color: seitenleiste === key ? 'var(--red)' : 'var(--gray-500)',
                    borderBottom: seitenleiste === key ? '2px solid var(--red)' : '2px solid transparent',
                  }}>{label}</button>
                ))}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                {/* Phasen-Tab */}
                {seitenleiste === 'phasen' && (
                  <div>
                    {phasen.map(p => {
                      const istAktiv = p.id === aktivePhasenId
                      const erledigt = p.checkpunkte.filter(c => c.erledigt).length
                      const gesamt = p.checkpunkte.length
                      return (
                        <div key={p.id} style={{ marginBottom: 10, borderRadius: 8, border: `2px solid ${istAktiv ? 'var(--red)' : p.abgeschlossen ? '#A9DFBF' : 'var(--gray-200)'}`, overflow: 'hidden' }}>
                          <div
                            onClick={() => setAktivePhasenId(p.id)}
                            style={{ padding: '8px 12px', background: istAktiv ? 'var(--red-pale)' : p.abgeschlossen ? '#EAFAF1' : 'var(--gray-50)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                          >
                            <span style={{ fontSize: 16 }}>{p.abgeschlossen ? '✅' : istAktiv ? '▶' : '○'}</span>
                            <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: istAktiv ? 'var(--red-dark)' : 'var(--gray-700)' }}>{p.name}</span>
                            {gesamt > 0 && <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>{erledigt}/{gesamt}</span>}
                          </div>
                          {istAktiv && (
                            <div style={{ padding: '8px 12px' }}>
                              {p.checkpunkte.map(cp => (
                                <label key={cp.id} onClick={() => checkpunktToggle(p.id, cp.id)} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', cursor: kannLeiten ? 'pointer' : 'default', borderBottom: '1px solid var(--gray-100)' }}>
                                  <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${cp.erledigt ? 'var(--red)' : 'var(--gray-300)'}`, background: cp.erledigt ? 'var(--red)' : 'white', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                                    {cp.erledigt && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20,6 9,17 4,12"/></svg>}
                                  </div>
                                  <span style={{ fontSize: 12, color: cp.erledigt ? 'var(--gray-400)' : 'var(--gray-700)', textDecoration: cp.erledigt ? 'line-through' : 'none', lineHeight: 1.4 }}>{cp.text}</span>
                                </label>
                              ))}
                              {kannLeiten && !istAbgeschlossen && (
                                <>
                                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                    <input value={neuerCheckpunkt} onChange={e => setNeuerCheckpunkt(e.target.value)} placeholder="Checkpunkt hinzufügen..." style={{ flex: 1, fontSize: 12, padding: '5px 8px' }} onKeyDown={e => e.key === 'Enter' && addCheckpunkt(p.id)} />
                                    <button className="btn btn-sm btn-secondary" style={{ fontSize: 11 }} onClick={() => addCheckpunkt(p.id)}>+</button>
                                  </div>
                                  {p.id !== phasen[phasen.length - 1].id && (
                                    <button className="btn btn-sm btn-primary" style={{ width: '100%', marginTop: 8, fontSize: 12 }} onClick={() => phaseAbschliessen(p.id)}>
                                      Phase abschließen →
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Lage-Tab */}
                {seitenleiste === 'lage' && (
                  <div>
                    {kannLeiten && !istAbgeschlossen && (
                      <div style={{ marginBottom: 12 }}>
                        <textarea value={neuesUpdate} onChange={e => setNeuesUpdate(e.target.value)} placeholder="Neue Lagemeldung eingeben..." rows={2} style={{ fontSize: 12, marginBottom: 6 }} />
                        <button className="btn btn-sm btn-primary" style={{ width: '100%', fontSize: 12 }} onClick={addLageUpdate} disabled={!neuesUpdate.trim()}>
                          ⚡ Meldung einspielen
                        </button>
                      </div>
                    )}
                    {lageUpdates.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'var(--gray-400)', textAlign: 'center', padding: '16px 0' }}>Noch keine Lage-Updates</p>
                    ) : (
                      lageUpdates.map(u => (
                        <div key={u.id} style={{ padding: '8px 10px', background: '#FEF9EC', border: '1px solid #FCD34D', borderRadius: 6, marginBottom: 6 }}>
                          <div style={{ fontSize: 10, color: '#92400E', marginBottom: 3 }}>
                            {format(new Date(u.zeit), 'HH:mm', { locale: de })} Uhr
                          </div>
                          <div style={{ fontSize: 12, color: '#78350F', fontWeight: 500 }}>{u.text}</div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Elemente-Tab */}
                {seitenleiste === 'elemente' && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.05em' }}>Elemente auf der Karte</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 10 }}>Doppelklick auf Element zum Löschen</div>
                    {karte.elemente.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'var(--gray-400)' }}>Noch keine Elemente platziert</p>
                    ) : (
                      karte.elemente.map(el => (
                        <div key={el.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, background: 'var(--gray-50)', marginBottom: 4 }}>
                          <span style={{ fontSize: 16 }}>{elEmoji(el)}</span>
                          <span style={{ fontSize: 12, color: 'var(--gray-700)', flex: 1 }}>{elName(el)}</span>
                          {kannLeiten && !istAbgeschlossen && (
                            <button onClick={() => setKarte(k => ({ ...k, elemente: k.elemente.filter(x => x.id !== el.id) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 14 }}>✕</button>
                          )}
                        </div>
                      ))
                    )}
                    {(karte.linien?.length > 0 || karte.zonen?.length > 0) && kannLeiten && !istAbgeschlossen && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {karte.linien?.length > 0 && <button className="btn btn-sm btn-secondary" style={{ fontSize: 11 }} onClick={letzteLinieLoeschen}>↩ Letzte Linie löschen</button>}
                        {karte.zonen?.length > 0 && <button className="btn btn-sm btn-secondary" style={{ fontSize: 11 }} onClick={letzteZoneLoeschen}>↩ Letzte Zone löschen</button>}
                        <button className="btn btn-sm btn-danger" style={{ fontSize: 11 }} onClick={alleElementeLoeschen}>🗑 Alles löschen</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Karte */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>
          {/* Werkzeugpalette */}
          {kannLeiten && !istAbgeschlossen && (
            <div style={{ background: 'var(--gray-800)', borderRadius: '8px 8px 0 0', padding: '6px 10px', display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Abbrechen */}
              {werkzeug && (
                <button onClick={() => { setWerkzeug(null); setZeichneLinie(null) }} style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', cursor: 'pointer', fontSize: 12 }}>✕ Abbrechen</button>
              )}

              {/* Fahrzeuge */}
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginLeft: 4 }}>Fahrzeuge</span>
              {FAHRZEUG_TYPEN.map(ft => (
                <WerkzeugButton key={ft.id} aktiv={werkzeug?.subtyp === ft.id} onClick={() => setWerkzeug({ typ: 'fahrzeug', subtyp: ft.id })} label={ft.name} emoji={ft.emoji} />
              ))}

              {/* Trupps */}
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginLeft: 4 }}>Trupps</span>
              {TRUPP_TYPEN.map(tt => (
                <WerkzeugButton key={tt.id} aktiv={werkzeug?.subtyp === tt.id} onClick={() => setWerkzeug({ typ: 'trupp', subtyp: tt.id })} label={tt.name} emoji={tt.emoji} />
              ))}

              {/* Punkte */}
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginLeft: 4 }}>Punkte</span>
              {PUNKT_TYPEN.map(pt => (
                <WerkzeugButton key={pt.id} aktiv={werkzeug?.subtyp === pt.id} onClick={() => setWerkzeug({ typ: 'punkt', subtyp: pt.id })} label={pt.name} emoji={pt.emoji} />
              ))}

              {/* Linien */}
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginLeft: 4 }}>Leitungen</span>
              {LINIE_TYPEN.map(lt => (
                <WerkzeugButton key={lt.id} aktiv={werkzeug?.subtyp === lt.id} onClick={() => { setWerkzeug({ typ: 'linie', subtyp: lt.id }); setZeichneLinie(null) }} label={lt.name} color={lt.farbe} />
              ))}

              {/* Zonen */}
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginLeft: 4 }}>Zonen</span>
              {ZONE_TYPEN.map(zt => (
                <WerkzeugButton key={zt.id} aktiv={werkzeug?.subtyp === zt.id} onClick={() => { setWerkzeug({ typ: 'zone', subtyp: zt.id }); setZeichneLinie(null) }} label={zt.name} color={zt.farbe} />
              ))}

              {/* Linie/Zone abschließen */}
              {zeichneLinie && zeichneLinie.punkte.length >= 2 && (
                <>
                  <button onClick={linieFertig} style={{ padding: '4px 10px', borderRadius: 6, background: '#16A34A', border: 'none', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, marginLeft: 4 }}>
                    ✓ {zeichneLinie.isZone ? 'Zone' : 'Linie'} fertig ({zeichneLinie.punkte.length} Punkte)
                  </button>
                  <button onClick={letztenPunktLoeschen} style={{ padding: '4px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', cursor: 'pointer', fontSize: 12 }}>↩</button>
                </>
              )}
            </div>
          )}

          {/* Hinweis bei aktivem Werkzeug */}
          {werkzeug && (
            <div style={{ background: werkzeug.typ === 'linie' || werkzeug.typ === 'zone' ? '#1D4ED8' : '#16A34A', color: 'white', padding: '4px 12px', fontSize: 12 }}>
              {werkzeug.typ === 'linie' || werkzeug.typ === 'zone'
                ? `Klicke auf die Karte um Punkte zu setzen${zeichneLinie?.punkte.length ? ` (${zeichneLinie.punkte.length} Punkte)` : ''} → dann "Fertig"`
                : `Klicke auf die Karte um ${elNameVonSubtyp(werkzeug)} zu platzieren`
              }
            </div>
          )}

          {/* Mapbox Karte */}
          <div ref={mapContainer} style={{ flex: 1, borderRadius: kannLeiten ? '0 0 8px 8px' : '8px', cursor: cursorStyle }} />
        </div>
      </div>
    </div>
  )
}

// ─── Werkzeug-Button ──────────────────────────────────────────────────────────

function WerkzeugButton({ aktiv, onClick, label, emoji, color }) {
  return (
    <button onClick={onClick} title={label} style={{
      padding: '4px 8px', borderRadius: 6, border: `1px solid ${aktiv ? 'white' : 'rgba(255,255,255,0.25)'}`,
      background: aktiv ? 'rgba(255,255,255,0.25)' : 'transparent',
      color: 'white', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3,
      transition: 'all 150ms',
    }}>
      {emoji && <span>{emoji}</span>}
      {color && <span style={{ width: 12, height: 12, borderRadius: 2, background: color, display: 'inline-block', flexShrink: 0 }} />}
      <span>{label}</span>
    </button>
  )
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function elEmoji(el) {
  if (el.typ === 'fahrzeug') return FAHRZEUG_TYPEN.find(f => f.id === el.subtyp)?.emoji ?? '🚒'
  if (el.typ === 'trupp') return TRUPP_TYPEN.find(t => t.id === el.subtyp)?.emoji ?? '🧑‍🚒'
  return PUNKT_TYPEN.find(p => p.id === el.subtyp)?.emoji ?? '📍'
}

function elName(el) {
  if (el.typ === 'fahrzeug') return FAHRZEUG_TYPEN.find(f => f.id === el.subtyp)?.name ?? el.subtyp
  if (el.typ === 'trupp') return TRUPP_TYPEN.find(t => t.id === el.subtyp)?.name ?? el.subtyp
  return PUNKT_TYPEN.find(p => p.id === el.subtyp)?.name ?? el.subtyp
}

function elFarbe(el) {
  if (el.typ === 'fahrzeug') return FAHRZEUG_TYPEN.find(f => f.id === el.subtyp)?.farbe ?? '#DC2626'
  if (el.typ === 'trupp') return TRUPP_TYPEN.find(t => t.id === el.subtyp)?.farbe ?? '#DC2626'
  return PUNKT_TYPEN.find(p => p.id === el.subtyp)?.farbe ?? '#DC2626'
}

function elNameVonSubtyp(werkzeug) {
  if (werkzeug.typ === 'fahrzeug') return FAHRZEUG_TYPEN.find(f => f.id === werkzeug.subtyp)?.name ?? ''
  if (werkzeug.typ === 'trupp') return TRUPP_TYPEN.find(t => t.id === werkzeug.subtyp)?.name ?? ''
  return PUNKT_TYPEN.find(p => p.id === werkzeug.subtyp)?.name ?? ''
}
