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
  { id: 'hydrant',   name: 'Hydrant',    emoji: '💧', farbe: '#2563EB' },
  { id: 'verteiler', name: 'Verteiler',  emoji: '🔵', farbe: '#0891B2' },
  { id: 'pin',       name: 'Markierung', emoji: '📍', farbe: '#DC2626' },
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
  const [session, setSession] = useState(null)
  const [lageUpdates, setLageUpdates] = useState([])
  const [phasen, setPhasen] = useState([])
  const [wetterinfo, setWetterinfo] = useState(null)
  const [letzteAktualisierung, setLetzteAktualisierung] = useState(null)
  const [neuesMeldungId, setNeuesMeldungId] = useState(null)

  // Karte
  const mapRef = useRef(null)
  const markerRefs = useRef({})
  const linienRefs = useRef({})
  const zonenRefs = useRef({})
  // Merken ob Karte schon zentriert wurde
  const hatZentriert = useRef(false)
  // Letzter Lage-Count für Neu-Erkennung
  const prevLageCountRef = useRef(-1)

  // Callback-Ref: Karte initialisieren sobald der div im DOM ist
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

  async function laden() {
    const map = mapRef.current
    const { data, error } = await supabase
      .from('planspiel_sessions')
      .select('*, szenario:szenarien(titel, anfangs_meldung)')
      .eq('id', id)
      .single()
    if (error || !data) return

    setSession(data)
    setLetzteAktualisierung(new Date())
    setPhasen(data.phasen ?? [])

    // Karte einmalig auf Session-Center setzen
    if (map && data.map_center && !hatZentriert.current) {
      const c = data.map_center
      map.setView([c.lat, c.lng], c.zoom ?? 14)
      hatZentriert.current = true
    }

    // Wetterinfo
    const wi = data.kartenzustand?.wetterinfo
    setWetterinfo(wi && Object.values(wi).some(Boolean) ? wi : null)

    // Lage-Updates — neue Meldung erkennen
    const updates = data.lage_updates ?? []
    if (prevLageCountRef.current >= 0 && updates.length > prevLageCountRef.current) {
      const neueId = updates[0]?.id
      setNeuesMeldungId(neueId)
      setTimeout(() => setNeuesMeldungId(null), 4000)
    }
    prevLageCountRef.current = updates.length
    setLageUpdates(updates)

    // Kartenzustand rendern
    if (map) aktualisiereKarte(map, data.kartenzustand ?? { elemente: [], linien: [], zonen: [] })
  }

  function aktualisiereKarte(map, karte) {
    const elemente = karte.elemente ?? []
    const linien   = karte.linien   ?? []
    const zonen    = karte.zonen    ?? []

    // Marker
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

    // Linien
    const linienIds = new Set(linien.map(l => l.id))
    Object.entries(linienRefs.current).forEach(([lid, layer]) => {
      if (!linienIds.has(lid)) { layer.remove(); delete linienRefs.current[lid] }
    })
    linien.forEach(l => {
      if (!linienRefs.current[l.id]) {
        const typ = LINIE_TYPEN.find(x => x.id === l.typ) ?? LINIE_TYPEN[0]
        linienRefs.current[l.id] = L.polyline(l.punkte.map(ll), { color: typ.farbe, weight: typ.breite ?? 3 }).addTo(map)
      }
    })

    // Zonen
    const zonenIds = new Set(zonen.map(z => z.id))
    Object.entries(zonenRefs.current).forEach(([zid, layer]) => {
      if (!zonenIds.has(zid)) { layer.remove(); delete zonenRefs.current[zid] }
    })
    zonen.forEach(z => {
      if (!zonenRefs.current[z.id]) {
        const typ = ZONE_TYPEN.find(x => x.id === z.typ) ?? { farbe: '#DC2626' }
        zonenRefs.current[z.id] = L.polygon(z.punkte.map(ll), { color: typ.farbe, fillOpacity: 0.2, weight: 2 }).addTo(map)
      }
    })
  }

  // Initial laden + Interval — kein setTimeout, callback-ref garantiert map ist bereit
  useEffect(() => {
    laden()
    const interval = setInterval(laden, 10000)
    return () => {
      clearInterval(interval)
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      hatZentriert.current = false
      prevLageCountRef.current = -1
    }
  }, [id])

  // Aktive Phase für Anzeige
  const aktivPhase = phasen.find(p => p.aktiv && !p.abgeschlossen) ?? phasen.find(p => !p.abgeschlossen)

  if (!session) return (
    <div className="loading-page">
      <div className="spinner"></div>
      <span>Lade Planspiel…</span>
    </div>
  )

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
        {letzteAktualisierung && (
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
            Stand: {format(letzteAktualisierung, 'HH:mm:ss', { locale: de })} · alle 10 Sek.
          </span>
        )}
      </div>

      {/* Szenario-Lage */}
      {session.szenario?.anfangs_meldung && (
        <div style={{ background: '#FEF9EC', borderBottom: '1px solid #FCD34D', padding: '8px 16px', fontSize: 13, color: '#92400E', flexShrink: 0 }}>
          <strong>Lage:</strong> {session.szenario.anfangs_meldung}
        </div>
      )}

      {/* Karte + rechtes Panel */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div ref={mapContainer} style={{ flex: 1, minWidth: 0, minHeight: 0 }} />

        {/* Rechtes Panel */}
        <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#111827', borderLeft: '2px solid #374151', overflowY: 'auto' }}>

          {/* Wetterinfo */}
          {wetterinfo && (
            <div style={{ padding: '12px 12px 0' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>🌤 Übungsdaten</div>
              <WetterKarte wetterinfo={wetterinfo} dark />
            </div>
          )}

          {/* Aktive Phase + Checkpunkte */}
          {aktivPhase && (
            <div style={{ padding: '12px 12px 0' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                📋 Phase: {aktivPhase.name}
              </div>
              {/* Phasen-Fortschrittsleiste */}
              <div style={{ display: 'flex', gap: 3, marginBottom: 10 }}>
                {phasen.map(p => (
                  <div key={p.id} title={p.name} style={{ flex: 1, height: 4, borderRadius: 2, background: p.abgeschlossen ? '#16A34A' : p.id === aktivPhase.id ? '#FBBF24' : 'rgba(255,255,255,0.15)' }} />
                ))}
              </div>
              {/* Checkpunkte */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                {aktivPhase.checkpunkte.map(cp => (
                  <div key={cp.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 8px', borderRadius: 6, background: cp.erledigt ? 'rgba(22,163,74,0.2)' : 'rgba(255,255,255,0.06)', border: `1px solid ${cp.erledigt ? 'rgba(22,163,74,0.4)' : 'rgba(255,255,255,0.1)'}` }}>
                    <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{cp.erledigt ? '✅' : '⬜'}</span>
                    <span style={{ fontSize: 12, color: cp.erledigt ? 'rgba(255,255,255,0.5)' : 'white', textDecoration: cp.erledigt ? 'line-through' : 'none', lineHeight: 1.4 }}>{cp.text}</span>
                  </div>
                ))}
                {aktivPhase.checkpunkte.length === 0 && (
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '8px 0' }}>Keine Checkpunkte</p>
                )}
              </div>
            </div>
          )}

          {/* Divider */}
          {(wetterinfo || aktivPhase) && (
            <div style={{ height: 1, background: '#374151', margin: '0 12px 0' }} />
          )}

          {/* Lagemeldungen */}
          <div style={{ padding: '12px 12px 0', flexShrink: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              ⚡ Lagemeldungen
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lageUpdates.length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 16 }}>Noch keine Meldungen</p>
            ) : lageUpdates.map((u, i) => (
              <div key={u.id} style={{
                borderRadius: 8, padding: '10px 12px',
                background: u.id === neuesMeldungId ? 'rgba(251,191,36,0.2)' : i === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${u.id === neuesMeldungId ? '#FBBF24' : i === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)'}`,
                transition: 'background 0.5s, border-color 0.5s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                    {format(new Date(u.zeit), 'HH:mm', { locale: de })} Uhr
                  </span>
                  {i === 0 && (
                    <span style={{ background: '#DC2626', color: 'white', fontSize: 9, fontWeight: 700, borderRadius: 3, padding: '1px 5px', letterSpacing: '0.05em' }}>
                      NEU
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'white', lineHeight: 1.5 }}>{u.text}</div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ padding: '8px 16px', borderTop: '1px solid #374151', fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', flexShrink: 0 }}>
            {lageUpdates.length} Meldung{lageUpdates.length !== 1 ? 'en' : ''} gesamt
          </div>
        </div>
      </div>
    </div>
  )
}
