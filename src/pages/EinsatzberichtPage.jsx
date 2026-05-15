import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

export default function EinsatzberichtPage() {
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [berichte, setBerichte] = useState([])
  const [loading, setLoading] = useState(true)
  const [suche, setSuche] = useState('')
  const [msg, setMsg] = useState('')

  const kannErstellen = profile?.rolle && ['wehrleiter', 'gemeindebrandmeister', 'gruppenfuehrer', 'ausbilder', 'tablet'].includes(profile.rolle)

  useEffect(() => { fetchBerichte() }, [])

  async function fetchBerichte() {
    let q = supabase
      .from('einsatzberichte')
      .select('id, datum, alarmzeit, einsatzart, einsatzort, abgeschlossen, erstellt_am, erstellt_von:profiles(vorname,nachname)')
      .order('datum', { ascending: false })
      .order('erstellt_am', { ascending: false })

    if (profile?.rolle !== 'gemeindebrandmeister' && profile?.wehr_id) {
      q = q.eq('wehr_id', profile.wehr_id)
    }

    const { data } = await q
    setBerichte(data ?? [])
    setLoading(false)
  }

  async function handleLoeschen(b) {
    if (!confirm(`Einsatzbericht vom ${formatDatum(b.datum)} wirklich loeschen?`)) return

    // Fotos aus Storage löschen
    const { data: bericht } = await supabase
      .from('einsatzberichte')
      .select('foto_pfade')
      .eq('id', b.id)
      .single()

    if (bericht?.foto_pfade?.length) {
      const { error: storageErr } = await supabase.storage
        .from('einsatz-fotos')
        .remove(bericht.foto_pfade)
      if (storageErr) console.warn('Storage-Löschfehler:', storageErr.message)
    }

    await supabase.from('einsatzberichte').delete().eq('id', b.id)
    await fetchBerichte()
  }

  function formatDatum(d) {
    if (!d) return '–'
    return new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const gefiltert = berichte.filter(b => {
    if (!suche) return true
    const s = suche.toLowerCase()
    return (
      (b.einsatzart || '').toLowerCase().includes(s) ||
      (b.einsatzort || '').toLowerCase().includes(s) ||
      formatDatum(b.datum).includes(s)
    )
  })

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Einsatzberichte</h1>
          <p style={{ marginTop: 4 }}>{gefiltert.length} Bericht{gefiltert.length !== 1 ? 'e' : ''}</p>
        </div>
        {kannErstellen && (
          <button className="btn btn-primary" onClick={() => navigate('/einsatzbericht/neu')}>
            + Neuer Bericht
          </button>
        )}
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}

      <div style={{ marginBottom: 20 }}>
        <input
          placeholder="Suchen nach Einsatzart, Ort, Datum..."
          value={suche}
          onChange={e => setSuche(e.target.value)}
          style={{ maxWidth: 340 }}
        />
      </div>

      {gefiltert.length === 0 ? (
        <div className="empty-state card">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
          </svg>
          <p>{suche ? 'Keine Ergebnisse gefunden.' : 'Noch keine Einsatzberichte vorhanden.'}</p>
          {kannErstellen && !suche && (
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate('/einsatzbericht/neu')}>
              Ersten Bericht erstellen
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {gefiltert.map(b => (
            <div key={b.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              {/* Datum-Badge */}
              <div style={{
                minWidth: 52, height: 52, borderRadius: 10, background: 'var(--red-light)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--red)', lineHeight: 1 }}>
                  {b.datum ? new Date(b.datum + 'T12:00:00').getDate() : '–'}
                </span>
                <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 500 }}>
                  {b.datum ? new Date(b.datum + 'T12:00:00').toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }) : ''}
                </span>
              </div>

              {/* Inhalt */}
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--gray-800)', marginBottom: 2 }}>
                  {b.einsatzart || 'Einsatz'}
                  {b.alarmzeit && <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--gray-500)', marginLeft: 8 }}>{b.alarmzeit.slice(0, 5)} Uhr</span>}
                </div>
                <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                  {b.einsatzort || 'Kein Ort angegeben'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 3 }}>
                  {b.erstellt_von ? `${b.erstellt_von.vorname} ${b.erstellt_von.nachname}` : ''}
                  {b.erstellt_am ? ` · ${format(new Date(b.erstellt_am), 'd. MMM yyyy', { locale: de })}` : ''}
                </div>
              </div>

              {/* Status */}
              <div style={{ flexShrink: 0 }}>
                <span className={`badge badge-${b.abgeschlossen ? 'green' : 'blue'}`}>
                  {b.abgeschlossen ? '✓ Abgeschlossen' : 'In Bearbeitung'}
                </span>
              </div>

              {/* Aktionen */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => navigate(`/einsatzbericht/${b.id}`)}
                >
                  ✎ Bearbeiten
                </button>
                {(isAdmin || b.erstellt_von?.id === profile?.id) && (
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleLoeschen(b)}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
