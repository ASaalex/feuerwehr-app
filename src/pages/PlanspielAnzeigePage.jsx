import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { WetterKarte } from './PlanspielPage'

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
  { id: 'at', name: 'Angriffstrupp',    emoji: '🧑‍🚒', farbe: '#DC2626' },
  { id: 'wt', name: 'Wassertrupp',      emoji: '🧑‍🚒', farbe: '#2563EB' },
  { id: 'st', name: 'Sicherheitstrupp', emoji: '🧑‍🚒', farbe: '#16A34A' },
  { id: 'me', name: 'Melder',           emoji: '🧑‍🚒', farbe: '#D97706' },
]
const PUNKT_TYPEN = [
  { id: 'hydrant',    name: 'Hydrant',      emoji: '💧', farbe: '#2563EB' },
  { id: 'verteiler',  name: 'Verteiler',    emoji: '🔵', farbe: '#0891B2' },
  { id: 'brandherd',  name: 'Brandherd',    emoji: '🔥', farbe: '#DC2626' },
  { id: 'pkw',        name: 'PKW',          emoji: '🚗', farbe: '#6B7280' },
  { id: 'lkw',        name: 'LKW',          emoji: '🚛', farbe: '#374151' },
  { id: 'person',     name: 'Person/Opfer', emoji: '👤', farbe: '#7C3AED' },
  { id: 'gefahrstoff',name: 'Gefahrstoff',  emoji: '☢️', farbe: '#F59E0B' },
  { id: 'pin',        name: 'Markierung',   emoji: '📍', farbe: '#DC2626' },
]
const LINIE_TYPEN = [
  { id: 'b_schlauch', farbe: '#2563EB', breite: 5 },
  { id: 'c_schlauch', farbe: '#16A34A', breite: 3 },
]
const ZONE_TYPEN = [
  { id: 'absperrung',     farbe: '#DC2626' },
  { id: 'bereitstellung', farbe: '#D97706' },
  { id: 'abschnitt',     farbe: '#7C3AED' },
]

// Windrichtung → Grad (Pfeil zeigt wohin der Wind weht)
const WIND_DEG = { N: 180, NO: 225, O: 270, SO: 315, S: 0, SW: 45, W: 90, NW: 135 }

const ll = ([lng, lat]) => [lat, lng]

function elEmoji(el) {
  if (el.typ === 'fahrzeug') return FAHRZEUG_TYPEN.find(f => f.id === el.subtyp)?.emoji ?? '🚒'
  if (el.typ === 'trupp')   return TRUPP_TYPEN.find(t => t.id === el.subtyp)?.emoji ?? '🧑‍🚒'
  return PUNKT_TYPEN.find(p => p.id === el.subtyp)?.emoji ?? '📍'
}
function elName(el) {
  if (el.typ === 'fahrzeug') return FAHRZEUG_TYPEN.find(f => f.id === el.subtyp)?.name ?? el.subtyp
  if (el.typ === 'trupp')   return TRUPP_TYPEN.find(t => t.id === el.subtyp)?.name ?? el.subtyp
  return PUNKT_TYPEN.find(p => p.id === el.subtyp)?.name ?? el.subtyp
}
function elFarbe(el) {
  if (el.typ === 'fahrzeug') return FAHRZEUG_TYPEN.find(f => f.id === el.subtyp)?.farbe ?? '#DC2626'
  if (el.typ === 'trupp')   return TRUPP_TYPEN.find(t => t.id === el.subtyp)?.farbe ?? '#DC2626'
  return PUNKT_TYPEN.find(p => p.id === el.subtyp)?.farbe ?? '#DC2626'
}

export default function PlanspielAnzeigePage() {
  const { id } = useParams()
  const [session, setSession]         = useState(null)
  const [phasen, setPhasen]           = useState([])
  const [lageUpdates, setLageUpdates] = useState([])
  const [wetterinfo, setWetterinfo]   = useState(null)
  const [letzteAkt, setLetzteAkt]     = useState(null)
  const [neuesMeldungId, setNeuesMeldungId] = useState(null)
  // Szenario einmalig beim Laden merken (für Realtime-Updates ohne Join-Fetch)
  const szenarioRef = useRef(null)
  const [anzeigePhaseIdx, setAnzeigePhaseIdx] = useState(0) // für Navigation

  const mapRef       = useRef(null)
  const markerRefs   = useRef({})
  const linienRefs   = useRef({})
  const zonenRefs    = useRef({})
  const hatZentriert = useRef(false)
  const prevLageLen  = useRef(-1)

  // Callback-Ref: Leaflet-Karte initialisieren sobald div im DOM
  const mapContainer = useCallback((node) => {
    if (!node || mapRef.current) return
    const map = L.map(node, { zoomControl: true })
    map.setView([51.1657, 10.4515], 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map
  }, [])

  function verarbeite(data) {
    // Szenario-Join beim ersten Laden speichern; bei späteren Updates aus Ref ergänzen
    if (data.szenario) szenarioRef.current = data.szenario
    const enriched = { ...data, szenario: data.szenario ?? szenarioRef.current }
    setSession(enriched)
    setLetzteAkt(new Date())

    const neuePhasen = data.phasen ?? []
    setPhasen(neuePhasen)

    // Anzeigeindex beim ersten Laden auf aktive Phase setzen
    const aktivIdx = neuePhasen.findIndex(p => p.aktiv && !p.abgeschlossen)
    if (prevLageLen.current === -1 && aktivIdx >= 0) setAnzeigePhaseIdx(aktivIdx)

    const wi = data.kartenzustand?.wetterinfo
    setWetterinfo(wi && Object.values(wi).some(Boolean) ? wi : null)

    const updates = data.lage_updates ?? []
    if (prevLageLen.current >= 0 && updates.length > prevLageLen.current) {
      setNeuesMeldungId(updates[0]?.id)
      setTimeout(() => setNeuesMeldungId(null), 4000)
    }
    prevLageLen.current = updates.length
    setLageUpdates(updates)

    const map = mapRef.current
    if (map) {
      if (!hatZentriert.current && data.map_center) {
        const c = data.map_center
        map.setView([c.lat, c.lng], c.zoom ?? 14)
        hatZentriert.current = true
      }
      aktualisiereKarte(map, data.kartenzustand ?? { elemente: [], linien: [], zonen: [] })
    }
  }

  function aktualisiereKarte(map, karte) {
    const elemente = karte.elemente ?? []
    const linien   = karte.linien   ?? []
    const zonen    = karte.zonen    ?? []

    const aktuelleIds = new Set(elemente.map(e => e.id))
    Object.entries(markerRefs.current).forEach(([mid, m]) => {
      if (!aktuelleIds.has(mid)) { m.remove(); delete markerRefs.current[mid] }
    })
    elemente.forEach(el => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${elFarbe(el)};color:white;border-radius:6px;padding:3px 7px;font-size:18px;box-shadow:0 2px 6px rgba(0,0,0,0.4);border:2px solid white;display:flex;align-items:center;gap:4px;white-space:nowrap;user-select:none;"><span>${elEmoji(el)}</span><span style="font-size:10px;font-weight:700;">${elName(el)}</span></div>`,
        iconAnchor: [0, 0],
      })
      if (!markerRefs.current[el.id]) {
        markerRefs.current[el.id] = L.marker(ll(el.position), { icon, draggable: false }).addTo(map)
      } else {
        markerRefs.current[el.id].setIcon(icon)
        markerRefs.current[el.id].setLatLng(ll(el.position))
      }
    })

    const linienIds = new Set(linien.map(l => l.id))
    Object.entries(linienRefs.current).forEach(([lid, l]) => {
      if (!linienIds.has(lid)) { l.remove(); delete linienRefs.current[lid] }
    })
    linien.forEach(l => {
      if (!linienRefs.current[l.id]) {
        const typ = LINIE_TYPEN.find(x => x.id === l.typ) ?? LINIE_TYPEN[0]
        linienRefs.current[l.id] = L.polyline(l.punkte.map(ll), { color: typ.farbe, weight: typ.breite ?? 3 }).addTo(map)
      }
    })

    const zonenIds = new Set(zonen.map(z => z.id))
    Object.entries(zonenRefs.current).forEach(([zid, z]) => {
      if (!zonenIds.has(zid)) { z.remove(); delete zonenRefs.current[zid] }
    })
    zonen.forEach(z => {
      if (!zonenRefs.current[z.id]) {
        const typ = ZONE_TYPEN.find(x => x.id === z.typ) ?? { farbe: '#DC2626' }
        zonenRefs.current[z.id] = L.polygon(z.punkte.map(ll), { color: typ.farbe, fillOpacity: typ.fill ?? 0.2, weight: 2, dashArray: typ.dash ? '8 6' : null }).addTo(map)
      }
    })
  }

  useEffect(() => {
    // Initial laden
    supabase.from('planspiel_sessions')
      .select('*, szenario:szenarien(titel, anfangs_meldung)')
      .eq('id', id).single()
      .then(({ data }) => { if (data) verarbeite(data) })

    // Realtime: payload.new direkt nutzen — kein Extra-Fetch, keine Race Condition
    const channel = supabase
      .channel(`planspiel-anzeige-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'planspiel_sessions', filter: `id=eq.${id}`
      }, (payload) => {
        if (payload.new) verarbeite(payload.new)
      })
      .subscribe()

    // Fallback-Polling alle 8 Sek. (falls Realtime-Verbindung nicht verfügbar)
    const fallback = setInterval(async () => {
      const { data } = await supabase
        .from('planspiel_sessions')
        .select('*, szenario:szenarien(titel, anfangs_meldung)')
        .eq('id', id).single()
      if (data) verarbeite(data)
    }, 8000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(fallback)
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      hatZentriert.current = false
      prevLageLen.current = -1
    }
  }, [id])

  const anzeigePhase = phasen[anzeigePhaseIdx]

  if (!session) return (
    <div className="loading-page"><div className="spinner"></div><span>Lade Planspiel…</span></div>
  )

  const windDeg = wetterinfo?.windrichtung ? (WIND_DEG[wetterinfo.windrichtung] ?? 0) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>
      {/* Header */}
      <div style={{ background: '#1F2937', color: 'white', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 18 }}>🗺️</span>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{session.titel}</span>
        {session.szenario && (
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.1)', borderRadius: 4, padding: '2px 8px' }}>
            {session.szenario.titel}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
          {letzteAkt ? `Stand: ${format(letzteAkt, 'HH:mm:ss', { locale: de })}` : 'Verbinde…'}
        </span>
      </div>

      {session.szenario?.anfangs_meldung && (
        <div style={{ background: '#FEF9EC', borderBottom: '1px solid #FCD34D', padding: '8px 16px', fontSize: 13, color: '#92400E', flexShrink: 0 }}>
          <strong>Lage:</strong> {session.szenario.anfangs_meldung}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Karte mit Wind-Overlay */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative' }}>
          <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

          {/* Wind-Indikator */}
          {windDeg !== null && (
            <div style={{
              position: 'absolute', top: 70, left: 12, zIndex: 1000,
              background: 'rgba(17,24,39,0.85)', backdropFilter: 'blur(6px)',
              borderRadius: 10, padding: '10px 14px',
              border: '1px solid rgba(255,255,255,0.15)', color: 'white',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              minWidth: 80, boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}>
              <svg width="44" height="44" viewBox="0 0 44 44" style={{ transform: `rotate(${windDeg}deg)`, transition: 'transform 0.5s' }}>
                {/* Pfeil-Körper */}
                <line x1="22" y1="38" x2="22" y2="8" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                {/* Pfeilspitze */}
                <polygon points="22,4 15,16 29,16" fill="white"/>
                {/* Richtungsmarkierung (kleine Striche) */}
                <line x1="22" y1="38" x2="14" y2="30" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round"/>
                <line x1="22" y1="38" x2="30" y2="30" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.05em' }}>
                Wind aus {wetterinfo.windrichtung}
              </div>
              {wetterinfo.windstaerke && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
                  {wetterinfo.windstaerke}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rechtes Panel */}
        <div style={{ width: 310, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#111827', borderLeft: '2px solid #374151' }}>

          {/* Wetterinfo */}
          {wetterinfo && (
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #374151', flexShrink: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>🌤 Übungsdaten</div>
              <WetterKarte wetterinfo={wetterinfo} dark />
            </div>
          )}

          {/* Phasen-Navigation */}
          {phasen.length > 0 && (
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #374151', flexShrink: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                📋 Phasen
              </div>
              {/* Fortschrittsbalken */}
              <div style={{ display: 'flex', gap: 3, marginBottom: 10 }}>
                {phasen.map((p, i) => (
                  <button key={p.id} onClick={() => setAnzeigePhaseIdx(i)} title={p.name} style={{
                    flex: 1, height: 6, borderRadius: 3, border: 'none', cursor: 'pointer',
                    background: i === anzeigePhaseIdx ? '#FBBF24' : p.abgeschlossen ? '#16A34A' : p.aktiv ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.15)',
                    transition: 'background 0.3s',
                  }} />
                ))}
              </div>
              {/* Navigation */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setAnzeigePhaseIdx(i => Math.max(0, i - 1))} disabled={anzeigePhaseIdx === 0} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: anzeigePhaseIdx === 0 ? 'rgba(255,255,255,0.2)' : 'white', cursor: anzeigePhaseIdx === 0 ? 'default' : 'pointer', fontSize: 14 }}>←</button>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{anzeigePhase?.name}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{anzeigePhaseIdx + 1} / {phasen.length}</div>
                </div>
                <button onClick={() => setAnzeigePhaseIdx(i => Math.min(phasen.length - 1, i + 1))} disabled={anzeigePhaseIdx === phasen.length - 1} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: anzeigePhaseIdx === phasen.length - 1 ? 'rgba(255,255,255,0.2)' : 'white', cursor: anzeigePhaseIdx === phasen.length - 1 ? 'default' : 'pointer', fontSize: 14 }}>→</button>
              </div>

              {/* Checkpunkte der gewählten Phase */}
              {anzeigePhase && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {anzeigePhase.checkpunkte.length === 0 && (
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '6px 0' }}>Keine Checkpunkte</p>
                  )}
                  {anzeigePhase.checkpunkte.map(cp => {
                    const st = cp.status ?? (cp.erledigt ? 'richtig' : null)
                    if (st === null) return null // noch nicht bewertet → nicht zeigen
                    return (
                      <div key={cp.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 8px', borderRadius: 6,
                        background: st === 'richtig' ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)',
                        border: `1px solid ${st === 'richtig' ? 'rgba(22,163,74,0.4)' : 'rgba(220,38,38,0.4)'}`,
                        animation: 'fadeIn 0.3s ease',
                      }}>
                        <span style={{ fontSize: 15, flexShrink: 0 }}>{st === 'richtig' ? '✅' : '❌'}</span>
                        <span style={{ fontSize: 12, color: 'white', lineHeight: 1.4 }}>{cp.text}</span>
                      </div>
                    )
                  })}
                  {anzeigePhase.checkpunkte.every(cp => (cp.status ?? (cp.erledigt ? 'richtig' : null)) === null) && (
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '4px 0' }}>
                      Warte auf Ausbilder-Bewertung…
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Lagemeldungen */}
          <div style={{ padding: '10px 12px 4px', flexShrink: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              ⚡ Lagemeldungen
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lageUpdates.length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 12 }}>Noch keine Meldungen</p>
            ) : lageUpdates.map((u, i) => (
              <div key={u.id} style={{
                borderRadius: 8, padding: '10px 12px',
                background: u.id === neuesMeldungId ? 'rgba(251,191,36,0.2)' : i === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${u.id === neuesMeldungId ? '#FBBF24' : i === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)'}`,
                transition: 'background 0.5s, border-color 0.5s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{format(new Date(u.zeit), 'HH:mm', { locale: de })} Uhr</span>
                  {i === 0 && <span style={{ background: '#DC2626', color: 'white', fontSize: 9, fontWeight: 700, borderRadius: 3, padding: '1px 5px' }}>NEU</span>}
                </div>
                <div style={{ fontSize: 13, color: 'white', lineHeight: 1.5 }}>{u.text}</div>
              </div>
            ))}
          </div>

          <div style={{ padding: '6px 16px', borderTop: '1px solid #374151', fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', flexShrink: 0 }}>
            {lageUpdates.length} Meldung{lageUpdates.length !== 1 ? 'en' : ''} gesamt
          </div>
        </div>
      </div>
    </div>
  )
}
