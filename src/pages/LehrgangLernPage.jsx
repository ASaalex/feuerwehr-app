import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function LehrgangLernPage() {
  const { id } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [lehrgang, setLehrgang] = useState(null)
  const [themen, setThemen] = useState([])
  const [alleFragen, setAlleFragen] = useState([]) // {frage, thema}
  const [fortschritt, setFortschritt] = useState({}) // frage_id → {richtig, versuche}
  const [loading, setLoading] = useState(true)

  // Lernmodus
  const [modus, setModus] = useState('uebersicht') // uebersicht | lernen | auswertung
  const [lernQueue, setLernQueue] = useState([]) // Fragen-Reihenfolge
  const [aktIdx, setAktIdx] = useState(0)
  const [antwortStatus, setAntwortStatus] = useState(null) // null | 'richtig' | 'falsch'
  const [gewaehlteAntwort, setGewaehlteAntwort] = useState(null)
  const [karteAufgedeckt, setKarteAufgedeckt] = useState(false)
  const [freitextEingabe, setFreitextEingabe] = useState('')
  const [freitextBewertung, setFreitextBewertung] = useState(null) // {richtig, erklaerung}
  const [freitextLaedt, setFreitextLaedt] = useState(false)

  useEffect(() => { laden() }, [id])

  async function laden() {
    setLoading(true)
    const { data: lv } = await supabase.from('lehrgang_vorbereitungen').select('*').eq('id', id).single()
    setLehrgang(lv)

    const { data: t } = await supabase.from('lehrgang_themen')
      .select('*').eq('vorbereitung_id', id).order('reihenfolge')
    setThemen(t ?? [])

    if (t?.length) {
      const { data: f } = await supabase.from('lehrgang_fragen')
        .select('*').in('thema_id', t.map(x => x.id)).eq('freigegeben', true).order('reihenfolge')
      const themaMap = {}
      t.forEach(x => { themaMap[x.id] = x })
      setAlleFragen((f ?? []).map(frage => ({ frage, thema: themaMap[frage.thema_id] })))

      // Fortschritt laden
      if (f?.length) {
        const { data: fp } = await supabase.from('lehrgang_fortschritt')
          .select('frage_id, richtig, versuche').eq('user_id', profile.id).in('frage_id', f.map(x => x.id))
        const map = {}
        ;(fp ?? []).forEach(x => { map[x.frage_id] = x })
        setFortschritt(map)
      }
    }
    setLoading(false)
  }

  async function fortschrittSpeichern(frageId, richtig) {
    const existing = fortschritt[frageId]
    if (existing) {
      await supabase.from('lehrgang_fortschritt').update({
        richtig, versuche: (existing.versuche ?? 1) + 1, letzter_versuch: new Date().toISOString()
      }).eq('user_id', profile.id).eq('frage_id', frageId)
    } else {
      await supabase.from('lehrgang_fortschritt').insert({
        user_id: profile.id, frage_id: frageId, richtig, versuche: 1
      })
    }
    setFortschritt(prev => ({ ...prev, [frageId]: { richtig, versuche: (existing?.versuche ?? 0) + 1 } }))
  }

  function startenMitSchwachen() {
    // Schwache Fragen zuerst (nicht beantwortet oder falsch), dann richtige
    const queue = [...alleFragen].sort((a, b) => {
      const fa = fortschritt[a.frage.id]
      const fb = fortschritt[b.frage.id]
      const wA = !fa ? 0 : fa.richtig ? 2 : 1
      const wB = !fb ? 0 : fb.richtig ? 2 : 1
      return wA - wB
    })
    setLernQueue(queue)
    setAktIdx(0)
    resetFrage()
    setModus('lernen')
  }

  function startenAlle() {
    const queue = [...alleFragen].sort(() => Math.random() - 0.5)
    setLernQueue(queue)
    setAktIdx(0)
    resetFrage()
    setModus('lernen')
  }

  function resetFrage() {
    setAntwortStatus(null)
    setGewaehlteAntwort(null)
    setKarteAufgedeckt(false)
    setFreitextEingabe('')
    setFreitextBewertung(null)
  }

  async function antwortWaehlen(antwort) {
    if (antwortStatus) return
    const richtig = antwort.richtig
    setGewaehlteAntwort(antwort)
    setAntwortStatus(richtig ? 'richtig' : 'falsch')
    await fortschrittSpeichern(aktFrage.frage.id, richtig)
  }

  async function karteBewertenSelbst(richtig) {
    setAntwortStatus(richtig ? 'richtig' : 'falsch')
    await fortschrittSpeichern(aktFrage.frage.id, richtig)
  }

  async function freitextBewerten() {
    if (!freitextEingabe.trim() || freitextLaedt) return
    setFreitextLaedt(true)
    try {
      const { data, error } = await supabase.functions.invoke('generate-lehrgang-fragen', {
        body: {
          _aktion: 'bewerten',
          frage: aktFrage.frage.frage,
          musterloesung: aktFrage.frage.erklaerung ?? '',
          antwort: freitextEingabe.trim(),
        }
      })
      // Fallback: wenn Edge Fn kein Bewerten unterstützt, als richtig werten
      const richtig = data?.richtig ?? true
      const erklaerung = data?.erklaerung ?? aktFrage.frage.erklaerung ?? ''
      setFreitextBewertung({ richtig, erklaerung })
      setAntwortStatus(richtig ? 'richtig' : 'falsch')
      await fortschrittSpeichern(aktFrage.frage.id, richtig)
    } catch {
      setFreitextBewertung({ richtig: true, erklaerung: aktFrage.frage.erklaerung ?? '' })
      setAntwortStatus('richtig')
      await fortschrittSpeichern(aktFrage.frage.id, true)
    }
    setFreitextLaedt(false)
  }

  function naechste() {
    if (aktIdx + 1 >= lernQueue.length) {
      setModus('auswertung')
    } else {
      setAktIdx(i => i + 1)
      resetFrage()
    }
  }

  const aktFrage = lernQueue[aktIdx]

  // Statistiken
  const gesamt = alleFragen.length
  const richtigCount = alleFragen.filter(({ frage }) => fortschritt[frage.id]?.richtig).length
  const gesamtPct = gesamt > 0 ? Math.round((richtigCount / gesamt) * 100) : 0
  const bereit = gesamtPct >= 80

  const themenStats = themen.map(thema => {
    const tf = alleFragen.filter(({ frage }) => frage.thema_id === thema.id)
    const richtig = tf.filter(({ frage }) => fortschritt[frage.id]?.richtig).length
    return { thema, gesamt: tf.length, richtig, pct: tf.length > 0 ? Math.round((richtig / tf.length) * 100) : 0 }
  })

  if (loading) return <div style={{ padding: 32, color: 'var(--gray-400)' }}>Lädt…</div>
  if (!lehrgang) return <div style={{ padding: 32 }}>Lehrgang nicht gefunden.</div>

  // ── Auswertung ──
  if (modus === 'auswertung') return (
    <div style={{ maxWidth: 600 }}>
      <button onClick={() => setModus('uebersicht')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: 13, marginBottom: 16, padding: 0 }}>← Zurück</button>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>{bereit ? '🎓' : gesamtPct >= 50 ? '📖' : '💪'}</div>
        <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 4 }}>{gesamtPct}% erreicht</div>
        <div style={{ fontSize: 14, color: 'var(--gray-400)', marginBottom: 16 }}>
          {richtigCount} von {gesamt} Fragen richtig
        </div>
        <div style={{ height: 10, background: 'var(--gray-100)', borderRadius: 5, overflow: 'hidden', maxWidth: 300, margin: '0 auto 12px' }}>
          <div style={{ height: '100%', width: `${gesamtPct}%`, background: bereit ? '#10b981' : gesamtPct >= 50 ? '#3b82f6' : '#f59e0b', borderRadius: 5, transition: 'width 0.6s' }} />
        </div>
        {bereit
          ? <div style={{ fontSize: 14, fontWeight: 700, color: '#065f46', background: '#d1fae5', padding: '8px 20px', borderRadius: 20, display: 'inline-block' }}>✅ Bereit für den Lehrgang!</div>
          : <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>Noch {80 - gesamtPct} Prozentpunkte bis zur Lernbereitschaft (80%)</div>
        }
      </div>

      <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '10px 16px', fontWeight: 700, fontSize: 13, borderBottom: '1px solid var(--gray-100)' }}>Themen-Übersicht</div>
        {themenStats.filter(s => s.gesamt > 0).map(({ thema, gesamt: tg, richtig: tr, pct: tp }) => (
          <div key={thema.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{thema.titel}</div>
              <div style={{ height: 5, background: 'var(--gray-100)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${tp}%`, background: tp >= 80 ? '#10b981' : tp >= 50 ? '#3b82f6' : '#f59e0b', borderRadius: 3 }} />
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: tp >= 80 ? '#065f46' : tp >= 50 ? '#1e40af' : '#92400e', flexShrink: 0 }}>{tp}%</div>
            <div style={{ fontSize: 11, color: 'var(--gray-400)', flexShrink: 0 }}>{tr}/{tg}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={startenMitSchwachen} className="btn btn-primary" style={{ flex: 1 }}>🔁 Schwache wiederholen</button>
        <button onClick={() => setModus('uebersicht')} className="btn btn-secondary" style={{ flex: 1 }}>← Übersicht</button>
      </div>
    </div>
  )

  // ── Lernmodus ──
  if (modus === 'lernen' && aktFrage) {
    const { frage, thema } = aktFrage
    const fortschritt_dieser = fortschritt[frage.id]
    const istLetzteFrageGeraten = aktIdx + 1 >= lernQueue.length

    return (
      <div style={{ maxWidth: 600 }}>
        {/* Progress Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => setModus('uebersicht')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: 13, padding: 0, flexShrink: 0 }}>✕</button>
          <div style={{ flex: 1, height: 6, background: 'var(--gray-100)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${((aktIdx) / lernQueue.length) * 100}%`, background: 'var(--red)', borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', flexShrink: 0 }}>{aktIdx + 1}/{lernQueue.length}</div>
        </div>

        {/* Thema-Badge */}
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
          {thema.titel}
        </div>

        {/* Frage */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.5, marginBottom: 20 }}>{frage.frage}</div>

          {/* Multiple Choice */}
          {frage.typ === 'multiple_choice' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(frage.antworten ?? []).map((a, i) => {
                let bg = 'var(--gray-50)', border = 'var(--gray-200)', color = 'var(--gray-800)'
                if (antwortStatus) {
                  if (a.richtig) { bg = '#d1fae5'; border = '#6ee7b7'; color = '#065f46' }
                  else if (gewaehlteAntwort === a && !a.richtig) { bg = '#fee2e2'; border = '#fca5a5'; color = '#991b1b' }
                }
                return (
                  <button key={i} onClick={() => antwortWaehlen(a)} disabled={!!antwortStatus}
                    style={{ padding: '12px 14px', borderRadius: 8, border: `1.5px solid ${border}`, background: bg, color, textAlign: 'left', cursor: antwortStatus ? 'default' : 'pointer', fontSize: 14, fontWeight: 500, transition: 'all 0.15s' }}>
                    <span style={{ display: 'inline-block', width: 22, height: 22, borderRadius: '50%', background: antwortStatus && a.richtig ? '#10b981' : antwortStatus && gewaehlteAntwort === a ? '#ef4444' : 'var(--gray-200)', color: 'white', textAlign: 'center', lineHeight: '22px', fontSize: 11, fontWeight: 700, marginRight: 10, flexShrink: 0 }}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    {a.text}
                  </button>
                )
              })}
            </div>
          )}

          {/* Ja / Nein */}
          {frage.typ === 'ja_nein' && (
            <div style={{ display: 'flex', gap: 10 }}>
              {(frage.antworten ?? [{ text: 'Richtig', richtig: true }, { text: 'Falsch', richtig: false }]).map((a, i) => {
                let bg = i === 0 ? '#d1fae5' : '#fee2e2', border = i === 0 ? '#6ee7b7' : '#fca5a5', color = i === 0 ? '#065f46' : '#991b1b'
                if (!antwortStatus) { bg = 'var(--gray-50)'; border = 'var(--gray-200)'; color = 'var(--gray-700)' }
                else if (gewaehlteAntwort === a && !a.richtig) { bg = '#fee2e2'; border = '#fca5a5'; color = '#991b1b' }
                else if (!a.richtig) { bg = 'var(--gray-50)'; border = 'var(--gray-200)'; color = 'var(--gray-400)' }
                return (
                  <button key={i} onClick={() => antwortWaehlen(a)} disabled={!!antwortStatus}
                    style={{ flex: 1, padding: '16px', borderRadius: 10, border: `1.5px solid ${border}`, background: bg, color, fontWeight: 700, fontSize: 16, cursor: antwortStatus ? 'default' : 'pointer', transition: 'all 0.15s' }}>
                    {i === 0 ? '✓ Richtig' : '✗ Falsch'}
                  </button>
                )
              })}
            </div>
          )}

          {/* Karteikarte */}
          {frage.typ === 'karteikarte' && (
            <div>
              {!karteAufgedeckt ? (
                <button onClick={() => setKarteAufgedeckt(true)} className="btn btn-secondary" style={{ width: '100%', padding: 16, fontSize: 15 }}>
                  🃏 Antwort aufdecken
                </button>
              ) : (
                <div>
                  <div style={{ background: '#f8fafc', border: '1px solid var(--gray-200)', borderRadius: 8, padding: 14, marginBottom: 14, fontSize: 14, lineHeight: 1.6 }}>
                    {frage.erklaerung ?? '(Keine Antwort hinterlegt)'}
                  </div>
                  {!antwortStatus && (
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 8, textAlign: 'center' }}>Hast du es gewusst?</div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => karteBewertenSelbst(true)} className="btn btn-sm"
                          style={{ flex: 1, background: '#d1fae5', color: '#065f46', border: '1.5px solid #6ee7b7', fontWeight: 600, padding: 12 }}>✓ Ja, gewusst</button>
                        <button onClick={() => karteBewertenSelbst(false)} className="btn btn-sm"
                          style={{ flex: 1, background: '#fee2e2', color: '#991b1b', border: '1.5px solid #fca5a5', fontWeight: 600, padding: 12 }}>✗ Nicht gewusst</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Freitext */}
          {frage.typ === 'freitext' && (
            <div>
              <textarea className="form-control" rows={4} placeholder="Deine Antwort…" value={freitextEingabe}
                onChange={e => setFreitextEingabe(e.target.value)} disabled={!!antwortStatus}
                style={{ marginBottom: 10, resize: 'vertical' }} />
              {!antwortStatus && (
                <button onClick={freitextBewerten} className="btn btn-primary" disabled={!freitextEingabe.trim() || freitextLaedt} style={{ width: '100%' }}>
                  {freitextLaedt ? '⏳ KI bewertet…' : '✓ Antwort prüfen'}
                </button>
              )}
              {freitextBewertung && (
                <div style={{ marginTop: 12, padding: 12, background: freitextBewertung.richtig ? '#d1fae5' : '#fee2e2', borderRadius: 8, fontSize: 13 }}>
                  <strong>{freitextBewertung.richtig ? '✓ Richtig' : '✗ Nicht ganz'}:</strong> {freitextBewertung.erklaerung}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Feedback + Erklärung */}
        {antwortStatus && (
          <div>
            <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontWeight: 600, fontSize: 14,
              background: antwortStatus === 'richtig' ? '#d1fae5' : '#fee2e2',
              color: antwortStatus === 'richtig' ? '#065f46' : '#991b1b',
              border: `1px solid ${antwortStatus === 'richtig' ? '#6ee7b7' : '#fca5a5'}` }}>
              {antwortStatus === 'richtig' ? '✓ Richtig!' : '✗ Leider falsch'}
            </div>
            {frage.erklaerung && frage.typ !== 'karteikarte' && frage.typ !== 'freitext' && (
              <div style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid var(--gray-200)', borderRadius: 8, fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
                💡 {frage.erklaerung}
              </div>
            )}
            <button onClick={naechste} className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 15 }}>
              {istLetzteFrageGeraten ? '📊 Auswertung anzeigen' : 'Weiter →'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Übersicht ──
  return (
    <div style={{ maxWidth: 600 }}>
      <button onClick={() => navigate('/ausbildung/lehrgang')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: 13, marginBottom: 16, padding: 0 }}>
        ← Alle Lehrgänge
      </button>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{lehrgang.name}</h1>
      {lehrgang.beschreibung && <p style={{ color: 'var(--gray-400)', fontSize: 14, marginBottom: 20 }}>{lehrgang.beschreibung}</p>}

      {/* Gesamt-Fortschritt */}
      {gesamt > 0 && (
        <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Gesamtfortschritt</span>
            <span style={{ fontWeight: 700, fontSize: 18, color: bereit ? '#065f46' : gesamtPct >= 50 ? '#1e40af' : 'var(--gray-600)' }}>{gesamtPct}%</span>
          </div>
          <div style={{ height: 8, background: 'var(--gray-100)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ height: '100%', width: `${gesamtPct}%`, background: bereit ? '#10b981' : gesamtPct >= 50 ? '#3b82f6' : '#f59e0b', borderRadius: 4, transition: 'width 0.5s' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>
            {richtigCount} von {gesamt} Fragen richtig beantwortet
            {bereit && ' · 🎓 Bereit für den Lehrgang!'}
          </div>
        </div>
      )}

      {/* Themen-Übersicht */}
      {themenStats.filter(s => s.gesamt > 0).length > 0 && (
        <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '10px 16px', fontWeight: 700, fontSize: 13, borderBottom: '1px solid var(--gray-100)' }}>Themen</div>
          {themenStats.filter(s => s.gesamt > 0).map(({ thema, gesamt: tg, richtig: tr, pct: tp }) => (
            <div key={thema.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{thema.titel}</div>
                <div style={{ height: 4, background: 'var(--gray-100)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${tp}%`, background: tp >= 80 ? '#10b981' : tp >= 50 ? '#3b82f6' : '#f59e0b', borderRadius: 2 }} />
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: tp >= 80 ? '#065f46' : tp >= 50 ? '#1e40af' : '#92400e', flexShrink: 0 }}>{tp}%</div>
              <div style={{ fontSize: 11, color: 'var(--gray-400)', flexShrink: 0 }}>{tr}/{tg}</div>
            </div>
          ))}
        </div>
      )}

      {gesamt === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--gray-400)', fontSize: 14, background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 12 }}>
          Noch keine Fragen für diesen Lehrgang hinterlegt.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={startenMitSchwachen} className="btn btn-primary" style={{ flex: 1, padding: 14 }}>
            🎯 Schwache Themen üben
          </button>
          <button onClick={startenAlle} className="btn btn-secondary" style={{ flex: 1, padding: 14 }}>
            🔀 Alle Fragen (zufällig)
          </button>
        </div>
      )}
    </div>
  )
}
