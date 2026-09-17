import { useEffect, useRef, useState } from 'react'
import { Marker } from 'maplibre-gl'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import {
  STANDARD_PHASEN, FAHRZEUG_TYPEN, TRUPP_TYPEN, PUNKT_TYPEN, LINIE_TYPEN, ZONE_TYPEN,
  phasenVonStandard, elEmoji, elName, elFarbe,
} from '../lib/planspielTypen'
import {
  erstelleKarte, fx3DElementeSynchronisieren, setLinienDaten, setZonenDaten,
  setVorschauLinie, setVorschauZone, clearVorschau, ist3DFahrzeug,
} from '../lib/planspiel3d'

// ─── PlanspielPage ────────────────────────────────────────────────────────────

export default function PlanspielPage() {
  const { profile, isAusbilder, isAdmin } = useAuth()
  const kannLeiten = isAusbilder || isAdmin
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('liste')
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
    <PlanspielAktiv session={aktiveSession} kannLeiten={kannLeiten} onBack={() => { setView('liste'); laden() }} />
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Planspiel</h1>
          <p style={{ marginTop: 4 }}>Taktische Übungen auf 3D-Karte</p>
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
  const [standardPhasen, setStandardPhasen] = useState(null)
  const [form, setForm] = useState({ titel: '', szenario_id: '', adresse: '' })
  const [extraPhasen, setExtraPhasen] = useState([])
  const [neuePhase, setNeuePhase] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('szenarien').select('id,titel,anfangs_meldung,kartenposition,kartenvorgabe,wetterinfo,phasen').eq('aktiv', true).order('titel')
      .then(({ data }) => setSzenarien(data ?? []))
    supabase.from('planspiel_config').select('standard_phasen').eq('wehr_id', profile.wehr_id).maybeSingle()
      .then(({ data }) => setStandardPhasen(data?.standard_phasen ?? null))
  }, [])

  const selectedSz = szenarien.find(s => s.id === form.szenario_id)

  async function handleStart() {
    if (!form.titel) return alert('Titel eingeben')
    setSaving(true)

    // Kartenposition: Szenario-Vorgabe hat Vorrang, sonst Adress-Geocoding
    let center = { lng: 10.4515, lat: 51.1657, zoom: 13, pitch: 55, bearing: 0 }
    if (selectedSz?.kartenposition) {
      center = { pitch: 55, bearing: 0, ...selectedSz.kartenposition }
    } else if (form.adresse.trim()) {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=${encodeURIComponent(form.adresse)}`,
          { headers: { 'Accept-Language': 'de', 'User-Agent': 'FeuerwehrApp/1.0' } }
        )
        const geo = await res.json()
        if (geo.length > 0) {
          center = { lng: parseFloat(geo[0].lon), lat: parseFloat(geo[0].lat), zoom: 17, pitch: 55, bearing: 0 }
        }
      } catch {}
    }

    // Phasen: Szenario > DB-Standard > hardcoded Standard
    const phasenQuelle = selectedSz?.phasen ?? standardPhasen ?? null
    const phasen = phasenQuelle
      ? phasenQuelle.map((p, i) => ({
          id: p.id || 'phase_' + Date.now() + Math.random(),
          name: p.name,
          emoji: p.emoji ?? '📋',
          aktiv: i === 0,
          abgeschlossen: false,
          checkpunkte: (p.checkpunkte ?? []).map((t, j) => ({ id: (p.id || 'p') + '_' + j, text: t, status: null })),
          extra: [],
        }))
      : phasenVonStandard()
    extraPhasen.forEach(name => {
      phasen.push({ id: 'extra_' + Date.now() + Math.random(), name, aktiv: false, abgeschlossen: false, checkpunkte: [], extra: [] })
    })

    // Kartenvorgabe aus Szenario übernehmen (neue IDs um Konflikte zu vermeiden).
    // Tolerant gegenüber altem Vorlagenformat (Leaflet-Editor: typ=Subtyp direkt, koord statt position,
    // Zonenpunkte als [lat,lng]).
    const vorgabe = selectedSz?.kartenvorgabe
    const kartenzustand = {
      elemente: vorgabe?.elemente?.map(e => ({
        id: String(Date.now()) + String(Math.random()),
        typ: 'punkt',
        subtyp: e.subtyp ?? e.typ,
        position: e.position ?? e.koord,
        heading: e.heading ?? 0,
      })) ?? [],
      linien: [],
      zonen: vorgabe?.zonen?.map(z => {
        const erster = z.punkte?.[0]
        const istAltesFormat = erster && Math.abs(erster[0]) > 40
        const punkte = istAltesFormat ? z.punkte.map(([lat, lng]) => [lng, lat]) : z.punkte
        return { ...z, id: String(Date.now()) + String(Math.random()), punkte }
      }) ?? [],
      wetterinfo: selectedSz?.wetterinfo ?? {},
    }

    const { error } = await supabase.from('planspiel_sessions').insert({
      titel: form.titel,
      szenario_id: form.szenario_id || null,
      wehr_id: profile.wehr_id,
      erstellt_von: profile.id,
      status: 'aktiv',
      phasen,
      map_center: center,
      kartenzustand,
      lage_updates: [],
    })

    setSaving(false)
    if (!error) onBack()
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
        {selectedSz?.kartenposition && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: '#EFF6FF', borderRadius: 8, border: '1px solid #BFDBFE', fontSize: 13, color: '#1D4ED8', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>🗺️</span>
            <span>
              Dieses Szenario hat eine voreingestellte Kartenposition
              {selectedSz.kartenvorgabe?.elemente?.length > 0 && ` · ${selectedSz.kartenvorgabe.elemente.length} Objekte`}
              {selectedSz.kartenvorgabe?.zonen?.length > 0 && ` · ${selectedSz.kartenvorgabe.zonen.length} Zonen`}
              {selectedSz.wetterinfo?.wetterlage && ` · ${selectedSz.wetterinfo.wetterlage}`}
              {' — werden automatisch übernommen.'}
            </span>
          </div>
        )}
        {!selectedSz?.kartenposition && (
          <div className="form-group">
            <label>Einsatzadresse <span style={{ fontWeight: 400, color: 'var(--gray-400)', fontSize: 12 }}>(Karte wird darauf zentriert)</span></label>
            <input value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} placeholder="z.B. Hauptstraße 1, 99310 Arnstadt" />
          </div>
        )}
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

function PlanspielAktiv({ session, kannLeiten, onBack }) {
  const [phasen, setPhasen] = useState(session.phasen ?? [])
  const [karte, setKarte] = useState(() => {
    const k = session.kartenzustand ?? {}
    return { elemente: [], linien: [], zonen: [], wetterinfo: {}, ...k }
  })
  const [lageUpdates, setLageUpdates] = useState(session.lage_updates ?? [])
  const [neuesUpdate, setNeuesUpdate] = useState('')
  const [aktivePhasenId, setAktivePhasenId] = useState(session.phasen?.find(p => p.aktiv)?.id ?? session.phasen?.[0]?.id)
  const [neuerCheckpunkt, setNeuerCheckpunkt] = useState('')
  const [werkzeug, setWerkzeug] = useState(null)
  const [zeichnePunkte, setZeichnePunkte] = useState([])
  const [saving, setSaving] = useState(false)
  const [seitenleiste, setSeitenleiste] = useState('phasen')
  const [seitenleiteOffen, setSeitenleiteOffen] = useState(true)

  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const fxRef = useRef(null)
  const markerRefs = useRef({})

  // Refs für closures in Event-Listenern
  const karteRef = useRef(karte)
  useEffect(() => { karteRef.current = karte }, [karte])
  const phasenRef = useRef(phasen)
  useEffect(() => { phasenRef.current = phasen }, [phasen])
  const lageUpdatesRef = useRef(lageUpdates)
  useEffect(() => { lageUpdatesRef.current = lageUpdates }, [lageUpdates])
  const werkzeugRef = useRef(werkzeug)
  useEffect(() => { werkzeugRef.current = werkzeug }, [werkzeug])
  const zeichnePunkteRef = useRef(zeichnePunkte)
  useEffect(() => { zeichnePunkteRef.current = zeichnePunkte }, [zeichnePunkte])

  const istAbgeschlossen = session.status === 'abgeschlossen'

  // Auto-Speichern alle 3 Sekunden
  useEffect(() => {
    if (istAbgeschlossen || !kannLeiten) return
    const interval = setInterval(async () => {
      const map = mapRef.current
      const center = map
        ? { lng: map.getCenter().lng, lat: map.getCenter().lat, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() }
        : session.map_center
      await supabase.from('planspiel_sessions').update({
        kartenzustand: karteRef.current,
        phasen: phasenRef.current,
        lage_updates: lageUpdatesRef.current,
        map_center: center,
      }).eq('id', session.id)
    }, 3000)
    return () => clearInterval(interval)
  }, [istAbgeschlossen, kannLeiten, session.id])

  // Karte initialisieren
  useEffect(() => {
    const center = session.map_center ?? { lng: 10.4515, lat: 51.1657, zoom: 14, pitch: 55, bearing: 0 }
    const { map, fx } = erstelleKarte(mapContainer.current, center)
    mapRef.current = map
    fxRef.current = fx

    map.on('style.load', () => {
      fx3DElementeSynchronisieren(fx, karteRef.current.elemente, elFarbe)
      fx.setWetter(karteRef.current.wetterinfo)
      setLinienDaten(map, karteRef.current.linien)
      setZonenDaten(map, karteRef.current.zonen)
    })

    map.on('click', (e) => {
      const w = werkzeugRef.current
      if (!w) return
      const pos = [e.lngLat.lng, e.lngLat.lat]

      if (w.typ === 'fahrzeug' || w.typ === 'trupp' || w.typ === 'punkt') {
        const id = crypto.randomUUID()
        setKarte(k => ({ ...k, elemente: [...k.elemente, { id, typ: w.typ, subtyp: w.subtyp, position: pos }] }))
        setWerkzeug(null)
        return
      }

      if (w.typ === 'linie' || w.typ === 'zone') {
        setZeichnePunkte(pp => [...pp, pos])
      }
    })

    return () => { map.remove(); mapRef.current = null; fxRef.current = null }
  }, [])

  // Marker synchron halten (alle Elementtypen als 2D-Pill; Fahrzeuge/Brandherde zusätzlich 3D via Fx-Layer)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const aktuelleIds = new Set(karte.elemente.map(e => e.id))

    Object.entries(markerRefs.current).forEach(([id, m]) => {
      if (!aktuelleIds.has(id)) { m.remove(); delete markerRefs.current[id] }
    })

    karte.elemente.forEach(el => {
      if (!markerRefs.current[el.id]) {
        const draggable = kannLeiten && !istAbgeschlossen
        const el2 = document.createElement('div')
        el2.style.cssText = `background:${elFarbe(el)};color:white;border-radius:6px;padding:3px 7px;font-size:18px;cursor:${draggable ? 'grab' : 'default'};box-shadow:0 2px 6px rgba(0,0,0,0.4);border:2px solid white;display:flex;align-items:center;gap:4px;white-space:nowrap;user-select:none;`
        el2.innerHTML = `<span>${elEmoji(el)}</span><span style="font-size:10px;font-weight:700;">${elName(el)}</span>`
        const marker = new Marker({ element: el2, draggable, anchor: 'top-left' })
          .setLngLat(el.position)
          .addTo(map)

        if (draggable) {
          marker.on('dragend', () => {
            const { lng, lat } = marker.getLngLat()
            setKarte(k => ({ ...k, elemente: k.elemente.map(x => x.id === el.id ? { ...x, position: [lng, lat] } : x) }))
          })
        }
        if (kannLeiten && !istAbgeschlossen) {
          el2.addEventListener('dblclick', (e) => {
            e.stopPropagation()
            setKarte(k => ({ ...k, elemente: k.elemente.filter(x => x.id !== el.id) }))
          })
        }

        markerRefs.current[el.id] = marker
      } else {
        markerRefs.current[el.id].setLngLat(el.position)
      }
    })
  }, [karte.elemente])

  // 3D-Fahrzeuge/Personen + Feuer/Rauch-Partikel synchron halten
  useEffect(() => {
    const fx = fxRef.current
    if (!fx || !fx.scene) return
    fx3DElementeSynchronisieren(fx, karte.elemente, elFarbe)
  }, [karte.elemente])

  // Windrichtung/-stärke an die Rauchausbreitung übergeben
  useEffect(() => {
    const fx = fxRef.current
    if (!fx || !fx.scene) return
    fx.setWetter(karte.wetterinfo)
  }, [karte.wetterinfo])

  // Linien rendern
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('planspiel-linien')) return
    setLinienDaten(map, karte.linien)
  }, [karte.linien])

  // Zonen rendern
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('planspiel-zonen')) return
    setZonenDaten(map, karte.zonen)
  }, [karte.zonen])

  // Zeichnungsvorschau
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('planspiel-vorschau-linie')) return
    if (!werkzeug || zeichnePunkte.length < 2) { clearVorschau(map); return }
    if (werkzeug.typ === 'linie') setVorschauLinie(map, zeichnePunkte, werkzeug.subtyp)
    else if (werkzeug.typ === 'zone' && zeichnePunkte.length >= 3) setVorschauZone(map, zeichnePunkte, werkzeug.subtyp)
  }, [zeichnePunkte, werkzeug])

  // Cursor
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.getCanvas().style.cursor = werkzeug
      ? (werkzeug.typ === 'linie' || werkzeug.typ === 'zone' ? 'crosshair' : 'copy')
      : ''
  }, [werkzeug])

  function zeichnenFertig() {
    if (!werkzeug) return
    const id = crypto.randomUUID()
    if (werkzeug.typ === 'linie' && zeichnePunkte.length >= 2) {
      setKarte(k => ({ ...k, linien: [...k.linien, { id, typ: werkzeug.subtyp, punkte: zeichnePunkte }] }))
    } else if (werkzeug.typ === 'zone' && zeichnePunkte.length >= 3) {
      setKarte(k => ({ ...k, zonen: [...k.zonen, { id, typ: werkzeug.subtyp, punkte: zeichnePunkte }] }))
    }
    const map = mapRef.current
    if (map) clearVorschau(map)
    setZeichnePunkte([])
    setWerkzeug(null)
  }

  function zeichnenAbbrechen() {
    const map = mapRef.current
    if (map) clearVorschau(map)
    setZeichnePunkte([])
    setWerkzeug(null)
  }

  function letztesElementLoeschen() {
    setKarte(k => k.elemente.length ? { ...k, elemente: k.elemente.slice(0, -1) } : k)
  }

  function elementDrehen(id, delta) {
    setKarte(k => ({
      ...k,
      elemente: k.elemente.map(x => x.id !== id ? x : { ...x, heading: ((x.heading ?? 0) + delta + 360) % 360 }),
    }))
  }

  function letzteLinieLoeschen() {
    setKarte(k => k.linien.length ? { ...k, linien: k.linien.slice(0, -1) } : k)
  }

  function letzteZoneLoeschen() {
    setKarte(k => k.zonen.length ? { ...k, zonen: k.zonen.slice(0, -1) } : k)
  }

  function alleLoeschen() {
    if (!confirm('Alle Elemente auf der Karte löschen?')) return
    Object.values(markerRefs.current).forEach(m => m.remove()); markerRefs.current = {}
    fxRef.current?.setVehicles([])
    fxRef.current?.setPersonen([])
    fxRef.current?.setBrandherde([])
    setKarte({ elemente: [], linien: [], zonen: [] })
  }

  function checkpunktToggle(phasenId, cpId) {
    if (!kannLeiten) return
    setPhasen(ps => ps.map(p => p.id !== phasenId ? p : {
      ...p, checkpunkte: p.checkpunkte.map(cp => {
        if (cp.id !== cpId) return cp
        const cur = cp.status ?? (cp.erledigt ? 'richtig' : null)
        const next = cur === null ? 'richtig' : cur === 'richtig' ? 'falsch' : null
        return { ...cp, status: next }
      })
    }))
  }

  function addCheckpunkt(phasenId) {
    if (!neuerCheckpunkt.trim()) return
    setPhasen(ps => ps.map(p => p.id !== phasenId ? p : {
      ...p, checkpunkte: [...p.checkpunkte, { id: Date.now() + '', text: neuerCheckpunkt.trim(), status: null }]
    }))
    setNeuerCheckpunkt('')
  }

  function phaseAbschliessen(phasenId) {
    const idx = phasen.findIndex(p => p.id === phasenId)
    if (idx < 0) return
    setPhasen(ps => ps.map((p, i) => ({ ...p, abgeschlossen: i <= idx, aktiv: i === idx + 1 })))
    if (idx + 1 < phasen.length) setAktivePhasenId(phasen[idx + 1].id)
  }

  function addLageUpdate() {
    if (!neuesUpdate.trim()) return
    setLageUpdates(lu => [{ id: Date.now() + '', text: neuesUpdate.trim(), zeit: new Date().toISOString() }, ...lu])
    setNeuesUpdate('')
  }

  async function speichern(abschliessen = false) {
    setSaving(true)
    const map = mapRef.current
    const center = map
      ? { lng: map.getCenter().lng, lat: map.getCenter().lat, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() }
      : session.map_center
    // karte direkt aus State (nicht karteRef) um Race-Conditions zu vermeiden
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 130px)', minHeight: 600 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurück</button>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>🗺️ {session.titel}</span>
          {session.szenario && <span className="badge badge-amber" style={{ marginLeft: 8, fontSize: 11 }}>{session.szenario.titel}</span>}
        </div>
        <button
          className="btn btn-sm"
          style={{ background: '#065f46', color: 'white', border: 'none' }}
          onClick={() => window.open(`/ausbildung/planspiel/${session.id}/anzeige`, '_blank')}
          title="Öffnet die Kamera-Ansicht für Beamer / zweiten Bildschirm"
        >
          📺 Anzeigeansicht
        </button>
        {kannLeiten && !istAbgeschlossen && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm btn-secondary" onClick={() => speichern(false)} disabled={saving}>
              {saving ? '…' : '💾 Speichern'}
            </button>
            <button className="btn btn-sm btn-danger" onClick={() => { if (confirm('Übung abschließen?')) speichern(true) }} disabled={saving}>
              ✓ Abschließen
            </button>
          </div>
        )}
      </div>

      {session.szenario?.anfangs_meldung && (
        <div style={{ background: '#FEF9EC', border: '1px solid #FCD34D', borderRadius: 8, padding: '10px 14px', marginBottom: 10, fontSize: 13, color: '#92400E' }}>
          <strong>Lagedarstellung:</strong> {session.szenario.anfangs_meldung}
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, gap: 10, minHeight: 0 }}>
        {/* Seitenleiste */}
        <div style={{ width: seitenleiteOffen ? 290 : 36, flexShrink: 0, display: 'flex', flexDirection: 'column', transition: 'width 200ms', overflow: 'hidden' }}>
          <button onClick={() => setSeitenleiteOffen(o => !o)} style={{ width: '100%', padding: '6px 8px', background: 'var(--gray-800)', color: 'white', border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {seitenleiteOffen ? <span>◀ Einklappen</span> : <span style={{ writingMode: 'vertical-rl', fontSize: 10 }}>▶</span>}
          </button>
          {seitenleiteOffen && (
            <div style={{ flex: 1, background: 'white', border: '1px solid var(--gray-200)', borderRadius: '0 0 8px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ display: 'flex', borderBottom: '1px solid var(--gray-200)' }}>
                {[['phasen', '📋 Phasen'], ['lage', '⚡ Lage'], ['elemente', '🗂 Elemente']].map(([key, label]) => (
                  <button key={key} onClick={() => setSeitenleiste(key)} style={{ flex: 1, padding: '8px 4px', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: seitenleiste === key ? 600 : 400, background: seitenleiste === key ? 'var(--gray-50)' : 'white', color: seitenleiste === key ? 'var(--red)' : 'var(--gray-500)', borderBottom: seitenleiste === key ? '2px solid var(--red)' : '2px solid transparent' }}>
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>

                {/* Phasen */}
                {seitenleiste === 'phasen' && phasen.map(p => {
                  const istAktiv = p.id === aktivePhasenId
                  const erledigt = p.checkpunkte.filter(c => c.erledigt).length
                  return (
                    <div key={p.id} style={{ marginBottom: 10, borderRadius: 8, border: `2px solid ${istAktiv ? 'var(--red)' : p.abgeschlossen ? '#A9DFBF' : 'var(--gray-200)'}`, overflow: 'hidden' }}>
                      <div onClick={() => setAktivePhasenId(p.id)} style={{ padding: '8px 12px', background: istAktiv ? 'var(--red-pale)' : p.abgeschlossen ? '#EAFAF1' : 'var(--gray-50)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{p.abgeschlossen ? '✅' : istAktiv ? '▶' : '○'}</span>
                        <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: istAktiv ? 'var(--red-dark)' : 'var(--gray-700)' }}>{p.name}</span>
                        {p.checkpunkte.length > 0 && <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>{p.checkpunkte.filter(c => (c.status ?? (c.erledigt ? 'richtig' : null)) !== null).length}/{p.checkpunkte.length}</span>}
                      </div>
                      {istAktiv && (
                        <div style={{ padding: '8px 12px' }}>
                          {p.checkpunkte.map(cp => {
                            const st = cp.status ?? (cp.erledigt ? 'richtig' : null)
                            return (
                              <div key={cp.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--gray-100)' }}>
                                <span style={{ fontSize: 12, flex: 1, color: st === null ? 'var(--gray-700)' : 'var(--gray-400)', lineHeight: 1.4, paddingTop: 2 }}>{cp.text}</span>
                                {kannLeiten && !istAbgeschlossen && (
                                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                    <button onClick={() => checkpunktToggle(p.id, cp.id)} title="Richtig → Falsch → Offen" style={{ width: 28, height: 28, borderRadius: 6, border: `2px solid ${st === 'richtig' ? '#16A34A' : 'var(--gray-300)'}`, background: st === 'richtig' ? '#16A34A' : 'white', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      {st === 'richtig' ? <span style={{ color: 'white' }}>✓</span> : <span style={{ color: 'var(--gray-300)' }}>✓</span>}
                                    </button>
                                    <button onClick={() => setPhasen(ps => ps.map(p2 => p2.id !== p.id ? p2 : { ...p2, checkpunkte: p2.checkpunkte.map(c => c.id !== cp.id ? c : { ...c, status: st === 'falsch' ? null : 'falsch' }) }))} title="Als vergessen/falsch markieren" style={{ width: 28, height: 28, borderRadius: 6, border: `2px solid ${st === 'falsch' ? '#DC2626' : 'var(--gray-300)'}`, background: st === 'falsch' ? '#DC2626' : 'white', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      {st === 'falsch' ? <span style={{ color: 'white' }}>✗</span> : <span style={{ color: 'var(--gray-300)' }}>✗</span>}
                                    </button>
                                  </div>
                                )}
                                {(!kannLeiten || istAbgeschlossen) && st !== null && (
                                  <span style={{ fontSize: 16 }}>{st === 'richtig' ? '✅' : '❌'}</span>
                                )}
                              </div>
                            )
                          })}
                          {kannLeiten && !istAbgeschlossen && (
                            <>
                              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                <input value={neuerCheckpunkt} onChange={e => setNeuerCheckpunkt(e.target.value)} placeholder="Checkpunkt hinzufügen..." style={{ flex: 1, fontSize: 12, padding: '5px 8px' }} onKeyDown={e => e.key === 'Enter' && addCheckpunkt(p.id)} />
                                <button className="btn btn-sm btn-secondary" style={{ fontSize: 11 }} onClick={() => addCheckpunkt(p.id)}>+</button>
                              </div>
                              {p.id !== phasen[phasen.length - 1]?.id && (
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

                {/* Lage */}
                {seitenleiste === 'lage' && (
                  <div>
                    {/* Übungsdaten / Wetter */}
                    {kannLeiten && !istAbgeschlossen && (
                      <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--gray-50)', borderRadius: 8, border: '1px solid var(--gray-200)' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>🌤 Übungsdaten</div>
                        <div style={{ display: 'grid', gap: 6 }}>
                          <div>
                            <label style={{ fontSize: 11, color: 'var(--gray-500)', display: 'block', marginBottom: 2 }}>Datum</label>
                            <input type="date" value={karte.wetterinfo?.datum ?? ''} onChange={e => setKarte(k => ({ ...k, wetterinfo: { ...k.wetterinfo, datum: e.target.value } }))} style={{ fontSize: 12, padding: '4px 8px', width: '100%' }} />
                          </div>
                          <div>
                            <label style={{ fontSize: 11, color: 'var(--gray-500)', display: 'block', marginBottom: 2 }}>Wetterlage</label>
                            <select value={karte.wetterinfo?.wetterlage ?? ''} onChange={e => setKarte(k => ({ ...k, wetterinfo: { ...k.wetterinfo, wetterlage: e.target.value } }))} style={{ fontSize: 12, padding: '4px 8px', width: '100%' }}>
                              <option value="">– wählen –</option>
                              {['Sonnig ☀️','Leicht bewölkt 🌤','Bewölkt ⛅','Bedeckt ☁️','Regen 🌧','Gewitter ⛈','Nebel 🌫','Schnee ❄️'].map(w => <option key={w} value={w}>{w}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: 11, color: 'var(--gray-500)', display: 'block', marginBottom: 2 }}>Windrichtung</label>
                            <select value={karte.wetterinfo?.windrichtung ?? ''} onChange={e => setKarte(k => ({ ...k, wetterinfo: { ...k.wetterinfo, windrichtung: e.target.value } }))} style={{ fontSize: 12, padding: '4px 8px', width: '100%' }}>
                              <option value="">– wählen –</option>
                              {['N','NO','O','SO','S','SW','W','NW'].map(w => <option key={w} value={w}>{w}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: 11, color: 'var(--gray-500)', display: 'block', marginBottom: 2 }}>Windstärke</label>
                            <select value={karte.wetterinfo?.windstaerke ?? ''} onChange={e => setKarte(k => ({ ...k, wetterinfo: { ...k.wetterinfo, windstaerke: e.target.value } }))} style={{ fontSize: 12, padding: '4px 8px', width: '100%' }}>
                              <option value="">– wählen –</option>
                              {['Windstill','Leichte Brise','Mäßiger Wind','Frischer Wind','Starker Wind','Sturm'].map(w => <option key={w} value={w}>{w}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Wetter-Anzeige (read-only) */}
                    {(istAbgeschlossen || !kannLeiten) && karte.wetterinfo && Object.values(karte.wetterinfo).some(Boolean) && (
                      <WetterKarte wetterinfo={karte.wetterinfo} />
                    )}

                    {/* Lagemeldungen */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>⚡ Lagemeldungen</div>
                    {kannLeiten && !istAbgeschlossen && (
                      <div style={{ marginBottom: 12 }}>
                        <textarea value={neuesUpdate} onChange={e => setNeuesUpdate(e.target.value)} placeholder="Neue Lagemeldung eingeben..." rows={2} style={{ fontSize: 12, marginBottom: 6 }} />
                        <button className="btn btn-sm btn-primary" style={{ width: '100%', fontSize: 12 }} onClick={addLageUpdate} disabled={!neuesUpdate.trim()}>⚡ Meldung einspielen</button>
                      </div>
                    )}
                    {lageUpdates.length === 0
                      ? <p style={{ fontSize: 12, color: 'var(--gray-400)', textAlign: 'center', padding: '16px 0' }}>Noch keine Lage-Updates</p>
                      : lageUpdates.map(u => (
                        <div key={u.id} style={{ padding: '8px 10px', background: '#FEF9EC', border: '1px solid #FCD34D', borderRadius: 6, marginBottom: 6 }}>
                          <div style={{ fontSize: 10, color: '#92400E', marginBottom: 3 }}>{format(new Date(u.zeit), 'HH:mm', { locale: de })} Uhr</div>
                          <div style={{ fontSize: 12, color: '#78350F', fontWeight: 500 }}>{u.text}</div>
                        </div>
                      ))
                    }
                  </div>
                )}

                {/* Elemente */}
                {seitenleiste === 'elemente' && (
                  <div>
                    <p style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 10 }}>Doppelklick auf Marker zum Löschen</p>
                    {karte.elemente.length === 0
                      ? <p style={{ fontSize: 12, color: 'var(--gray-400)' }}>Noch keine Elemente platziert</p>
                      : karte.elemente.map(el => (
                        <div key={el.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 6, background: 'var(--gray-50)', marginBottom: 4 }}>
                          <span style={{ fontSize: 16 }}>{elEmoji(el)}</span>
                          <span style={{ fontSize: 12, color: 'var(--gray-700)', flex: 1 }}>{elName(el)}</span>
                          {kannLeiten && !istAbgeschlossen && ist3DFahrzeug(el) && (
                            <>
                              <button onClick={() => elementDrehen(el.id, -15)} title="Nach links drehen" style={{ background: 'none', border: '1px solid var(--gray-300)', borderRadius: 4, cursor: 'pointer', color: 'var(--gray-500)', fontSize: 12, width: 22, height: 22, lineHeight: 1 }}>⟲</button>
                              <button onClick={() => elementDrehen(el.id, 15)} title="Nach rechts drehen" style={{ background: 'none', border: '1px solid var(--gray-300)', borderRadius: 4, cursor: 'pointer', color: 'var(--gray-500)', fontSize: 12, width: 22, height: 22, lineHeight: 1 }}>⟳</button>
                            </>
                          )}
                          {kannLeiten && !istAbgeschlossen && (
                            <button onClick={() => setKarte(k => ({ ...k, elemente: k.elemente.filter(x => x.id !== el.id) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 14 }}>✕</button>
                          )}
                        </div>
                      ))
                    }
                    {kannLeiten && !istAbgeschlossen && (karte.linien?.length > 0 || karte.zonen?.length > 0 || karte.elemente?.length > 0) && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {karte.elemente?.length > 0 && <button className="btn btn-sm btn-secondary" style={{ fontSize: 11 }} onClick={letztesElementLoeschen}>↩ Letztes Element löschen</button>}
                        {karte.linien?.length > 0 && <button className="btn btn-sm btn-secondary" style={{ fontSize: 11 }} onClick={letzteLinieLoeschen}>↩ Letzte Linie löschen</button>}
                        {karte.zonen?.length > 0 && <button className="btn btn-sm btn-secondary" style={{ fontSize: 11 }} onClick={letzteZoneLoeschen}>↩ Letzte Zone löschen</button>}
                        <button className="btn btn-sm btn-danger" style={{ fontSize: 11 }} onClick={alleLoeschen}>🗑 Alles löschen</button>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          )}
        </div>

        {/* Karte */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {kannLeiten && !istAbgeschlossen && (
            <div style={{ background: 'var(--gray-800)', borderRadius: '8px 8px 0 0', padding: '6px 10px', display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {werkzeug && <button onClick={zeichnenAbbrechen} style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', cursor: 'pointer', fontSize: 12 }}>✕ Abbrechen</button>}
              <Sep>Fahrzeuge</Sep>
              {FAHRZEUG_TYPEN.map(ft => <WerkzeugButton key={ft.id} aktiv={werkzeug?.subtyp === ft.id} onClick={() => { setWerkzeug({ typ: 'fahrzeug', subtyp: ft.id }); setZeichnePunkte([]) }} label={ft.name} emoji={ft.emoji} />)}
              <Sep>Trupps</Sep>
              {TRUPP_TYPEN.map(tt => <WerkzeugButton key={tt.id} aktiv={werkzeug?.subtyp === tt.id} onClick={() => { setWerkzeug({ typ: 'trupp', subtyp: tt.id }); setZeichnePunkte([]) }} label={tt.name} emoji={tt.emoji} />)}
              <Sep>Objekte</Sep>
              {PUNKT_TYPEN.filter(p => ['brandherd','gefahrstoff','person','pin'].includes(p.id)).map(pt => <WerkzeugButton key={pt.id} aktiv={werkzeug?.subtyp === pt.id} onClick={() => { setWerkzeug({ typ: 'punkt', subtyp: pt.id }); setZeichnePunkte([]) }} label={pt.name} emoji={pt.emoji} />)}
              <Sep>Zivil</Sep>
              {PUNKT_TYPEN.filter(p => ['pkw','lkw'].includes(p.id)).map(pt => <WerkzeugButton key={pt.id} aktiv={werkzeug?.subtyp === pt.id} onClick={() => { setWerkzeug({ typ: 'punkt', subtyp: pt.id }); setZeichnePunkte([]) }} label={pt.name} emoji={pt.emoji} />)}
              <Sep>Wasser</Sep>
              {PUNKT_TYPEN.filter(p => ['hydrant','verteiler'].includes(p.id)).map(pt => <WerkzeugButton key={pt.id} aktiv={werkzeug?.subtyp === pt.id} onClick={() => { setWerkzeug({ typ: 'punkt', subtyp: pt.id }); setZeichnePunkte([]) }} label={pt.name} emoji={pt.emoji} />)}
              <Sep>Leitungen</Sep>
              {LINIE_TYPEN.map(lt => <WerkzeugButton key={lt.id} aktiv={werkzeug?.subtyp === lt.id} onClick={() => { setWerkzeug({ typ: 'linie', subtyp: lt.id }); setZeichnePunkte([]) }} label={lt.name} color={lt.farbe} />)}
              <Sep>Flächen</Sep>
              {ZONE_TYPEN.map(zt => <WerkzeugButton key={zt.id} aktiv={werkzeug?.subtyp === zt.id} onClick={() => { setWerkzeug({ typ: 'zone', subtyp: zt.id }); setZeichnePunkte([]) }} label={zt.name} color={zt.farbe} />)}
              {(werkzeug?.typ === 'linie' || werkzeug?.typ === 'zone') && zeichnePunkte.length >= 2 && (
                <>
                  <button onClick={zeichnenFertig} style={{ padding: '4px 10px', borderRadius: 6, background: '#16A34A', border: 'none', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, marginLeft: 4 }}>
                    ✓ {werkzeug.typ === 'zone' ? 'Zone' : 'Linie'} fertig ({zeichnePunkte.length} Pkt.)
                  </button>
                  <button onClick={() => setZeichnePunkte(pp => pp.slice(0, -1))} style={{ padding: '4px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', cursor: 'pointer', fontSize: 12 }}>↩</button>
                </>
              )}
            </div>
          )}
          {werkzeug && (
            <div style={{ background: (werkzeug.typ === 'linie' || werkzeug.typ === 'zone') ? '#1D4ED8' : '#16A34A', color: 'white', padding: '4px 12px', fontSize: 12 }}>
              {(werkzeug.typ === 'linie' || werkzeug.typ === 'zone')
                ? `Klicke auf die Karte um Punkte zu setzen${zeichnePunkte.length ? ` (${zeichnePunkte.length} gesetzt)` : ''} → dann "Fertig"`
                : `Klicke auf die Karte um ${elNameVonWerkzeug(werkzeug)} zu platzieren`}
            </div>
          )}
          <div ref={mapContainer} style={{ flex: 1, borderRadius: kannLeiten ? '0 0 8px 8px' : '8px', minHeight: 400 }} />
        </div>
      </div>
    </div>
  )
}

// ─── Hilfkomponenten & -funktionen ───────────────────────────────────────────

function Sep({ children }) {
  return <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginLeft: 4 }}>{children}</span>
}

function WerkzeugButton({ aktiv, onClick, label, emoji, color }) {
  return (
    <button onClick={onClick} title={label} style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${aktiv ? 'white' : 'rgba(255,255,255,0.25)'}`, background: aktiv ? 'rgba(255,255,255,0.25)' : 'transparent', color: 'white', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
      {emoji && <span>{emoji}</span>}
      {color && <span style={{ width: 12, height: 12, borderRadius: 2, background: color, display: 'inline-block', flexShrink: 0 }} />}
      <span>{label}</span>
    </button>
  )
}

function elNameVonWerkzeug(w) {
  if (w.typ === 'fahrzeug') return FAHRZEUG_TYPEN.find(f => f.id === w.subtyp)?.name ?? ''
  if (w.typ === 'trupp')   return TRUPP_TYPEN.find(t => t.id === w.subtyp)?.name ?? ''
  return PUNKT_TYPEN.find(p => p.id === w.subtyp)?.name ?? ''
}

export function WetterKarte({ wetterinfo, dark = false }) {
  if (!wetterinfo || !Object.values(wetterinfo).some(Boolean)) return null
  const zeilen = [
    wetterinfo.datum && { label: '📅 Datum', wert: new Date(wetterinfo.datum).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) },
    wetterinfo.wetterlage && { label: '🌤 Wetter', wert: wetterinfo.wetterlage },
    wetterinfo.windrichtung && { label: '🧭 Wind aus', wert: wetterinfo.windrichtung + (wetterinfo.windstaerke ? ` · ${wetterinfo.windstaerke}` : '') },
  ].filter(Boolean)

  return (
    <div style={{ borderRadius: 8, padding: '10px 12px', marginBottom: 10, background: dark ? 'rgba(255,255,255,0.1)' : 'var(--gray-50)', border: `1px solid ${dark ? 'rgba(255,255,255,0.2)' : 'var(--gray-200)'}` }}>
      {zeilen.map(z => (
        <div key={z.label} style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 12 }}>
          <span style={{ color: dark ? 'rgba(255,255,255,0.5)' : 'var(--gray-400)', minWidth: 80 }}>{z.label}</span>
          <span style={{ color: dark ? 'white' : 'var(--gray-700)', fontWeight: 500 }}>{z.wert}</span>
        </div>
      ))}
    </div>
  )
}
