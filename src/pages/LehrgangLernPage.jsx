import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function LehrgangLernPage() {
  const { id } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [lehrgang, setLehrgang] = useState(null)
  const [themen, setThemen] = useState([])
  const [alleFragen, setAlleFragen] = useState([])
  const [fortschritt, setFortschritt] = useState({})
  const [kiGuthaben, setKiGuthaben] = useState(null)
  const [loading, setLoading] = useState(true)

  // Lernmodus: uebersicht | lernen | ki-ausbildung | auswertung
  const [modus, setModus] = useState('uebersicht')
  const [lernQueue, setLernQueue] = useState([])
  const [aktIdx, setAktIdx] = useState(0)
  const [antwortStatus, setAntwortStatus] = useState(null)
  const [gewaehlteAntwort, setGewaehlteAntwort] = useState(null)
  const [karteAufgedeckt, setKarteAufgedeckt] = useState(false)
  const [freitextEingabe, setFreitextEingabe] = useState('')
  const [freitextBewertung, setFreitextBewertung] = useState(null)
  const [freitextLaedt, setFreitextLaedt] = useState(false)

  // KI-Ausbildungsmodus
  const [kiQueue, setKiQueue] = useState([])          // aktuelle Batch-Fragen
  const [kiAktIdx, setKiAktIdx] = useState(0)
  const [kiLaedt, setKiLaedt] = useState(false)
  const [kiGuthabenRest, setKiGuthabenRest] = useState(null)
  const [kiFragenGestellt, setKiFragenGestellt] = useState([]) // Fragetexte dieser Session
  const [kiRichtig, setKiRichtig] = useState(0)
  const [kiFalsch, setKiFalsch] = useState(0)
  const [kiAntwortStatus, setKiAntwortStatus] = useState(null)
  const [kiGewaehlteAntwort, setKiGewaehlteAntwort] = useState(null)
  const [kiKarteAufgedeckt, setKiKarteAufgedeckt] = useState(false)
  const [kiFreitextEingabe, setKiFreitextEingabe] = useState('')
  const [kiFreitextBewertung, setKiFreitextBewertung] = useState(null)
  const [kiFreitextLaedt, setKiFreitextLaedt] = useState(false)
  const [kiFehler, setKiFehler] = useState('')
  const kiFragenGestelRef = useRef([])

  useEffect(() => { laden() }, [id])

  async function laden() {
    setLoading(true)
    const [lvRes, tRes, guthabenRes] = await Promise.all([
      supabase.from('lehrgang_vorbereitungen').select('*').eq('id', id).single(),
      supabase.from('lehrgang_themen').select('*').eq('vorbereitung_id', id).order('reihenfolge'),
      supabase.from('profiles').select('ki_guthaben_cent').eq('id', profile.id).single(),
    ])
    setLehrgang(lvRes.data)
    setKiGuthaben(guthabenRes.data?.ki_guthaben_cent ?? 0)
    const t = tRes.data ?? []
    setThemen(t)

    if (t.length) {
      const { data: f } = await supabase.from('lehrgang_fragen')
        .select('*').in('thema_id', t.map(x => x.id)).eq('freigegeben', true).order('reihenfolge')
      const themaMap = {}
      t.forEach(x => { themaMap[x.id] = x })
      setAlleFragen((f ?? []).map(frage => ({ frage, thema: themaMap[frage.thema_id] })))
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
      await supabase.from('lehrgang_fortschritt').insert({ user_id: profile.id, frage_id: frageId, richtig, versuche: 1 })
    }
    setFortschritt(prev => ({ ...prev, [frageId]: { richtig, versuche: (existing?.versuche ?? 0) + 1 } }))
  }

  function startenMitSchwachen() {
    const queue = [...alleFragen].sort((a, b) => {
      const wA = !fortschritt[a.frage.id] ? 0 : fortschritt[a.frage.id].richtig ? 2 : 1
      const wB = !fortschritt[b.frage.id] ? 0 : fortschritt[b.frage.id].richtig ? 2 : 1
      return wA - wB
    })
    setLernQueue(queue); setAktIdx(0); resetFrage(); setModus('lernen')
  }

  function startenAlle() {
    setLernQueue([...alleFragen].sort(() => Math.random() - 0.5))
    setAktIdx(0); resetFrage(); setModus('lernen')
  }

  function resetFrage() {
    setAntwortStatus(null); setGewaehlteAntwort(null)
    setKarteAufgedeckt(false); setFreitextEingabe(''); setFreitextBewertung(null)
  }

  function resetKiFrage() {
    setKiAntwortStatus(null); setKiGewaehlteAntwort(null)
    setKiKarteAufgedeckt(false); setKiFreitextEingabe(''); setKiFreitextBewertung(null)
  }

  async function antwortWaehlen(antwort) {
    if (antwortStatus) return
    setGewaehlteAntwort(antwort); setAntwortStatus(antwort.richtig ? 'richtig' : 'falsch')
    await fortschrittSpeichern(aktFrage.frage.id, antwort.richtig)
  }

  async function karteBewertenSelbst(richtig) {
    setAntwortStatus(richtig ? 'richtig' : 'falsch')
    await fortschrittSpeichern(aktFrage.frage.id, richtig)
  }

  async function freitextBewerten() {
    if (!freitextEingabe.trim() || freitextLaedt) return
    setFreitextLaedt(true)
    try {
      const { data } = await supabase.functions.invoke('generate-lehrgang-fragen', {
        body: { _aktion: 'bewerten', frage: aktFrage.frage.frage, musterloesung: aktFrage.frage.erklaerung ?? '', antwort: freitextEingabe.trim() }
      })
      const richtig = data?.richtig ?? true
      setFreitextBewertung({ richtig, erklaerung: data?.erklaerung ?? aktFrage.frage.erklaerung ?? '' })
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
    if (aktIdx + 1 >= lernQueue.length) setModus('auswertung')
    else { setAktIdx(i => i + 1); resetFrage() }
  }

  // ── KI-Ausbildung ────────────────────────────────────────────────────────

  async function kiAusbildungStarten() {
    setKiRichtig(0); setKiFalsch(0)
    setKiFragenGestellt([]); kiFragenGestelRef.current = []
    setKiFehler('')
    setModus('ki-ausbildung')
    await kiNaechsterBatch([])
  }

  async function kiNaechsterBatch(bereitsGestellt) {
    setKiLaedt(true); setKiFehler('')
    try {
      // Schwächenprofil aus statischem Fortschritt ableiten
      const schwaechen = themenStats
        .filter(s => s.gesamt > 0)
        .sort((a, b) => a.pct - b.pct)
        .map(s => ({ thema: s.thema.titel, pct: s.pct }))

      // Regelwerke laden
      const { data: rw } = await supabase.from('regelwerke')
        .select('titel,inhalt_text').eq('aktiv', true).not('inhalt_text', 'is', null).limit(4)
      const regelwerkTexte = (rw ?? []).map(r => r.inhalt_text?.slice(0, 3000) ?? '').filter(Boolean)

      const { data, error } = await supabase.functions.invoke('lehrgang-ki-ausbildung', {
        body: {
          user_id: profile.id,
          lehrgang_name: lehrgang.name,
          schwaechen,
          regelwerk_texte: regelwerkTexte,
          bereits_gestellt: bereitsGestellt,
        }
      })

      if (data?.error === 'KEIN_GUTHABEN') {
        setKiFehler('Kein KI-Guthaben mehr vorhanden. Bitte beim Admin aufladen lassen.')
        setKiLaedt(false); return
      }
      if (error || data?.error) throw new Error(data?.error ?? error?.message)

      setKiQueue(data.fragen ?? [])
      setKiAktIdx(0)
      setKiGuthabenRest(data.guthaben_rest_cent)
      setKiGuthaben(data.guthaben_rest_cent)
      resetKiFrage()
    } catch (e) {
      setKiFehler('Fehler: ' + e.message)
    }
    setKiLaedt(false)
  }

  async function kiAntwortWaehlen(antwort) {
    if (kiAntwortStatus) return
    setKiGewaehlteAntwort(antwort)
    setKiAntwortStatus(antwort.richtig ? 'richtig' : 'falsch')
    if (antwort.richtig) setKiRichtig(r => r + 1); else setKiFalsch(f => f + 1)
  }

  async function kiKarteBewertenSelbst(richtig) {
    setKiAntwortStatus(richtig ? 'richtig' : 'falsch')
    if (richtig) setKiRichtig(r => r + 1); else setKiFalsch(f => f + 1)
  }

  async function kiFreitextBewerten() {
    if (!kiFreitextEingabe.trim() || kiFreitextLaedt) return
    setKiFreitextLaedt(true)
    const aktKiFrage = kiQueue[kiAktIdx]
    try {
      const { data } = await supabase.functions.invoke('generate-lehrgang-fragen', {
        body: { _aktion: 'bewerten', frage: aktKiFrage.frage, musterloesung: aktKiFrage.erklaerung ?? '', antwort: kiFreitextEingabe.trim() }
      })
      const richtig = data?.richtig ?? true
      setKiFreitextBewertung({ richtig, erklaerung: data?.erklaerung ?? aktKiFrage.erklaerung ?? '' })
      setKiAntwortStatus(richtig ? 'richtig' : 'falsch')
      if (richtig) setKiRichtig(r => r + 1); else setKiFalsch(f => f + 1)
    } catch {
      setKiFreitextBewertung({ richtig: true, erklaerung: kiQueue[kiAktIdx]?.erklaerung ?? '' })
      setKiAntwortStatus('richtig'); setKiRichtig(r => r + 1)
    }
    setKiFreitextLaedt(false)
  }

  function kiNaechste() {
    const aktKiFrage = kiQueue[kiAktIdx]
    if (aktKiFrage) {
      const neu = [...kiFragenGestelRef.current, aktKiFrage.frage]
      kiFragenGestelRef.current = neu
      setKiFragenGestellt(neu)
    }
    if (kiAktIdx + 1 >= kiQueue.length) {
      // Neuer Batch laden
      kiNaechsterBatch(kiFragenGestelRef.current)
    } else {
      setKiAktIdx(i => i + 1)
      resetKiFrage()
    }
  }

  const aktFrage = lernQueue[aktIdx]
  const aktKiFrage = kiQueue[kiAktIdx]
  const gesamt = alleFragen.length
  const richtigCount = alleFragen.filter(({ frage }) => fortschritt[frage.id]?.richtig).length
  const gesamtPct = gesamt > 0 ? Math.round((richtigCount / gesamt) * 100) : 0
  const bereit = gesamtPct >= 80
  const themenStats = themen.map(thema => {
    const tf = alleFragen.filter(({ frage }) => frage.thema_id === thema.id)
    const richtig = tf.filter(({ frage }) => fortschritt[frage.id]?.richtig).length
    return { thema, gesamt: tf.length, richtig, pct: tf.length > 0 ? Math.round((richtig / tf.length) * 100) : 0 }
  })
  const hatGuthaben = kiGuthaben !== null && kiGuthaben > 0

  if (loading) return <div style={{ padding: 32, color: 'var(--gray-400)' }}>Lädt…</div>
  if (!lehrgang) return <div style={{ padding: 32 }}>Lehrgang nicht gefunden.</div>

  // ── KI-Ausbildungsmodus ──────────────────────────────────────────────────
  if (modus === 'ki-ausbildung') {
    const kiGesamtBeantwortet = kiRichtig + kiFalsch
    const kiPct = kiGesamtBeantwortet > 0 ? Math.round((kiRichtig / kiGesamtBeantwortet) * 100) : null

    if (kiFehler) return (
      <div style={{ maxWidth: 600 }}>
        <button onClick={() => setModus('uebersicht')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: 13, marginBottom: 16, padding: 0 }}>← Zurück</button>
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 12, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{kiFehler}</div>
          <button onClick={() => setModus('uebersicht')} className="btn btn-secondary" style={{ marginTop: 12 }}>Zurück zur Übersicht</button>
        </div>
      </div>
    )

    if (kiLaedt || !aktKiFrage) return (
      <div style={{ maxWidth: 600 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => setModus('uebersicht')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: 13, padding: 0 }}>✕</button>
          <div style={{ flex: 1, fontSize: 13, color: 'var(--gray-400)' }}>KI-Ausbildung · {lehrgang.name}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #4c1d95, #7c3aed)', borderRadius: 12, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✨</div>
          <div style={{ color: 'white', fontWeight: 600, fontSize: 15, marginBottom: 6 }}>KI generiert nächste Fragen…</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Angepasst an dein Schwächenprofil</div>
        </div>
      </div>
    )

    return (
      <div style={{ maxWidth: 600 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button onClick={() => setModus('uebersicht')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: 13, padding: 0, flexShrink: 0 }}>✕</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>🤖 KI-Ausbildung · {lehrgang.name}</div>
          </div>
          {/* Session-Statistik */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {kiGesamtBeantwortet > 0 && (
              <>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#065f46' }}>✓ {kiRichtig}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#991b1b' }}>✗ {kiFalsch}</span>
              </>
            )}
            {/* Guthaben */}
            {kiGuthabenRest !== null && (
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 600,
                background: kiGuthabenRest < 20 ? '#fef3c7' : '#d1fae5',
                color: kiGuthabenRest < 20 ? '#92400e' : '#065f46' }}>
                💳 {(kiGuthabenRest / 100).toFixed(2).replace('.', ',')} €
              </span>
            )}
          </div>
        </div>

        {/* Thema-Badge */}
        {aktKiFrage.thema && (
          <div style={{ fontSize: 11, fontWeight: 600, color: '#7c3aed', background: '#ede9fe', padding: '3px 10px', borderRadius: 12, display: 'inline-block', marginBottom: 12 }}>
            ✨ {aktKiFrage.thema}
          </div>
        )}

        {/* Frage-Karte */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.5, marginBottom: 20 }}>{aktKiFrage.frage}</div>

          {aktKiFrage.typ === 'multiple_choice' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(aktKiFrage.antworten ?? []).map((a, i) => {
                let bg = 'var(--gray-50)', border = 'var(--gray-200)', color = 'var(--gray-800)'
                if (kiAntwortStatus) {
                  if (a.richtig) { bg = '#d1fae5'; border = '#6ee7b7'; color = '#065f46' }
                  else if (kiGewaehlteAntwort === a) { bg = '#fee2e2'; border = '#fca5a5'; color = '#991b1b' }
                }
                return (
                  <button key={i} onClick={() => kiAntwortWaehlen(a)} disabled={!!kiAntwortStatus}
                    style={{ padding: '12px 14px', borderRadius: 8, border: `1.5px solid ${border}`, background: bg, color, textAlign: 'left', cursor: kiAntwortStatus ? 'default' : 'pointer', fontSize: 14, fontWeight: 500 }}>
                    <span style={{ display: 'inline-block', width: 22, height: 22, borderRadius: '50%', background: kiAntwortStatus && a.richtig ? '#10b981' : kiAntwortStatus && kiGewaehlteAntwort === a ? '#ef4444' : 'var(--gray-200)', color: 'white', textAlign: 'center', lineHeight: '22px', fontSize: 11, fontWeight: 700, marginRight: 10 }}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    {a.text}
                  </button>
                )
              })}
            </div>
          )}

          {aktKiFrage.typ === 'ja_nein' && (
            <div style={{ display: 'flex', gap: 10 }}>
              {[{ text: 'Richtig', richtig: true }, { text: 'Falsch', richtig: false }].map((a, i) => {
                let bg = 'var(--gray-50)', border = 'var(--gray-200)', color = 'var(--gray-700)'
                if (kiAntwortStatus) {
                  if (a.richtig && (aktKiFrage.antworten?.[0]?.richtig ?? true)) { bg = '#d1fae5'; border = '#6ee7b7'; color = '#065f46' }
                  else if (!a.richtig && !(aktKiFrage.antworten?.[0]?.richtig ?? true)) { bg = '#d1fae5'; border = '#6ee7b7'; color = '#065f46' }
                  if (kiGewaehlteAntwort?.text === a.text && kiAntwortStatus === 'falsch') { bg = '#fee2e2'; border = '#fca5a5'; color = '#991b1b' }
                }
                // Welche Antwort ist wirklich richtig?
                const istRichtig = (aktKiFrage.antworten ?? [{ text: 'Richtig', richtig: true }]).find(x => x.richtig)?.text === a.text
                const antwortObj = { text: a.text, richtig: istRichtig }
                return (
                  <button key={i} onClick={() => kiAntwortWaehlen(antwortObj)} disabled={!!kiAntwortStatus}
                    style={{ flex: 1, padding: 16, borderRadius: 10, border: `1.5px solid ${border}`, background: bg, color, fontWeight: 700, fontSize: 16, cursor: kiAntwortStatus ? 'default' : 'pointer' }}>
                    {i === 0 ? '✓ Richtig' : '✗ Falsch'}
                  </button>
                )
              })}
            </div>
          )}

          {aktKiFrage.typ === 'karteikarte' && (
            <div>
              {!kiKarteAufgedeckt ? (
                <button onClick={() => setKiKarteAufgedeckt(true)} className="btn btn-secondary" style={{ width: '100%', padding: 16, fontSize: 15 }}>🃏 Antwort aufdecken</button>
              ) : (
                <div>
                  <div style={{ background: '#f8fafc', border: '1px solid var(--gray-200)', borderRadius: 8, padding: 14, marginBottom: 14, fontSize: 14, lineHeight: 1.6 }}>
                    {aktKiFrage.erklaerung ?? '(Keine Antwort hinterlegt)'}
                  </div>
                  {!kiAntwortStatus && (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => kiKarteBewertenSelbst(true)} className="btn btn-sm" style={{ flex: 1, background: '#d1fae5', color: '#065f46', border: '1.5px solid #6ee7b7', fontWeight: 600, padding: 12 }}>✓ Gewusst</button>
                      <button onClick={() => kiKarteBewertenSelbst(false)} className="btn btn-sm" style={{ flex: 1, background: '#fee2e2', color: '#991b1b', border: '1.5px solid #fca5a5', fontWeight: 600, padding: 12 }}>✗ Nicht gewusst</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {aktKiFrage.typ === 'freitext' && (
            <div>
              <textarea className="form-control" rows={4} placeholder="Deine Antwort…" value={kiFreitextEingabe}
                onChange={e => setKiFreitextEingabe(e.target.value)} disabled={!!kiAntwortStatus} style={{ marginBottom: 10, resize: 'vertical' }} />
              {!kiAntwortStatus && (
                <button onClick={kiFreitextBewerten} className="btn btn-primary" disabled={!kiFreitextEingabe.trim() || kiFreitextLaedt} style={{ width: '100%' }}>
                  {kiFreitextLaedt ? '⏳ KI bewertet…' : '✓ Antwort prüfen'}
                </button>
              )}
              {kiFreitextBewertung && (
                <div style={{ marginTop: 12, padding: 12, background: kiFreitextBewertung.richtig ? '#d1fae5' : '#fee2e2', borderRadius: 8, fontSize: 13 }}>
                  <strong>{kiFreitextBewertung.richtig ? '✓ Richtig' : '✗ Nicht ganz'}:</strong> {kiFreitextBewertung.erklaerung}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Feedback + Weiter */}
        {kiAntwortStatus && (
          <div>
            <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontWeight: 600, fontSize: 14,
              background: kiAntwortStatus === 'richtig' ? '#d1fae5' : '#fee2e2',
              color: kiAntwortStatus === 'richtig' ? '#065f46' : '#991b1b',
              border: `1px solid ${kiAntwortStatus === 'richtig' ? '#6ee7b7' : '#fca5a5'}` }}>
              {kiAntwortStatus === 'richtig' ? '✓ Richtig!' : '✗ Leider falsch'}
            </div>
            {aktKiFrage.erklaerung && aktKiFrage.typ !== 'karteikarte' && aktKiFrage.typ !== 'freitext' && (
              <div style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid var(--gray-200)', borderRadius: 8, fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
                💡 {aktKiFrage.erklaerung}
              </div>
            )}
            <button onClick={kiNaechste} className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 15, background: '#7c3aed', border: 'none' }}>
              Weiter → <span style={{ fontSize: 11, opacity: 0.8, marginLeft: 8 }}>KI generiert nächste Frage angepasst an dich</span>
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Auswertung ──────────────────────────────────────────────────────────
  if (modus === 'auswertung') return (
    <div style={{ maxWidth: 600 }}>
      <button onClick={() => setModus('uebersicht')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: 13, marginBottom: 16, padding: 0 }}>← Zurück</button>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>{bereit ? '🎓' : gesamtPct >= 50 ? '📖' : '💪'}</div>
        <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 4 }}>{gesamtPct}% erreicht</div>
        <div style={{ fontSize: 14, color: 'var(--gray-400)', marginBottom: 16 }}>{richtigCount} von {gesamt} Fragen richtig</div>
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

  // ── Statischer Lernmodus ────────────────────────────────────────────────
  if (modus === 'lernen' && aktFrage) {
    const { frage, thema } = aktFrage
    return (
      <div style={{ maxWidth: 600 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => setModus('uebersicht')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: 13, padding: 0, flexShrink: 0 }}>✕</button>
          <div style={{ flex: 1, height: 6, background: 'var(--gray-100)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(aktIdx / lernQueue.length) * 100}%`, background: 'var(--red)', borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', flexShrink: 0 }}>{aktIdx + 1}/{lernQueue.length}</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>{thema.titel}</div>
        <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.5, marginBottom: 20 }}>{frage.frage}</div>
          {frage.typ === 'multiple_choice' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(frage.antworten ?? []).map((a, i) => {
                let bg = 'var(--gray-50)', border = 'var(--gray-200)', color = 'var(--gray-800)'
                if (antwortStatus) {
                  if (a.richtig) { bg = '#d1fae5'; border = '#6ee7b7'; color = '#065f46' }
                  else if (gewaehlteAntwort === a) { bg = '#fee2e2'; border = '#fca5a5'; color = '#991b1b' }
                }
                return (
                  <button key={i} onClick={() => antwortWaehlen(a)} disabled={!!antwortStatus}
                    style={{ padding: '12px 14px', borderRadius: 8, border: `1.5px solid ${border}`, background: bg, color, textAlign: 'left', cursor: antwortStatus ? 'default' : 'pointer', fontSize: 14, fontWeight: 500 }}>
                    <span style={{ display: 'inline-block', width: 22, height: 22, borderRadius: '50%', background: antwortStatus && a.richtig ? '#10b981' : antwortStatus && gewaehlteAntwort === a ? '#ef4444' : 'var(--gray-200)', color: 'white', textAlign: 'center', lineHeight: '22px', fontSize: 11, fontWeight: 700, marginRight: 10 }}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    {a.text}
                  </button>
                )
              })}
            </div>
          )}
          {frage.typ === 'ja_nein' && (
            <div style={{ display: 'flex', gap: 10 }}>
              {(frage.antworten ?? [{ text: 'Richtig', richtig: true }, { text: 'Falsch', richtig: false }]).map((a, i) => {
                let bg = 'var(--gray-50)', border = 'var(--gray-200)', color = 'var(--gray-700)'
                if (antwortStatus) {
                  if (a.richtig) { bg = '#d1fae5'; border = '#6ee7b7'; color = '#065f46' }
                  else if (gewaehlteAntwort === a) { bg = '#fee2e2'; border = '#fca5a5'; color = '#991b1b' }
                }
                return (
                  <button key={i} onClick={() => antwortWaehlen(a)} disabled={!!antwortStatus}
                    style={{ flex: 1, padding: 16, borderRadius: 10, border: `1.5px solid ${border}`, background: bg, color, fontWeight: 700, fontSize: 16, cursor: antwortStatus ? 'default' : 'pointer' }}>
                    {i === 0 ? '✓ Richtig' : '✗ Falsch'}
                  </button>
                )
              })}
            </div>
          )}
          {frage.typ === 'karteikarte' && (
            <div>
              {!karteAufgedeckt
                ? <button onClick={() => setKarteAufgedeckt(true)} className="btn btn-secondary" style={{ width: '100%', padding: 16, fontSize: 15 }}>🃏 Antwort aufdecken</button>
                : <div>
                    <div style={{ background: '#f8fafc', border: '1px solid var(--gray-200)', borderRadius: 8, padding: 14, marginBottom: 14, fontSize: 14, lineHeight: 1.6 }}>{frage.erklaerung}</div>
                    {!antwortStatus && (
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => karteBewertenSelbst(true)} className="btn btn-sm" style={{ flex: 1, background: '#d1fae5', color: '#065f46', border: '1.5px solid #6ee7b7', fontWeight: 600, padding: 12 }}>✓ Gewusst</button>
                        <button onClick={() => karteBewertenSelbst(false)} className="btn btn-sm" style={{ flex: 1, background: '#fee2e2', color: '#991b1b', border: '1.5px solid #fca5a5', fontWeight: 600, padding: 12 }}>✗ Nicht gewusst</button>
                      </div>
                    )}
                  </div>
              }
            </div>
          )}
          {frage.typ === 'freitext' && (
            <div>
              <textarea className="form-control" rows={4} placeholder="Deine Antwort…" value={freitextEingabe}
                onChange={e => setFreitextEingabe(e.target.value)} disabled={!!antwortStatus} style={{ marginBottom: 10, resize: 'vertical' }} />
              {!antwortStatus && <button onClick={freitextBewerten} className="btn btn-primary" disabled={!freitextEingabe.trim() || freitextLaedt} style={{ width: '100%' }}>{freitextLaedt ? '⏳ KI bewertet…' : '✓ Prüfen'}</button>}
              {freitextBewertung && <div style={{ marginTop: 12, padding: 12, background: freitextBewertung.richtig ? '#d1fae5' : '#fee2e2', borderRadius: 8, fontSize: 13 }}><strong>{freitextBewertung.richtig ? '✓ Richtig' : '✗ Nicht ganz'}:</strong> {freitextBewertung.erklaerung}</div>}
            </div>
          )}
        </div>
        {antwortStatus && (
          <div>
            <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontWeight: 600, fontSize: 14, background: antwortStatus === 'richtig' ? '#d1fae5' : '#fee2e2', color: antwortStatus === 'richtig' ? '#065f46' : '#991b1b', border: `1px solid ${antwortStatus === 'richtig' ? '#6ee7b7' : '#fca5a5'}` }}>
              {antwortStatus === 'richtig' ? '✓ Richtig!' : '✗ Leider falsch'}
            </div>
            {frage.erklaerung && frage.typ !== 'karteikarte' && frage.typ !== 'freitext' && (
              <div style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid var(--gray-200)', borderRadius: 8, fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>💡 {frage.erklaerung}</div>
            )}
            <button onClick={naechste} className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 15 }}>
              {aktIdx + 1 >= lernQueue.length ? '📊 Auswertung anzeigen' : 'Weiter →'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Übersicht ───────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 600 }}>
      <button onClick={() => navigate('/ausbildung/lehrgang')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: 13, marginBottom: 16, padding: 0 }}>← Alle Lehrgänge</button>
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
            {richtigCount} von {gesamt} Fragen richtig{bereit && ' · 🎓 Bereit für den Lehrgang!'}
          </div>
        </div>
      )}

      {/* Themen */}
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
          Noch keine Fragen hinterlegt.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={startenMitSchwachen} className="btn btn-primary" style={{ flex: 1, padding: 14 }}>🎯 Schwache Themen üben</button>
            <button onClick={startenAlle} className="btn btn-secondary" style={{ flex: 1, padding: 14 }}>🔀 Alle (zufällig)</button>
          </div>

          {/* KI-Ausbildung */}
          <div style={{
            background: hatGuthaben ? 'linear-gradient(135deg, #4c1d95, #7c3aed)' : 'var(--gray-100)',
            borderRadius: 12, padding: '14px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            opacity: hatGuthaben ? 1 : 0.7,
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: hatGuthaben ? 'white' : 'var(--gray-500)', marginBottom: 2 }}>🤖 KI-Ausbildung (adaptiv)</div>
              <div style={{ fontSize: 12, color: hatGuthaben ? 'rgba(255,255,255,0.75)' : 'var(--gray-400)' }}>
                {hatGuthaben
                  ? 'Unbegrenzte Fragen · angepasst an deine Schwächen · KI bewertet live'
                  : 'Kein KI-Guthaben — bitte beim Admin aufladen lassen'}
              </div>
              {hatGuthaben && kiGuthaben !== null && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
                  💳 Guthaben: {(kiGuthaben / 100).toFixed(2).replace('.', ',')} €
                </div>
              )}
            </div>
            <button
              onClick={hatGuthaben ? kiAusbildungStarten : undefined}
              disabled={!hatGuthaben}
              className="btn btn-sm"
              style={{
                background: hatGuthaben ? 'rgba(255,255,255,0.2)' : 'var(--gray-200)',
                color: hatGuthaben ? 'white' : 'var(--gray-400)',
                border: hatGuthaben ? '1px solid rgba(255,255,255,0.3)' : 'none',
                fontWeight: 600, padding: '8px 16px', flexShrink: 0, cursor: hatGuthaben ? 'pointer' : 'not-allowed',
              }}>
              {hatGuthaben ? 'Starten' : 'Gesperrt'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
