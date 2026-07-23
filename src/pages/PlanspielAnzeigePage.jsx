import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

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
  { id: 'b_schlauch', name: 'B-Schlauch', farbe: '#2563EB', breite: 5 },
  { id: 'c_schlauch', name: 'C-Schlauch', farbe: '#16A34A', breite: 3 },
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
  const [karte, setKarte] = useState(null)
  const [lageUpdates, setLageUpdates] = useState([])
  const [letzteAktualisierung, setLetzteAktualisierung] = useState(null)
  const [neuesMeldung, setNeuesMeldung] = useState(null)

  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const markerRefs = useRef({})
  const linienRefs = useRef({})
  const zonenRefs = useRef({})
  const karteRef = useRef(null)

  // Daten laden (initial + alle 10 Sek.)
  useEffect(() => {
    laden()
    const interval = setInterval(laden, 10000)
    return () => clearInterval(interval)
  }, [id])

  async function laden() {
    const { data } = await supabase
      .from('planspiel_sessions')
      .select('*, szenario:szenarien(titel, anfangs_meldung)')
      .eq('id', id)
      .single()
    if (!data) return

    setSession(data)

    const neueUpdates = data.lage_updates ?? []
    setLageUpdates(prev => {
      // Neue Meldung erkannt → kurz hervorheben
      if (prev.length > 0 && neueUpdates.length > prev.length) {
        setNeuesMeldung(neueUpdates[0]?.id)
        setTimeout(() => setNeuesMeldung(null), 4000)
      }
      return neueUpdates
    })

    setKarte(data.kartenzustand ?? { elemente: [], linien: [], zonen: [] })
    setLetzteAktualisierung(new Date())
  }

  // Karte einmalig initialisieren
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return
    const map = L.map(mapContainer.current, { zoomControl: true, attributionControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map
  }, [mapContainer.current])

  // Karte auf Session-Center setzen (nur einmal)
  useEffect(() => {
    if (!session || !mapRef.current) return
    const center = session.map_center ?? { lng: 10.4515, lat: 51.1657, zoom: 14 }
    mapRef.current.setView([center.lat, center.lng], center.zoom ?? 14)
  }, [session?.id])

  // Kartenzustand synchron halten
  useEffect(() => {
    const map = mapRef.current
    if (!map || !karte) return
    karteRef.current = karte

    // Marker
    const aktuelleIds = new Set(karte.elemente.map(e => e.id))
    Object.entries(markerRefs.current).forEach(([id, m]) => {
      if (!aktuelleIds.has(id)) { m.remove(); delete markerRefs.current[id] }
    })
    karte.elemente.forEach(el => {
      if (!markerRefs.current[el.id]) {
        const icon = L.divIcon({
          className: '',
          html: `<div style="background:${elFarbe(el)};color:white;border-radius:6px;padding:3px 7px;font-size:18px;box-shadow:0 2px 6px rgba(0,0,0,0.4);border:2px solid white;display:flex;align-items:center;gap:4px;white-space:nowrap;user-select:none;"><span>${elEmoji(el)}</span><span style="font-size:10px;font-weight:700;">${elName(el)}</span></div>`,
          iconAnchor: [0, 0],
        })
        markerRefs.current[el.id] = L.marker(ll(el.position), { icon, draggable: false }).addTo(map)
      } else {
        markerRefs.current[el.id].setLatLng(ll(el.position))
      }
    })

    // Linien
    const linienIds = new Set(karte.linien.map(l => l.id))
    Object.entries(linienRefs.current).forEach(([id, layer]) => {
      if (!linienIds.has(id)) { layer.remove(); delete linienRefs.current[id] }
    })
    karte.linien.forEach(l => {
      if (!linienRefs.current[l.id]) {
        const typ = LINIE_TYPEN.find(x => x.id === l.typ) ?? LINIE_TYPEN[0]
        linienRefs.current[l.id] = L.polyline(l.punkte.map(ll), { color: typ.farbe, weight: typ.breite ?? 3 }).addTo(map)
      }
    })

    // Zonen
    const zonenIds = new Set(karte.zonen.map(z => z.id))
    Object.entries(zonenRefs.current).forEach(([id, layer]) => {
      if (!zonenIds.has(id)) { layer.remove(); delete zonenRefs.current[id] }
    })
    karte.zonen.forEach(z => {
      if (!zonenRefs.current[z.id]) {
        const typ = ZONE_TYPEN.find(x => x.id === z.typ) ?? { farbe: '#DC2626' }
        zonenRefs.current[z.id] = L.polygon(z.punkte.map(ll), { color: typ.farbe, fillOpacity: 0.2, weight: 2 }).addTo(map)
      }
    })
  }, [karte])

  if (!session) return (
    <div className="loading-page"><div className="spinner"></div><span>Lade Planspiel…</span></div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', position: 'relative' }}>
      {/* Schmaler Header */}
      <div style={{ background: '#1F2937', color: 'white', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 18 }}>🗺️</span>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{session.titel}</span>
        {session.szenario && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.1)', borderRadius: 4, padding: '2px 8px' }}>{session.szenario.titel}</span>}
        <div style={{ flex: 1 }} />
        {letzteAktualisierung && (
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
            Aktualisiert: {format(letzteAktualisierung, 'HH:mm:ss', { locale: de })} · alle 10 Sek.
          </span>
        )}
      </div>

      {/* Szenario-Meldung */}
      {session.szenario?.anfangs_meldung && (
        <div style={{ background: '#FEF9EC', borderBottom: '1px solid #FCD34D', padding: '8px 16px', fontSize: 13, color: '#92400E', flexShrink: 0 }}>
          <strong>Lage:</strong> {session.szenario.anfangs_meldung}
        </div>
      )}

      {/* Hauptbereich: Karte + Lage-Panel */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Karte */}
        <div ref={mapContainer} style={{ flex: 1, minWidth: 0 }} />

        {/* Lage-Updates Panel */}
        <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#1F2937', borderLeft: '2px solid #374151' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #374151' }}>
            <span style={{ color: 'white', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em' }}>⚡ Lagemeldungen</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lageUpdates.length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, textAlign: 'center', marginTop: 24 }}>Noch keine Meldungen</p>
            ) : lageUpdates.map((u, i) => (
              <div key={u.id} style={{
                borderRadius: 8,
                padding: '10px 12px',
                background: u.id === neuesMeldung
                  ? 'rgba(251, 191, 36, 0.25)'
                  : i === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
                border: u.id === neuesMeldung
                  ? '1px solid #FBBF24'
                  : i === 0 ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.08)',
                transition: 'background 0.5s, border 0.5s',
              }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{format(new Date(u.zeit), 'HH:mm', { locale: de })} Uhr</span>
                  {i === 0 && <span style={{ background: '#DC2626', color: 'white', fontSize: 9, fontWeight: 700, borderRadius: 3, padding: '1px 5px', letterSpacing: '0.05em' }}>NEU</span>}
                </div>
                <div style={{ fontSize: 13, color: 'white', lineHeight: 1.5 }}>{u.text}</div>
              </div>
            ))}
          </div>
          {/* Anzahl Meldungen */}
          <div style={{ padding: '8px 16px', borderTop: '1px solid #374151', fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
            {lageUpdates.length} Meldung{lageUpdates.length !== 1 ? 'en' : ''} gesamt
          </div>
        </div>
      </div>
    </div>
  )
}
