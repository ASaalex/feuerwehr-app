import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // ohne 0/O/1/I zur besseren Lesbarkeit

function generiereCode() {
  return Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')
}

export default function QuizSetupPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [pruefungen, setPruefungen] = useState([])
  const [loading, setLoading] = useState(true)
  const [pruefungId, setPruefungId] = useState(searchParams.get('pruefung') ?? '')
  const [sekunden, setSekunden] = useState(20)
  const [fragenInfo, setFragenInfo] = useState(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('pruefungen')
      .select('*, erstellt_von:profiles(id,vorname,nachname)')
      .order('erstellt_am', { ascending: false })
      .then(({ data }) => { setPruefungen(data ?? []); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!pruefungId) { setFragenInfo(null); return }
    supabase.from('fragen').select('id,typ').eq('pruefung_id', pruefungId).then(({ data }) => {
      const alle = data ?? []
      const spielbar = alle.filter(f => f.typ !== 'freitext')
      setFragenInfo({ gesamt: alle.length, spielbar: spielbar.length, freitext: alle.length - spielbar.length })
    })
  }, [pruefungId])

  async function handleStart() {
    if (!pruefungId || !fragenInfo?.spielbar) return
    setStarting(true)
    setError('')

    for (let versuch = 0; versuch < 5; versuch++) {
      const code = generiereCode()
      const { data, error: err } = await supabase.from('quiz_sessions').insert({
        code,
        pruefung_id: pruefungId,
        erstellt_von: profile.id,
        wehr_id: profile.wehr_id,
        sekunden_pro_frage: sekunden,
      }).select().single()

      if (!err) { navigate(`/quiz/${data.id}/host`); return }
      if (err.code !== '23505') { setError('Fehler: ' + err.message); break } // 23505 = unique violation (Code-Kollision) -> nochmal versuchen
    }
    setStarting(false)
  }

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="page-header">
        <h1>🎮 Live-Quiz starten</h1>
      </div>
      <p style={{ marginBottom: 20 }}>Waehle eine bestehende Pruefung — sie wird als Kahoot-artiges Live-Quiz mit Beamer-Ansicht, Timer und Rangliste gespielt.</p>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-group">
          <label>Pruefung</label>
          <select value={pruefungId} onChange={e => setPruefungId(e.target.value)}>
            <option value="">— auswaehlen —</option>
            {pruefungen.map(p => (
              <option key={p.id} value={p.id}>{p.titel}</option>
            ))}
          </select>
        </div>

        {fragenInfo && (
          <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: -8, marginBottom: 16 }}>
            {fragenInfo.spielbar} Frage{fragenInfo.spielbar !== 1 ? 'n' : ''} spielbar
            {fragenInfo.freitext > 0 && ` · ${fragenInfo.freitext} Freitext-Frage${fragenInfo.freitext !== 1 ? 'n' : ''} werden im Live-Quiz übersprungen (nicht automatisch auswertbar)`}
          </div>
        )}

        <div className="form-group">
          <label>Zeit pro Frage: {sekunden} Sekunden</label>
          <input
            type="range" min={5} max={60} step={5}
            value={sekunden} onChange={e => setSekunden(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      <button
        className="btn btn-primary btn-lg"
        style={{ width: '100%', justifyContent: 'center' }}
        disabled={!pruefungId || !fragenInfo?.spielbar || starting}
        onClick={handleStart}
      >
        {starting ? 'Wird gestartet...' : 'Quiz-Session erstellen →'}
      </button>
    </div>
  )
}
