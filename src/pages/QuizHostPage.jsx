import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'
import QrCode from '../components/QrCode'
import { OPTION_STYLE } from '../data/quizOptionStyle'

export default function QuizHostPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [fragen, setFragen] = useState([])
  const [teilnehmer, setTeilnehmer] = useState([])
  const [antworten, setAntworten] = useState([]) // alle Antworten der aktuellen Session (Realtime-Stream)
  const [remainingMs, setRemainingMs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [zeigeAbbrechenModal, setZeigeAbbrechenModal] = useState(false)
  const auswertungLaeuft = useRef(false)

  useEffect(() => {
    let aktiv = true
    async function laden() {
      const { data: s } = await supabase.from('quiz_sessions').select('*, pruefung:pruefungen(titel)').eq('id', id).single()
      if (!aktiv || !s) return
      setSession(s)
      const { data: f } = await supabase.from('fragen').select('*').eq('pruefung_id', s.pruefung_id).neq('typ', 'freitext').order('reihenfolge')
      if (!aktiv) return
      setFragen((f ?? []).map(fr => ({ ...fr, antworten: typeof fr.antworten === 'string' ? JSON.parse(fr.antworten) : (fr.antworten ?? []) })))
      setLoading(false)
    }
    laden()

    const channel = supabase.channel(`quiz-host-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'quiz_sessions', filter: `id=eq.${id}` }, p => { if (p.new) setSession(s => ({ ...s, ...p.new })) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_teilnehmer', filter: `session_id=eq.${id}` }, () => refetchTeilnehmer())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'quiz_antworten', filter: `session_id=eq.${id}` }, p => { if (p.new) setAntworten(a => [...a, p.new]) })
      .subscribe()

    refetchTeilnehmer()

    return () => { aktiv = false; supabase.removeChannel(channel) }
  }, [id])

  async function refetchTeilnehmer() {
    const { data } = await supabase.from('quiz_teilnehmer').select('*').eq('session_id', id).order('beigetreten_am')
    setTeilnehmer(data ?? [])
  }

  // Countdown fuer aktive Frage
  useEffect(() => {
    if (session?.status !== 'frage_aktiv' || !session.frage_gestartet_am) { setRemainingMs(null); return }
    auswertungLaeuft.current = false
    const endAt = new Date(session.frage_gestartet_am).getTime() + session.sekunden_pro_frage * 1000
    const tick = () => {
      const rem = endAt - Date.now()
      setRemainingMs(Math.max(0, rem))
      if (rem <= 0 && !auswertungLaeuft.current) {
        auswertungLaeuft.current = true
        clearInterval(iv)
        auswerten()
      }
    }
    tick()
    const iv = setInterval(tick, 200)
    return () => clearInterval(iv)
  }, [session?.status, session?.frage_gestartet_am, session?.id])

  const aktuelleFrage = fragen[session?.aktuelle_frage_index ?? 0]

  async function starten() {
    await supabase.from('quiz_sessions').update({ status: 'frage_aktiv', aktuelle_frage_index: 0, frage_gestartet_am: new Date().toISOString() }).eq('id', id)
    setAntworten([])
  }

  async function auswerten() {
    await supabase.from('quiz_sessions').update({ status: 'frage_ausgewertet' }).eq('id', id)
  }

  async function abbrechenBestaetigt() {
    setZeigeAbbrechenModal(false)
    await supabase.from('quiz_sessions').update({ status: 'beendet' }).eq('id', id)
    navigate('/pruefungen')
  }

  async function naechsteFrage() {
    const naechsterIndex = (session.aktuelle_frage_index ?? 0) + 1
    if (naechsterIndex >= fragen.length) {
      await supabase.from('quiz_sessions').update({ status: 'beendet' }).eq('id', id)
      return
    }
    setAntworten([])
    await supabase.from('quiz_sessions').update({
      status: 'frage_aktiv', aktuelle_frage_index: naechsterIndex, frage_gestartet_am: new Date().toISOString(),
    }).eq('id', id)
  }

  if (loading || !session) return <div className="loading-page"><div className="spinner"></div><span>Lade Quiz…</span></div>

  const joinUrl = `${window.location.origin}/quiz/join/${session.code}`
  const rangliste = [...teilnehmer].sort((a, b) => b.punkte - a.punkte)

  return (
    <div style={{
      minHeight: 'calc(100vh - 0px)', background: 'linear-gradient(135deg, #1F2937, #111827)', color: 'white',
      display: 'flex', flexDirection: 'column', padding: '24px 32px', boxSizing: 'border-box', position: 'relative',
    }}>
      {session.status !== 'beendet' && (
        <button
          onClick={() => setZeigeAbbrechenModal(true)}
          title="Quiz beenden und verlassen"
          style={{
            position: 'absolute', top: 16, left: 16, zIndex: 10,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)',
            borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer',
          }}
        >
          ← Beenden
        </button>
      )}

      {zeigeAbbrechenModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setZeigeAbbrechenModal(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>Quiz beenden?</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setZeigeAbbrechenModal(false)}>✕</button>
            </div>
            <p style={{ color: 'var(--gray-500)', marginBottom: 20 }}>
              Alle Teilnehmer werden sofort zur Endauswertung weitergeleitet. Das kann nicht rückgängig gemacht werden.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setZeigeAbbrechenModal(false)}>Abbrechen</button>
              <button className="btn btn-danger" onClick={abbrechenBestaetigt}>Ja, Quiz beenden</button>
            </div>
          </div>
        </div>
      )}
      {session.status === 'lobby' && (
        <LobbyView session={session} teilnehmer={teilnehmer} joinUrl={joinUrl} onStart={starten} fragenAnzahl={fragen.length} />
      )}
      {session.status === 'frage_aktiv' && aktuelleFrage && (
        <FrageAktivView
          frage={aktuelleFrage} index={session.aktuelle_frage_index} gesamt={fragen.length}
          remainingMs={remainingMs} sekunden={session.sekunden_pro_frage}
          beantwortetAnzahl={antworten.filter(a => a.frage_id === aktuelleFrage.id).length}
          teilnehmerAnzahl={teilnehmer.length}
          onJetztAuswerten={auswerten}
        />
      )}
      {session.status === 'frage_ausgewertet' && aktuelleFrage && (
        <AuswertungView
          frage={aktuelleFrage} index={session.aktuelle_frage_index} gesamt={fragen.length}
          antworten={antworten.filter(a => a.frage_id === aktuelleFrage.id)}
          teilnehmer={teilnehmer} rangliste={rangliste}
          onWeiter={naechsteFrage}
          istLetzte={(session.aktuelle_frage_index ?? 0) + 1 >= fragen.length}
        />
      )}
      {session.status === 'beendet' && (
        <EndauswertungView rangliste={rangliste} onZurueck={() => navigate('/pruefungen')} />
      )}
    </div>
  )
}

// ─── Lobby ──────────────────────────────────────────────────────────────────

function LobbyView({ session, teilnehmer, joinUrl, onStart, fragenAnzahl }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
          {session.pruefung?.titel}
        </div>
        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', marginBottom: 18 }}>Beitreten unter <strong>{window.location.host}/quiz/join</strong> mit Code:</div>
        <div style={{
          fontSize: 56, fontWeight: 800, letterSpacing: '0.15em', background: 'white', color: '#1F2937',
          borderRadius: 16, padding: '14px 36px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {session.code}
        </div>
      </div>

      <QrCode value={joinUrl} size={200} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 800, minHeight: 60 }}>
        {teilnehmer.length === 0 ? (
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>Warte auf Teilnehmer…</span>
        ) : teilnehmer.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 24, padding: '6px 14px 6px 6px', animation: 'fadeIn 0.3s ease' }}>
            <Avatar url={t.avatar_url} avatarKey={t.avatar_key} name={t.gast_name} size={30} />
            <span style={{ fontWeight: 500 }}>{t.gast_name}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <span style={{ color: 'rgba(255,255,255,0.6)' }}>{teilnehmer.length} beigetreten · {fragenAnzahl} Fragen</span>
        <button className="btn btn-primary btn-lg" onClick={onStart} disabled={teilnehmer.length === 0}>
          Quiz starten ▶
        </button>
      </div>
    </div>
  )
}

// ─── Frage aktiv ────────────────────────────────────────────────────────────

function FrageAktivView({ frage, index, gesamt, remainingMs, sekunden, beantwortetAnzahl, teilnehmerAnzahl, onJetztAuswerten }) {
  const sekundenRest = remainingMs === null ? sekunden : Math.ceil(remainingMs / 1000)
  const fortschritt = remainingMs === null ? 1 : remainingMs / (sekunden * 1000)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Frage {index + 1} / {gesamt}</span>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', background: sekundenRest <= 5 ? '#DC2626' : '#374151',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700,
          transition: 'background 300ms',
        }}>
          {sekundenRest}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onJetztAuswerten}>Jetzt auswerten →</button>
      </div>

      <div style={{ height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: '#FBBF24', width: `${fortschritt * 100}%`, transition: 'width 200ms linear' }} />
      </div>

      <div style={{ textAlign: 'center', fontSize: 30, fontWeight: 700, padding: '20px 0', lineHeight: 1.4 }}>
        {frage.frage_text}
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignContent: 'center' }}>
        {frage.antworten.map((a, i) => {
          const st = OPTION_STYLE[i % OPTION_STYLE.length]
          return (
            <div key={i} style={{
              background: st.bg, borderRadius: 14, padding: '24px 20px',
              display: 'flex', alignItems: 'center', gap: 16, fontSize: 22, fontWeight: 600,
              boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
            }}>
              <span style={{
                width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.9)', color: st.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, flexShrink: 0,
              }}>{st.label}</span>
              <span>{a.text}</span>
            </div>
          )
        })}
      </div>

      <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 15 }}>
        {beantwortetAnzahl} / {teilnehmerAnzahl} haben geantwortet
      </div>
    </div>
  )
}

// ─── Auswertung nach jeder Frage ────────────────────────────────────────────

function AuswertungView({ frage, index, gesamt, antworten, teilnehmer, rangliste, onWeiter, istLetzte }) {
  const richtigeTexte = frage.antworten.filter(a => a.richtig).map(a => a.text)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Frage {index + 1} / {gesamt} · Auswertung</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {frage.antworten.map((a, i) => {
          const st = OPTION_STYLE[i % OPTION_STYLE.length]
          const anzahl = antworten.filter(ant => {
            const val = ant.antwort
            return Array.isArray(val) ? val.includes(i) : val === i
          }).length
          const prozent = antworten.length ? Math.round(anzahl / antworten.length * 100) : 0
          const istRichtig = richtigeTexte.includes(a.text)
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.08)',
              borderRadius: 10, padding: '10px 16px', border: istRichtig ? '2px solid #16A34A' : '2px solid transparent',
            }}>
              <span style={{
                width: 28, height: 28, borderRadius: 8, background: st.bg, color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0,
              }}>{st.label}</span>
              <span style={{ flex: 1, fontWeight: 500 }}>{a.text}</span>
              {istRichtig && <span style={{ fontSize: 13, color: '#4ADE80', fontWeight: 700 }}>✓ RICHTIG</span>}
              <div style={{ width: 160, height: 10, background: 'rgba(255,255,255,0.15)', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ width: `${prozent}%`, height: '100%', background: st.bg, transition: 'width 500ms' }} />
              </div>
              <span style={{ width: 60, textAlign: 'right', fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{anzahl} ({prozent}%)</span>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>🏆 Rangliste</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rangliste.slice(0, 8).map((t, i) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: i === 0 ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 14px' }}>
              <span style={{ width: 26, fontWeight: 700, color: i === 0 ? '#FBBF24' : 'rgba(255,255,255,0.5)' }}>{i + 1}.</span>
              <Avatar url={t.avatar_url} avatarKey={t.avatar_key} name={t.gast_name} size={28} />
              <span style={{ flex: 1, fontWeight: 500 }}>{t.gast_name}</span>
              <span style={{ fontWeight: 700, color: '#FBBF24' }}>{t.punkte} P.</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
        <button className="btn btn-primary btn-lg" onClick={onWeiter}>
          {istLetzte ? 'Endauswertung anzeigen 🏁' : 'Nächste Frage →'}
        </button>
      </div>
    </div>
  )
}

// ─── Endauswertung ──────────────────────────────────────────────────────────

function EndauswertungView({ rangliste, onZurueck }) {
  const [a, b, c, ...rest] = rangliste
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
      <div style={{ fontSize: 32, fontWeight: 800 }}>🏁 Endauswertung</div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20 }}>
        {b && <Treppchen platz={2} teilnehmer={b} hoehe={110} farbe="#94A3B8" />}
        {a && <Treppchen platz={1} teilnehmer={a} hoehe={150} farbe="#FBBF24" />}
        {c && <Treppchen platz={3} teilnehmer={c} hoehe={80} farbe="#B45309" />}
      </div>

      {rest.length > 0 && (
        <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rest.map((t, i) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 14px' }}>
              <span style={{ width: 26, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{i + 4}.</span>
              <Avatar url={t.avatar_url} avatarKey={t.avatar_key} name={t.gast_name} size={26} />
              <span style={{ flex: 1, fontWeight: 500 }}>{t.gast_name}</span>
              <span style={{ fontWeight: 700, color: '#FBBF24' }}>{t.punkte} P.</span>
            </div>
          ))}
        </div>
      )}

      <button className="btn btn-secondary" onClick={onZurueck}>Zurück zu Prüfungen</button>
    </div>
  )
}

function Treppchen({ platz, teilnehmer, hoehe, farbe }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <Avatar url={teilnehmer.avatar_url} avatarKey={teilnehmer.avatar_key} name={teilnehmer.gast_name} size={platz === 1 ? 56 : 44} />
      <div style={{ fontWeight: 700, fontSize: platz === 1 ? 16 : 14 }}>{teilnehmer.gast_name}</div>
      <div style={{ fontSize: 13, color: '#FBBF24', fontWeight: 700 }}>{teilnehmer.punkte} P.</div>
      <div style={{
        width: 90, height: hoehe, background: farbe, borderRadius: '8px 8px 0 0',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 8,
        fontSize: 24, fontWeight: 800, color: 'rgba(0,0,0,0.5)',
      }}>
        {platz}
      </div>
    </div>
  )
}
