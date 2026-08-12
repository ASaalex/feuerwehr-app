import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'
import { OPTION_STYLE } from '../data/quizOptionStyle'

export default function QuizPlayPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [teilnehmerId] = useState(() => localStorage.getItem(`quiz_teilnehmer_${id}`))
  const [session, setSession] = useState(null)
  const [ich, setIch] = useState(null)
  const [fragen, setFragen] = useState([])
  const [remainingMs, setRemainingMs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fehler, setFehler] = useState('')

  // Beantwortungsstatus je Frage-Index
  const [meineAuswahl, setMeineAuswahl] = useState([])
  const [abgeschickt, setAbgeschickt] = useState(false)
  const [ergebnis, setErgebnis] = useState(null) // { richtig, punkte }
  const [sendeLaeuft, setSendeLaeuft] = useState(false)
  const [platzierung, setPlatzierung] = useState(null) // { platz, gesamt }
  const letzterIndex = useRef(-1)

  useEffect(() => {
    if (!teilnehmerId) {
      supabase.from('quiz_sessions').select('code').eq('id', id).single().then(({ data }) => {
        navigate(data ? `/quiz/join/${data.code}` : '/quiz/join')
      })
      return
    }

    let aktiv = true
    async function laden() {
      const { data: s } = await supabase.from('quiz_sessions').select('*, pruefung:pruefungen(titel)').eq('id', id).single()
      if (!aktiv || !s) return
      setSession(s)
      const { data: t } = await supabase.from('quiz_teilnehmer').select('*').eq('id', teilnehmerId).single()
      if (!aktiv) return
      setIch(t)
      const { data: f } = await supabase.from('fragen_oeffentlich').select('*').eq('pruefung_id', s.pruefung_id).order('reihenfolge')
      if (!aktiv) return
      setFragen(f ?? [])
      setLoading(false)
    }
    laden()

    const channel = supabase.channel(`quiz-play-${id}-${teilnehmerId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'quiz_sessions', filter: `id=eq.${id}` }, p => { if (p.new) setSession(s => ({ ...s, ...p.new })) })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'quiz_teilnehmer', filter: `id=eq.${teilnehmerId}` }, p => { if (p.new) setIch(t => ({ ...t, ...p.new })) })
      .subscribe()

    return () => { aktiv = false; supabase.removeChannel(channel) }
  }, [id, teilnehmerId])

  // "fragen_oeffentlich" liefert erst Zeilen, sobald die Session die Lobby verlassen hat
  // (Loesungen duerfen vorher nicht im Netzwerk-Payload stehen). Beim ersten Laden waehrend
  // der Lobby ist die Liste daher leer -> sobald der Host startet, hier nachladen.
  useEffect(() => {
    if (!session || session.status === 'lobby' || fragen.length > 0) return
    let aktiv = true
    supabase.from('fragen_oeffentlich').select('*').eq('pruefung_id', session.pruefung_id).order('reihenfolge').then(({ data }) => {
      if (aktiv) setFragen(data ?? [])
    })
    return () => { aktiv = false }
  }, [session?.status, session?.pruefung_id])

  // Beim Beenden die Platzierung anhand der finalen Punktzahlen aller Teilnehmer ermitteln
  useEffect(() => {
    if (session?.status !== 'beendet') return
    let aktiv = true
    supabase.from('quiz_teilnehmer').select('id,punkte').eq('session_id', id).then(({ data }) => {
      if (!aktiv || !data) return
      const sortiert = [...data].sort((a, b) => b.punkte - a.punkte)
      const platz = sortiert.findIndex(t => t.id === teilnehmerId) + 1
      setPlatzierung({ platz: platz || sortiert.length, gesamt: sortiert.length })
    })
    return () => { aktiv = false }
  }, [session?.status, id, teilnehmerId])

  // Neue Frage -> Beantwortungsstatus zuruecksetzen
  useEffect(() => {
    if (session?.aktuelle_frage_index !== letzterIndex.current) {
      letzterIndex.current = session?.aktuelle_frage_index
      setMeineAuswahl([])
      setAbgeschickt(false)
      setErgebnis(null)
    }
  }, [session?.aktuelle_frage_index])

  // Countdown
  useEffect(() => {
    if (session?.status !== 'frage_aktiv' || !session.frage_gestartet_am) { setRemainingMs(null); return }
    const endAt = new Date(session.frage_gestartet_am).getTime() + session.sekunden_pro_frage * 1000
    const tick = () => setRemainingMs(Math.max(0, endAt - Date.now()))
    tick()
    const iv = setInterval(tick, 200)
    return () => clearInterval(iv)
  }, [session?.status, session?.frage_gestartet_am])

  const aktuelleFrage = fragen[session?.aktuelle_frage_index ?? 0]

  async function antworten(auswahlArr) {
    if (!aktuelleFrage || abgeschickt || sendeLaeuft) return
    setSendeLaeuft(true)
    setFehler('')
    const istMehrfach = aktuelleFrage.typ === 'mehrfachauswahl'
    const antwortWert = istMehrfach ? auswahlArr : auswahlArr[0]

    const { data, error } = await supabase.from('quiz_antworten').insert({
      session_id: id, teilnehmer_id: teilnehmerId, frage_id: aktuelleFrage.id, antwort: antwortWert,
    }).select().single()

    if (error) {
      setFehler('Antwort konnte nicht gesendet werden.')
    } else {
      setAbgeschickt(true)
      setErgebnis({ richtig: data.richtig, punkte: data.punkte })
    }
    setSendeLaeuft(false)
  }

  function toggleMehrfach(i) {
    setMeineAuswahl(a => a.includes(i) ? a.filter(x => x !== i) : [...a, i])
  }

  if (!teilnehmerId) return <div className="loading-page"><div className="spinner"></div></div>
  if (loading || !session) return <div className="loading-page"><div className="spinner"></div><span>Lade Quiz…</span></div>

  const sekundenRest = remainingMs === null ? null : Math.ceil(remainingMs / 1000)

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(160deg, #1F2937, #111827)', color: 'white',
      display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <Avatar url={ich?.avatar_url} avatarKey={ich?.avatar_key} name={ich?.gast_name} size={32} />
        <span style={{ fontWeight: 600 }}>{ich?.gast_name}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontWeight: 700, color: '#FBBF24' }}>{ich?.punkte ?? 0} P.</span>
      </div>

      {fehler && <div className="alert alert-error" style={{ margin: 16 }}>{fehler}</div>}

      {session.status === 'lobby' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>🎉</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Du bist dabei!</div>
          <p style={{ color: 'rgba(255,255,255,0.6)' }}>{session.pruefung?.titel}</p>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Warte, bis der Quizmaster startet…</p>
        </div>
      )}

      {session.status === 'frage_aktiv' && aktuelleFrage && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px' }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Frage {(session.aktuelle_frage_index ?? 0) + 1} / {fragen.length}</span>
            {sekundenRest !== null && (
              <div style={{
                width: 40, height: 40, borderRadius: '50%', background: sekundenRest <= 5 ? '#DC2626' : '#374151',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
              }}>
                {sekundenRest}
              </div>
            )}
          </div>

          {!abgeschickt ? (
            <>
              <div style={{ padding: '8px 20px 20px', fontSize: 18, fontWeight: 600, textAlign: 'center' }}>{aktuelleFrage.frage_text}</div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px 16px' }}>
                {aktuelleFrage.antworten.map((a, i) => {
                  const st = OPTION_STYLE[i % OPTION_STYLE.length]
                  const istMehrfach = aktuelleFrage.typ === 'mehrfachauswahl'
                  const gewaehlt = meineAuswahl.includes(i)
                  return (
                    <button
                      key={i}
                      onClick={() => istMehrfach ? toggleMehrfach(i) : antworten([i])}
                      disabled={sendeLaeuft}
                      style={{
                        background: st.bg, border: gewaehlt ? '3px solid white' : '3px solid transparent',
                        borderRadius: 12, padding: '18px 16px', display: 'flex', alignItems: 'center', gap: 14,
                        fontSize: 17, fontWeight: 600, color: 'white', cursor: 'pointer',
                      }}
                    >
                      <span style={{
                        width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.9)', color: st.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, flexShrink: 0,
                      }}>{st.label}</span>
                      <span style={{ flex: 1, textAlign: 'left' }}>{a.text}</span>
                    </button>
                  )
                })}
              </div>
              {aktuelleFrage.typ === 'mehrfachauswahl' && (
                <div style={{ padding: 16 }}>
                  <button className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }} disabled={meineAuswahl.length === 0 || sendeLaeuft} onClick={() => antworten(meineAuswahl)}>
                    Antwort absenden
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', padding: 24 }}>
              <div style={{ fontSize: 48 }}>{ergebnis?.richtig ? '✅' : '❌'}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{ergebnis?.richtig ? 'Richtig!' : 'Leider falsch'}</div>
              {ergebnis?.richtig && <div style={{ color: '#FBBF24', fontWeight: 700 }}>+{ergebnis.punkte} Punkte</div>}
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Warte auf die anderen…</p>
            </div>
          )}
        </div>
      )}

      {session.status === 'frage_aktiv' && !aktuelleFrage && (
        <WartenView text="Warte auf naechste Frage…" />
      )}

      {session.status === 'frage_ausgewertet' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', padding: 24 }}>
          {abgeschickt ? (
            <>
              <div style={{ fontSize: 48 }}>{ergebnis?.richtig ? '✅' : '❌'}</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{ergebnis?.richtig ? 'Richtig!' : 'Leider falsch'}</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 40 }}>⏱</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>Nicht beantwortet</div>
            </>
          )}
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Schau auf die grosse Anzeige für die Rangliste — weiter geht's gleich.</p>
        </div>
      )}

      {session.status === 'beendet' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 48 }}>{platzierung?.platz === 1 ? '🏆' : '🏁'}</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Quiz beendet!</div>
          {platzierung && (
            <div style={{ fontSize: 28, fontWeight: 800, color: '#FBBF24' }}>
              {platzierung.platz}. Platz <span style={{ fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>von {platzierung.gesamt}</span>
            </div>
          )}
          <div style={{ fontSize: 16 }}>Du hast <strong style={{ color: '#FBBF24' }}>{ich?.punkte ?? 0} Punkte</strong> erreicht.</div>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Die Gesamtauswertung siehst du auf der grossen Anzeige.</p>
        </div>
      )}
    </div>
  )
}

function WartenView({ text }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)' }}>
      {text}
    </div>
  )
}
