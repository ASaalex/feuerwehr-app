import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

export default function PruefungenPage() {
  const { profile, isAusbilder, isAdmin } = useAuth()
  const isWehrleiter = profile?.rolle === 'wehrleiter'
  const [pruefungen, setPruefungen] = useState([])
  const [ergebnisse, setErgebnisse] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('liste')
  const [selected, setSelected] = useState(null)
  const [importFehler, setImportFehler] = useState('')
  const [promptModal, setPromptModal] = useState(false)
  const [promptKopiert, setPromptKopiert] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const [{ data: p }, { data: e }, { data: gbmProfile }] = await Promise.all([
      supabase.from('pruefungen')
        .select('*, erstellt_von:profiles(id,vorname,nachname,rolle)')
        .order('erstellt_am', { ascending: false }),
      supabase.from('pruefungs_ergebnisse')
        .select('*')
        .eq('kamerad_id', profile.id)
        .order('abgelegt_am', { ascending: false }),
      supabase.from('profiles')
        .select('id')
        .eq('rolle', 'gemeindebrandmeister')
        .eq('status', 'aktiv'),
    ])

    const gbmIds = (gbmProfile ?? []).map(x => x.id)
    const alle = p ?? []
    const jetzt = new Date()

    function istAktivJetzt(pr) {
      if (pr.aktiv_von || pr.aktiv_bis) {
        const vonOk = !pr.aktiv_von || new Date(pr.aktiv_von) <= jetzt
        const bisOk = !pr.aktiv_bis || new Date(pr.aktiv_bis) >= jetzt
        return vonOk && bisOk
      }
      return pr.aktiv
    }

    let sichtbar = []
    if (profile.rolle === 'gemeindebrandmeister') {
      sichtbar = alle
    } else if (isWehrleiter) {
      sichtbar = alle.filter(pr => pr.wehr_id === profile.wehr_id || gbmIds.includes(pr.erstellt_von?.id))
    } else if (isAusbilder) {
      sichtbar = alle.filter(pr => pr.wehr_id === profile.wehr_id || gbmIds.includes(pr.erstellt_von?.id))
    } else {
      sichtbar = alle.filter(pr => {
        if (!istAktivJetzt(pr)) return false
        if (!pr.sichtbar_fuer_wehren) return true
        if (!profile.wehr_id) return false
        return pr.sichtbar_fuer_wehren.includes(profile.wehr_id)
      })
    }

    setPruefungen(sichtbar)
    setErgebnisse(e ?? [])
    setLoading(false)
  }

  async function handleLoeschen(p) {
    if (!confirm(`Pruefung "${p.titel}" wirklich loeschen? Alle Ergebnisse werden ebenfalls geloescht.`)) return
    await supabase.from('pruefungs_ergebnisse').delete().eq('pruefung_id', p.id)
    await supabase.from('fragen').delete().eq('pruefung_id', p.id)
    await supabase.from('pruefungen').delete().eq('id', p.id)
    fetchData()
  }

  function hatAbgelegt(id) {
    const alle = ergebnisse.filter(e => e.pruefung_id === id)
    if (alle.length === 0) return null
    return alle.sort((a, b) => new Date(b.abgelegt_am) - new Date(a.abgelegt_am))[0]
  }

  function handleImport(e) {
    const datei = e.target.files[0]
    if (!datei) return
    setImportFehler('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target.result)
        if (!json.titel) throw new Error('Feld "titel" fehlt')
        if (!Array.isArray(json.fragen) || json.fragen.length === 0) throw new Error('Keine Fragen gefunden')
        json.fragen.forEach((f, i) => {
          if (!f.frage_text) throw new Error(`Frage ${i+1}: "frage_text" fehlt`)
          if (!f.typ) throw new Error(`Frage ${i+1}: "typ" fehlt`)
          if (f.typ === 'freitext') {
            if (!f.musterloesung) throw new Error(`Frage ${i+1}: "musterloesung" fehlt (Pflichtfeld bei Freitext)`)
          } else {
            if (!Array.isArray(f.antworten)) throw new Error(`Frage ${i+1}: "antworten" fehlt`)
          }
        })
        setSelected({ _import: true, ...json })
        setView('erstellen')
      } catch (err) {
        setImportFehler('Ungueltige JSON-Datei: ' + err.message)
      }
    }
    reader.readAsText(datei)
    e.target.value = ''
  }

  const promptText = `Erstelle eine Lernkontrolle zum Thema [THEMA] für die Feuerwehr.
Die Prüfung soll [ANZAHL] Fragen enthalten. Mische verschiedene Fragetypen.
Gib ausschließlich den JSON-Code zurück, ohne Erklärungen oder Markdown.

Es gibt vier Fragetypen:
- "multiple_choice"  → genau 1 richtige Antwort (2–5 Antwortoptionen)
- "mehrfachauswahl"  → 1 bis 4 richtige Antworten (2–5 Antwortoptionen)
- "wahr_falsch"      → genau 2 Antworten: "Wahr" und "Falsch"
- "freitext"         → offene Frage, kein "antworten"-Array, stattdessen "musterloesung" als Text

{
  "titel": "[Titel der Prüfung]",
  "beschreibung": "[Kurze Beschreibung]",
  "bestehens_prozent": 70,
  "sofortfeedback": false,
  "fragen": [
    {
      "frage_text": "[Frage mit einer richtigen Antwort]",
      "typ": "multiple_choice",
      "punkte": 1,
      "antworten": [
        { "text": "[Antwort A]", "richtig": true },
        { "text": "[Antwort B]", "richtig": false },
        { "text": "[Antwort C]", "richtig": false },
        { "text": "[Antwort D]", "richtig": false }
      ]
    },
    {
      "frage_text": "[Frage mit mehreren richtigen Antworten]",
      "typ": "mehrfachauswahl",
      "punkte": 1,
      "antworten": [
        { "text": "[Antwort A]", "richtig": true },
        { "text": "[Antwort B]", "richtig": false },
        { "text": "[Antwort C]", "richtig": true },
        { "text": "[Antwort D]", "richtig": false }
      ]
    },
    {
      "frage_text": "[Aussage, die wahr oder falsch ist]",
      "typ": "wahr_falsch",
      "punkte": 1,
      "antworten": [
        { "text": "Wahr", "richtig": true },
        { "text": "Falsch", "richtig": false }
      ]
    },
    {
      "frage_text": "[Offene Frage, die der Kamerad selbst beantwortet]",
      "typ": "freitext",
      "punkte": 1,
      "musterloesung": "[Vollständige Musterlösung, anhand derer die KI die Antwort bewertet]"
    }
  ]
}`

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>
  if (view === 'erstellen') return <PruefungErstellen profile={profile} importDaten={selected?._import ? selected : null} onBack={() => { setSelected(null); setView('liste'); fetchData() }} />
  if (view === 'bearbeiten' && selected) return <PruefungBearbeiten pruefung={selected} profile={profile} onBack={() => { setView('liste'); fetchData() }} />
  if (view === 'ablegen' && selected) return <PruefungAblegen pruefung={selected} profile={profile} onBack={() => { setView('liste'); fetchData() }} />
  if (view === 'auswertung' && selected) return <PruefungAuswertung pruefung={selected} onBack={() => setView('liste')} />
  if (view === 'ergebnis_detail' && selected) return <ErgebnisDetail pruefung={selected.pruefung} ergebnis={selected.ergebnis} onBack={() => setView('liste')} />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Pruefungen</h1>
          <p style={{ marginTop: 4 }}>{pruefungen.filter(p => p.aktiv).length} aktive Pruefungen</p>
        </div>
        {isAusbilder && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => setPromptModal(true)}>✦ KI-Prompt</button>
            <label className="btn btn-secondary" style={{ cursor: 'pointer', marginBottom: 0 }}>
              ↑ JSON importieren
              <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
            </label>
            <button className="btn btn-primary" onClick={() => { setSelected(null); setView('erstellen') }}>+ Neue Pruefung</button>
          </div>
        )}
      </div>

      {importFehler && <div className="alert alert-error" style={{ marginBottom: 16 }}>{importFehler}</div>}

      {pruefungen.length === 0 ? (
        <div className="empty-state card">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          <p>Noch keine Pruefungen vorhanden</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pruefungen.map(p => {
            const ergebnis = hatAbgelegt(p.id)
            return (
              <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 500, fontSize: 15, color: 'var(--gray-700)' }}>{p.titel}</span>
                    {(() => {
                      const jetzt = new Date()
                      if (p.aktiv_von || p.aktiv_bis) {
                        const vonOk = !p.aktiv_von || new Date(p.aktiv_von) <= jetzt
                        const bisOk = !p.aktiv_bis || new Date(p.aktiv_bis) >= jetzt
                        const laeuft = vonOk && bisOk
                        return <span className={`badge badge-${laeuft ? 'green' : 'gray'}`}>{laeuft ? 'Aktiv (Zeitraum)' : 'Ausserhalb Zeitraum'}</span>
                      }
                      return p.aktiv ? <span className="badge badge-green">Aktiv</span> : <span className="badge badge-gray">Inaktiv</span>
                    })()}
                    {p.sofortfeedback && <span className="badge badge-amber" style={{ fontSize: 11 }}>Sofortfeedback</span>}
                    {p.sichtbar_fuer_wehren && <span className="badge badge-amber" style={{ fontSize: 11 }}>Bestimmte Wachen</span>}
                  </div>
                  {p.beschreibung && <p style={{ fontSize: 13, color: 'var(--gray-400)' }}>{p.beschreibung}</p>}
                  <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                    {p.erstellt_von?.vorname} {p.erstellt_von?.nachname} · {format(new Date(p.erstellt_am), 'd. MMM yyyy', { locale: de })} · Bestehen: {p.bestehens_prozent}%
                  </p>
                  {(p.aktiv_von || p.aktiv_bis) && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                      {p.aktiv_von && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#E1F5EE', color: '#085041' }}>Von: {format(new Date(p.aktiv_von), 'd. MMM yyyy HH:mm', { locale: de })}</span>}
                      {p.aktiv_bis && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#FAEEDA', color: '#633806' }}>Bis: {format(new Date(p.aktiv_bis), 'd. MMM yyyy HH:mm', { locale: de })}</span>}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {ergebnis && (
                    <>
                      <span className={`badge badge-${ergebnis.bestanden ? 'green' : 'red'}`} style={{ fontSize: 11, alignSelf: 'center' }}>
                        {ergebnis.bestanden ? `Bestanden ${Math.round(ergebnis.punkte_erreicht / ergebnis.punkte_gesamt * 100)}%` : 'Nicht bestanden'}
                      </span>
                      <button className="btn btn-sm btn-secondary" onClick={() => { setSelected({ pruefung: p, ergebnis }); setView('ergebnis_detail') }}>
                        Auswertung ansehen
                      </button>
                    </>
                  )}
                  {isAusbilder && (
                    <>
                      <button className="btn btn-sm btn-secondary" onClick={() => { setSelected(p); setView('auswertung') }}>Auswertung</button>
                      <button className="btn btn-sm btn-secondary" onClick={() => { setSelected(p); setView('bearbeiten') }}>Bearbeiten</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleLoeschen(p)}>Loeschen</button>
                      <WachenToggle pruefung={p} onToggle={fetchData} />
                      <AktivToggle pruefung={p} onToggle={fetchData} />
                    </>
                  )}
                  {p.aktiv && (
                    <button className="btn btn-sm btn-primary" onClick={() => { setSelected(p); setView('ablegen') }}>
                      {ergebnis ? 'Wiederholen' : 'Ablegen'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {promptModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setPromptModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3>KI-Prompt Vorlage</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setPromptModal(false)}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 16 }}>
              Kopiere diesen Prompt und füge ihn in ChatGPT, Claude oder ein anderes KI-Tool ein. Passe Thema und Anzahl der Fragen an. Die erzeugte JSON-Datei kannst du direkt über „JSON importieren" einlesen.
            </p>
            <div style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 10, padding: '14px 16px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--gray-700)', whiteSpace: 'pre-wrap', lineHeight: 1.6, userSelect: 'all', maxHeight: 320, overflowY: 'auto' }}>
              {promptText}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-primary" onClick={() => {
                navigator.clipboard.writeText(promptText)
                setPromptKopiert(true)
                setTimeout(() => setPromptKopiert(false), 2000)
              }}>
                {promptKopiert ? '✓ Kopiert!' : 'Prompt kopieren'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Speech Recognition Hook ────────────────────────────────────────────────

function useSpeechRecognition(onResult) {
  const [hoert, setHoert] = useState(false)
  const recRef = useRef(null)

  function starten() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Spracherkennung wird in diesem Browser nicht unterstützt.'); return }
    const rec = new SR()
    rec.lang = 'de-DE'
    rec.interimResults = false
    rec.onstart = () => setHoert(true)
    rec.onend = () => setHoert(false)
    rec.onresult = (e) => { onResult(e.results[0][0].transcript) }
    rec.onerror = () => setHoert(false)
    recRef.current = rec
    rec.start()
  }

  function stoppen() {
    recRef.current?.stop()
    setHoert(false)
  }

  return { hoert, starten, stoppen }
}

// ─── Freitext Input mit Mikrofon ─────────────────────────────────────────────

function FreitextEingabe({ value, onChange, disabled }) {
  const { hoert, starten, stoppen } = useSpeechRecognition((text) => {
    onChange(value ? value + ' ' + text : text)
  })

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Antwort eingeben..."
        rows={4}
        style={{ width: '100%', paddingRight: 48, resize: 'vertical', boxSizing: 'border-box' }}
      />
      <button
        type="button"
        onClick={hoert ? stoppen : starten}
        disabled={disabled}
        title={hoert ? 'Aufnahme stoppen' : 'Antwort sprechen'}
        style={{
          position: 'absolute', right: 10, top: 10,
          width: 34, height: 34, borderRadius: '50%', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
          background: hoert ? 'var(--red)' : 'var(--gray-200)',
          color: hoert ? 'white' : 'var(--gray-600)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          animation: hoert ? 'pulse 1s infinite' : 'none',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  )
}

// ─── Feedback-Anzeige ────────────────────────────────────────────────────────

function FeedbackBox({ feedback }) {
  const p = feedback.punkte ?? 0
  const farbe = p === 1 ? '#1E8449' : p === 0.5 ? '#B45309' : 'var(--red-dark)'
  const fbBg = p === 1 ? '#EAFAF1' : p === 0.5 ? '#FFFBEB' : 'var(--red-pale)'
  const fbBorder = p === 1 ? '#1E8449' : p === 0.5 ? '#FCD34D' : 'var(--red)'
  const icon = p === 1 ? '✅' : p === 0.5 ? '🟡' : '❌'
  const label = p === 1 ? 'Richtig!' : p === 0.5 ? 'Teilweise richtig' : 'Falsch'
  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${fbBorder}`, background: fbBg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: feedback.begruendung || feedback.musterloesung ? 10 : 0 }}>
        <span style={{ fontSize: 24 }}>{icon}</span>
        <span style={{ fontWeight: 600, color: farbe }}>{label}</span>
      </div>
      {feedback.begruendung && (
        <p style={{ fontSize: 13, color: 'var(--gray-600)', marginBottom: feedback.musterloesung ? 8 : 0 }}>{feedback.begruendung}</p>
      )}
      {feedback.musterloesung && (
        <div style={{ marginTop: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Musterlösung</div>
          <p style={{ fontSize: 13, color: 'var(--gray-700)', lineHeight: 1.5 }}>{feedback.musterloesung}</p>
        </div>
      )}
    </div>
  )
}

// ─── KI-Bewertung aufrufen ───────────────────────────────────────────────────

async function bewerteFreitext(frage_text, musterloesung, antwort) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bewerte-freitext-antwort`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({ frage_text, musterloesung, antwort }),
  })
  if (!res.ok) throw new Error('Bewertung fehlgeschlagen')
  return await res.json()
}

// ─── PruefungAblegen ─────────────────────────────────────────────────────────

function PruefungAblegen({ pruefung, profile, onBack }) {
  const [fragen, setFragen] = useState([])
  const [loading, setLoading] = useState(true)
  // Sofortfeedback-Modus
  const [currentIndex, setCurrentIndex] = useState(0)
  const [freitextEingabe, setFreitextEingabe] = useState('')
  const [beantwortet, setBeantwortet] = useState({}) // frageId -> { richtig, begruendung, text, musterloesung }
  const [bewertungLaeuft, setBewertungLaeuft] = useState(false)
  const [bewertungFehler, setBewertungFehler] = useState(false)
  // Klassischer Modus
  const [antworten, setAntworten] = useState({})
  // Ergebnis
  const [submitted, setSubmitted] = useState(false)
  const [ergebnis, setErgebnis] = useState(null)
  const [abgebenLaeuft, setAbgebenLaeuft] = useState(false)

  const sofortfeedback = !!pruefung.sofortfeedback

  useEffect(() => {
    supabase.from('fragen').select('*').eq('pruefung_id', pruefung.id).order('reihenfolge').then(({ data }) => {
      const f = (data ?? []).map(f => ({
        ...f,
        antworten: typeof f.antworten === 'string' ? JSON.parse(f.antworten) : (f.antworten ?? [])
      }))
      setFragen(f)
      setLoading(false)
    })
  }, [])

  // ── Punkte berechnen ──────────────────────────────────────────────────────

  function berechnePunkte(fragenListe, antwortenMap, beantwortetMap) {
    let richtig = 0, gesamt = 0
    fragenListe.forEach(f => {
      gesamt += f.punkte
      if (f.typ === 'freitext') {
        const p = beantwortetMap[f.id]?.punkte ?? 0
        richtig += f.punkte * p
      } else {
        const auswahl = antwortenMap[f.id]
        if (!auswahl || (Array.isArray(auswahl) && auswahl.length === 0)) return
        const richtigeAntworten = f.antworten.filter(a => a.richtig).map(a => a.text)
        if (f.typ === 'mehrfachauswahl') {
          const auswahlArr = Array.isArray(auswahl) ? auswahl : [auswahl]
          if (richtigeAntworten.every(r => auswahlArr.includes(r)) && auswahlArr.every(a => richtigeAntworten.includes(a))) richtig += f.punkte
        } else {
          if (richtigeAntworten.includes(auswahl)) richtig += f.punkte
        }
      }
    })
    return { richtig, gesamt }
  }

  // ── Speichern ─────────────────────────────────────────────────────────────

  async function speichereErgebnis(fragenListe, antwortenMap, beantwortetMap) {
    const { richtig, gesamt } = berechnePunkte(fragenListe, antwortenMap, beantwortetMap)
    const bestanden = gesamt > 0 && (richtig / gesamt * 100) >= pruefung.bestehens_prozent

    // antworten_detail zusammenbauen
    const detail = {}
    fragenListe.forEach(f => {
      if (f.typ === 'freitext') {
        detail[f.id] = { text: beantwortetMap[f.id]?.text ?? '', punkte: beantwortetMap[f.id]?.punkte ?? 0 }
      } else {
        detail[f.id] = antwortenMap[f.id] ?? null
      }
    })

    const { count: anzahlVersuche } = await supabase
      .from('pruefungs_ergebnisse').select('*', { count: 'exact', head: true })
      .eq('kamerad_id', profile.id).eq('pruefung_id', pruefung.id)

    await supabase.from('pruefungs_ergebnisse').insert({
      kamerad_id: profile.id,
      pruefung_id: pruefung.id,
      punkte_erreicht: richtig,
      punkte_gesamt: gesamt,
      bestanden,
      antworten_detail: detail,
      versuch: (anzahlVersuche ?? 0) + 1,
    })

    const res = { punkte_erreicht: richtig, punkte_gesamt: gesamt, bestanden, prozent: gesamt > 0 ? Math.round(richtig / gesamt * 100) : 0, abgelegt_am: new Date().toISOString(), antworten_detail: detail }
    setErgebnis(res)
    setSubmitted(true)
  }

  // ── Sofortfeedback: Frage beantworten ────────────────────────────────────

  async function handleSofortAntwort() {
    const f = fragen[currentIndex]
    if (f.typ === 'freitext') {
      if (!freitextEingabe.trim()) return
      setBewertungLaeuft(true)
      setBewertungFehler(false)
      try {
        const result = await bewerteFreitext(f.frage_text, f.musterloesung, freitextEingabe)
        setBeantwortet(b => ({ ...b, [f.id]: { punkte: result.punkte, begruendung: result.begruendung, text: freitextEingabe, musterloesung: f.musterloesung } }))
      } catch {
        setBewertungFehler(true)
      } finally {
        setBewertungLaeuft(false)
      }
    } else {
      const auswahl = antworten[f.id]
      if (!auswahl || (Array.isArray(auswahl) && auswahl.length === 0)) return
      const richtigeAntworten = f.antworten.filter(a => a.richtig).map(a => a.text)
      let istRichtig = false
      if (f.typ === 'mehrfachauswahl') {
        const auswahlArr = Array.isArray(auswahl) ? auswahl : [auswahl]
        istRichtig = richtigeAntworten.every(r => auswahlArr.includes(r)) && auswahlArr.every(a => richtigeAntworten.includes(a))
      } else {
        istRichtig = richtigeAntworten.includes(auswahl)
      }
      setBeantwortet(b => ({ ...b, [f.id]: { richtig: istRichtig, richtigeAntworten } }))
    }
  }

  async function handleNaechste() {
    if (currentIndex < fragen.length - 1) {
      setCurrentIndex(i => i + 1)
      setFreitextEingabe('')
      setBewertungFehler(false)
    } else {
      // Letzte Frage — Ergebnis speichern
      await speichereErgebnis(fragen, antworten, beantwortet)
    }
  }

  // ── Klassisch: Abgabe ────────────────────────────────────────────────────

  async function handleKlassischAbgabe() {
    setAbgebenLaeuft(true)
    // Freitext-Fragen evaluieren
    const neuesBeantwortet = { ...beantwortet }
    for (const f of fragen) {
      if (f.typ === 'freitext') {
        const text = antworten[f.id] ?? ''
        if (text.trim()) {
          try {
            const result = await bewerteFreitext(f.frage_text, f.musterloesung, text)
            neuesBeantwortet[f.id] = { punkte: result.punkte, begruendung: result.begruendung, text, musterloesung: f.musterloesung }
          } catch {
            neuesBeantwortet[f.id] = { punkte: 0, begruendung: 'Bewertung fehlgeschlagen', text, musterloesung: f.musterloesung }
          }
        } else {
          neuesBeantwortet[f.id] = { punkte: 0, begruendung: 'Keine Antwort', text: '', musterloesung: f.musterloesung }
        }
      }
    }
    setBeantwortet(neuesBeantwortet)
    await speichereErgebnis(fragen, antworten, neuesBeantwortet)
    setAbgebenLaeuft(false)
  }

  function setAntwort(frageId, value, typ) {
    if (typ === 'mehrfachauswahl') {
      setAntworten(a => {
        const aktuelle = Array.isArray(a[frageId]) ? a[frageId] : []
        const neu = aktuelle.includes(value) ? aktuelle.filter(x => x !== value) : [...aktuelle, value]
        return { ...a, [frageId]: neu }
      })
    } else if (typ === 'freitext') {
      setAntworten(a => ({ ...a, [frageId]: value }))
    } else {
      setAntworten(a => ({ ...a, [frageId]: value }))
    }
  }

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  if (submitted && ergebnis) return (
    <div>
      <div className="page-header">
        <h1>Ergebnis</h1>
        <button className="btn btn-secondary" onClick={onBack}>Zurueck zur Uebersicht</button>
      </div>
      <div className="card" style={{ textAlign: 'center', padding: 48, marginBottom: 20 }}>
        <div style={{ fontSize: 56, fontWeight: 700, color: ergebnis.bestanden ? '#1E8449' : 'var(--red)', marginBottom: 12 }}>{ergebnis.prozent}%</div>
        <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 8, color: 'var(--gray-800)' }}>{ergebnis.bestanden ? 'Bestanden!' : 'Nicht bestanden'}</div>
        <div style={{ color: 'var(--gray-400)' }}>{ergebnis.punkte_erreicht} von {ergebnis.punkte_gesamt} Punkten · Grenze: {pruefung.bestehens_prozent}%</div>
      </div>
      <ErgebnisDetail pruefung={pruefung} ergebnis={{ ...ergebnis, _beantwortet: beantwortet }} fragen={fragen} onBack={onBack} istNachAbgabe />
    </div>
  )

  // ── Sofortfeedback-Modus ─────────────────────────────────────────────────

  if (sofortfeedback) {
    const f = fragen[currentIndex]
    if (!f) return null
    const istBeantwortet = !!beantwortet[f.id]
    const feedback = beantwortet[f.id]
    const auswahl = antworten[f.id]
    const auswahlArr = Array.isArray(auswahl) ? auswahl : (auswahl ? [auswahl] : [])
    const hatAntwort = f.typ === 'freitext' ? freitextEingabe.trim().length > 0 : auswahlArr.length > 0
    const istLetzte = currentIndex === fragen.length - 1

    return (
      <div>
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurueck</button>
            <div>
              <h1>{pruefung.titel}</h1>
              <p style={{ fontSize: 13, marginTop: 2, color: 'var(--gray-400)' }}>Frage {currentIndex + 1} von {fragen.length}</p>
            </div>
          </div>
        </div>

        {/* Fortschrittsbalken */}
        <div style={{ height: 4, background: 'var(--gray-200)', borderRadius: 2, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'var(--red)', borderRadius: 2, width: `${((currentIndex + (istBeantwortet ? 1 : 0)) / fragen.length) * 100}%`, transition: 'width 300ms' }} />
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 8, fontWeight: 600 }}>
            FRAGE {currentIndex + 1}/{fragen.length}
            {f.typ === 'freitext' && <span style={{ marginLeft: 8, color: 'var(--gray-400)', fontWeight: 400 }}>· KI-bewertet</span>}
          </div>
          <div style={{ fontWeight: 500, fontSize: 16, lineHeight: 1.5, color: 'var(--gray-700)', marginBottom: 20 }}>{f.frage_text}</div>

          {f.typ === 'freitext' ? (
            <FreitextEingabe value={freitextEingabe} onChange={setFreitextEingabe} disabled={istBeantwortet} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(f.antworten ?? []).map((a, ai) => {
                const isSelected = f.typ === 'mehrfachauswahl' ? auswahlArr.includes(a.text) : auswahl === a.text
                let bg = isSelected ? 'var(--red-pale)' : 'var(--white)'
                let border = isSelected ? 'var(--red)' : 'var(--gray-200)'

                // Nach Beantwortung Farben zeigen
                if (istBeantwortet && f.typ !== 'freitext') {
                  if (a.richtig && isSelected) { bg = '#EAFAF1'; border = '#A9DFBF' }
                  else if (a.richtig && !isSelected) { bg = '#FFFBEB'; border = '#FCD34D' }
                  else if (!a.richtig && isSelected) { bg = 'var(--red-pale)'; border = 'var(--red)' }
                  else { bg = 'var(--gray-50)'; border = 'var(--gray-200)' }
                }

                return (
                  <label key={ai} onClick={() => !istBeantwortet && setAntwort(f.id, a.text, f.typ)} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10,
                    cursor: istBeantwortet ? 'default' : 'pointer', fontSize: 14,
                    border: `2px solid ${border}`, background: bg, transition: 'all 150ms', userSelect: 'none',
                  }}>
                    <div style={{
                      width: 22, height: 22, flexShrink: 0,
                      borderRadius: f.typ === 'mehrfachauswahl' ? '4px' : '50%',
                      border: `2px solid ${isSelected ? 'var(--red)' : 'var(--gray-300)'}`,
                      background: isSelected ? 'var(--red)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isSelected && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20,6 9,17 4,12"/></svg>}
                    </div>
                    <span style={{ flex: 1, color: 'var(--gray-700)', fontWeight: isSelected ? 500 : 400 }}>{a.text}</span>
                    {istBeantwortet && a.richtig && <span style={{ fontSize: 12, color: '#1E8449', fontWeight: 600 }}>✓ Richtig</span>}
                  </label>
                )
              })}
            </div>
          )}
        </div>

        {/* Feedback nach Beantwortung */}
        {istBeantwortet && <FeedbackBox feedback={feedback} />}

        {/* Fehler bei KI-Bewertung */}
        {bewertungFehler && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            Bewertung fehlgeschlagen.
            <button className="btn btn-sm btn-secondary" style={{ marginLeft: 12 }} onClick={() => { setBewertungFehler(false); handleSofortAntwort() }}>
              Nochmal versuchen
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {!istBeantwortet ? (
            <button
              className="btn btn-primary"
              onClick={handleSofortAntwort}
              disabled={!hatAntwort || bewertungLaeuft}
            >
              {bewertungLaeuft ? (
                <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Wird bewertet...</>
              ) : 'Antworten'}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleNaechste}>
              {istLetzte ? 'Ergebnis anzeigen' : 'Nächste Frage →'}
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Klassischer Modus (alle Fragen auf einmal) ───────────────────────────

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurueck</button>
          <h1>{pruefung.titel}</h1>
        </div>
        <button className="btn btn-primary" onClick={handleKlassischAbgabe} disabled={abgebenLaeuft}>
          {abgebenLaeuft ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />Wird ausgewertet...</> : 'Abgeben'}
        </button>
      </div>
      {fragen.map((f, fi) => {
        let antwortListe = []
        try {
          if (Array.isArray(f.antworten)) antwortListe = f.antworten
          else if (typeof f.antworten === 'string') antwortListe = JSON.parse(f.antworten)
        } catch(e) { antwortListe = [] }

        const istMehrfach = f.typ === 'mehrfachauswahl'
        const auswahlArr = Array.isArray(antworten[f.id]) ? antworten[f.id] : (antworten[f.id] ? [antworten[f.id]] : [])

        return (
          <div key={f.id} className="card" style={{ marginBottom: 10, padding: '14px' }}>
            <div style={{ fontWeight: 500, marginBottom: 14, fontSize: 15, lineHeight: 1.4, color: 'var(--gray-700)' }}>
              <span style={{ color: 'var(--red)', marginRight: 6, fontSize: 12, fontWeight: 600 }}>{fi + 1}/{fragen.length}</span>
              {f.frage_text}
              {istMehrfach && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--gray-400)', fontWeight: 400 }}>(Mehrere Antworten moeglich)</span>}
              {f.typ === 'freitext' && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--gray-400)', fontWeight: 400 }}>(Freitext · KI-bewertet)</span>}
            </div>
            {f.typ === 'freitext' ? (
              <FreitextEingabe
                value={antworten[f.id] ?? ''}
                onChange={val => setAntwort(f.id, val, 'freitext')}
                disabled={abgebenLaeuft}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {antwortListe.map((a, ai) => {
                  const isSelected = istMehrfach ? auswahlArr.includes(a.text) : antworten[f.id] === a.text
                  return (
                    <label key={ai} onClick={() => !abgebenLaeuft && setAntwort(f.id, a.text, f.typ)} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10,
                      cursor: abgebenLaeuft ? 'not-allowed' : 'pointer', fontSize: 14,
                      border: `2px solid ${isSelected ? 'var(--red)' : 'var(--gray-200)'}`,
                      background: isSelected ? 'var(--red-pale)' : 'var(--white)', transition: 'all 150ms', userSelect: 'none',
                    }}>
                      <div style={{
                        width: 22, height: 22, flexShrink: 0,
                        borderRadius: istMehrfach ? '4px' : '50%',
                        border: `2px solid ${isSelected ? 'var(--red)' : 'var(--gray-300)'}`,
                        background: isSelected ? 'var(--red)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isSelected && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20,6 9,17 4,12"/></svg>}
                      </div>
                      <span style={{ color: isSelected ? 'var(--red-dark)' : 'var(--gray-700)', fontWeight: isSelected ? 500 : 400 }}>{a.text}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
      <div style={{ marginTop: 16 }}>
        <button className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }} onClick={handleKlassischAbgabe} disabled={abgebenLaeuft}>
          {abgebenLaeuft ? 'Wird ausgewertet...' : 'Pruefung abgeben'}
        </button>
      </div>
    </div>
  )
}

// ─── ErgebnisDetail ───────────────────────────────────────────────────────────

function ErgebnisDetail({ pruefung, ergebnis, fragen: fragenProp, onBack, istNachAbgabe, kameradName }) {
  const [fragen, setFragen] = useState(fragenProp ?? [])
  const [loading, setLoading] = useState(!fragenProp)

  useEffect(() => {
    if (fragenProp) return
    supabase.from('fragen').select('*').eq('pruefung_id', pruefung.id).order('reihenfolge').then(({ data }) => {
      setFragen(data ?? [])
      setLoading(false)
    })
  }, [])

  const antworten = ergebnis.antworten_detail ?? {}
  const beantwortet = ergebnis._beantwortet ?? {}
  const prozent = ergebnis.punkte_gesamt > 0 ? Math.round(ergebnis.punkte_erreicht / ergebnis.punkte_gesamt * 100) : 0

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurueck</button>
          <div>
            <h1>Ergebnis: {pruefung.titel}</h1>
            {kameradName && <p style={{ fontSize: 13, marginTop: 2 }}>Kamerad: {kameradName}</p>}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20, background: ergebnis.bestanden ? '#EAFAF1' : 'var(--red-pale)', border: `1px solid ${ergebnis.bestanden ? '#A9DFBF' : 'var(--red-light)'}` }}>
        <div style={{ fontSize: 48, fontWeight: 700, color: ergebnis.bestanden ? '#1E8449' : 'var(--red)', flexShrink: 0 }}>{prozent}%</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 18, color: ergebnis.bestanden ? '#1E8449' : 'var(--red-dark)' }}>
            {ergebnis.bestanden ? 'Bestanden' : 'Nicht bestanden'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 4 }}>
            {ergebnis.punkte_erreicht} von {ergebnis.punkte_gesamt} Punkten · Bestehensgrenze: {pruefung.bestehens_prozent}%
          </div>
          {ergebnis.abgelegt_am && (
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
              Abgelegt am {format(new Date(ergebnis.abgelegt_am), 'd. MMMM yyyy HH:mm', { locale: de })}
            </div>
          )}
        </div>
      </div>

      <h3 style={{ marginBottom: 12 }}>Fragen und Antworten</h3>
      {fragen.map((f, fi) => {
        const meineAntwort = antworten[f.id]

        // Freitext-Frage
        if (f.typ === 'freitext') {
          const ft = beantwortet[f.id] ?? (typeof meineAntwort === 'object' ? meineAntwort : null)
          const text = ft?.text ?? (typeof meineAntwort === 'string' ? meineAntwort : '')
          const teilpunkte = ft?.punkte ?? 0
          const nichtBeantwortet = !text
          const borderCol = nichtBeantwortet ? 'var(--gray-300)' : teilpunkte === 1 ? '#1E8449' : teilpunkte === 0.5 ? '#FCD34D' : 'var(--red)'
          const iconBg = nichtBeantwortet ? 'var(--gray-200)' : teilpunkte === 1 ? '#D5F5E3' : teilpunkte === 0.5 ? '#FEF3C7' : 'var(--red-light)'
          const iconChar = nichtBeantwortet ? '?' : teilpunkte === 1 ? '✓' : teilpunkte === 0.5 ? '½' : '✗'

          return (
            <div key={f.id} className="card" style={{ marginBottom: 10, borderLeft: `3px solid ${borderCol}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
                  {iconChar}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 4 }}>Frage {fi + 1} · Freitext</div>
                  <div style={{ fontWeight: 500, color: 'var(--gray-700)', lineHeight: 1.4 }}>{f.frage_text}</div>
                </div>
              </div>
              {text && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--gray-50)', border: '1px solid var(--gray-200)', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Antwort</div>
                  <p style={{ fontSize: 13, color: 'var(--gray-700)', lineHeight: 1.5 }}>{text}</p>
                </div>
              )}
              {f.musterloesung && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: '#FFFBEB', border: '1px solid #FCD34D' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#92400E', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Musterlösung</div>
                  <p style={{ fontSize: 13, color: 'var(--gray-700)', lineHeight: 1.5 }}>{f.musterloesung}</p>
                </div>
              )}
              {ft?.begruendung && (
                <p style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 8, fontStyle: 'italic' }}>KI-Bewertung: {ft.begruendung}</p>
              )}
              {nichtBeantwortet && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 8, fontStyle: 'italic' }}>Nicht beantwortet</div>}
            </div>
          )
        }

        // MC / Mehrfach / Wahr-Falsch
        const richtigeAntworten = (f.antworten ?? []).filter(a => a.richtig).map(a => a.text)
        const meineAntwortArr = Array.isArray(meineAntwort) ? meineAntwort : meineAntwort ? [meineAntwort] : []
        const istRichtig = meineAntwortArr.length > 0 &&
          richtigeAntworten.every(r => meineAntwortArr.includes(r)) &&
          meineAntwortArr.every(m => richtigeAntworten.includes(m))
        const nichtBeantwortet = meineAntwortArr.length === 0

        return (
          <div key={f.id} className="card" style={{ marginBottom: 10, borderLeft: `3px solid ${nichtBeantwortet ? 'var(--gray-300)' : istRichtig ? '#1E8449' : 'var(--red)'}` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: nichtBeantwortet ? 'var(--gray-200)' : istRichtig ? '#D5F5E3' : 'var(--red-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
                {nichtBeantwortet ? '?' : istRichtig ? '✓' : '✗'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 4 }}>Frage {fi + 1}</div>
                <div style={{ fontWeight: 500, color: 'var(--gray-700)', lineHeight: 1.4 }}>{f.frage_text}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(f.antworten ?? []).map((a, ai) => {
                const istMeineAntwort = Array.isArray(meineAntwort) ? meineAntwort.includes(a.text) : meineAntwort === a.text
                const istRichtigeAntwort = a.richtig
                let bg, border, textColor, label, labelColor
                if (istRichtigeAntwort && istMeineAntwort) { bg = '#EAFAF1'; border = '#A9DFBF'; textColor = '#1E8449'; label = '✓ Angekreuzt'; labelColor = '#1E8449' }
                else if (istRichtigeAntwort && !istMeineAntwort) { bg = '#FFFBEB'; border = '#FCD34D'; textColor = '#92400E'; label = '⚠ Nicht angekreuzt'; labelColor = '#B45309' }
                else if (!istRichtigeAntwort && istMeineAntwort) { bg = 'var(--red-pale)'; border = 'var(--red-light)'; textColor = 'var(--red-dark)'; label = '✗ Falsch angekreuzt'; labelColor = 'var(--red)' }
                else { bg = 'var(--gray-50)'; border = 'var(--gray-200)'; textColor = 'var(--gray-600)'; label = null; labelColor = null }
                return (
                  <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: `1px solid ${border}`, background: bg }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: textColor, flex: 1 }}>{a.text}</span>
                    {label && <span style={{ fontSize: 11, color: labelColor, fontWeight: 600, flexShrink: 0 }}>{label}</span>}
                  </div>
                )
              })}
            </div>
            {nichtBeantwortet && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 8, fontStyle: 'italic' }}>Nicht beantwortet</div>}
          </div>
        )
      })}
    </div>
  )
}

// ─── Fragen-Editor (gemeinsam für Erstellen + Bearbeiten) ────────────────────

function FrageEditor({ frage, fi, onUpdate, onUpdateAntwort, onToggleRichtig, onRemove }) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-400)' }}>Frage {fi + 1}</span>
        <select value={frage.typ} onChange={e => onUpdate(frage.id, 'typ', e.target.value)} style={{ maxWidth: 260 }}>
          <option value="multiple_choice">Multiple Choice (1 richtig)</option>
          <option value="mehrfachauswahl">Mehrfachauswahl (mehrere richtig)</option>
          <option value="wahr_falsch">Wahr / Falsch</option>
          <option value="freitext">Freitext (KI-bewertet)</option>
        </select>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', color: 'var(--red)' }} onClick={() => onRemove(frage.id)}>Entfernen</button>
      </div>
      <div className="form-group">
        <label>Fragetext</label>
        <input value={frage.frage_text} onChange={e => onUpdate(frage.id, 'frage_text', e.target.value)} placeholder="Fragetext eingeben..." />
      </div>
      {frage.typ === 'freitext' ? (
        <div className="form-group">
          <label>Musterlösung <span style={{ fontWeight: 400, color: 'var(--gray-400)', fontSize: 12 }}>(KI bewertet anhand dieser Lösung)</span></label>
          <textarea value={frage.musterloesung ?? ''} onChange={e => onUpdate(frage.id, 'musterloesung', e.target.value)} rows={3} placeholder="Vollständige Musterlösung eingeben..." />
        </div>
      ) : (
        <>
          <label style={{ marginBottom: 8, display: 'block' }}>
            Antworten {frage.typ === 'mehrfachauswahl' ? '(Checkboxen: mehrere richtig möglich)' : '(Radio: eine richtige Antwort)'}
          </label>
          {(frage.typ === 'wahr_falsch'
            ? [{ text: 'Wahr', richtig: frage.antworten[0]?.richtig ?? false }, { text: 'Falsch', richtig: frage.antworten[1]?.richtig ?? false }]
            : frage.antworten
          ).map((a, ai) => (
            <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <input
                type={frage.typ === 'mehrfachauswahl' ? 'checkbox' : 'radio'}
                checked={a.richtig ?? false}
                onChange={() => onToggleRichtig(frage.id, ai)}
                style={{ width: 'auto', flexShrink: 0 }}
                name={frage.typ !== 'mehrfachauswahl' ? `frage-${frage.id}` : undefined}
              />
              {frage.typ === 'wahr_falsch'
                ? <span style={{ fontSize: 14 }}>{a.text}</span>
                : <input value={a.text ?? ''} onChange={e => onUpdateAntwort(frage.id, ai, 'text', e.target.value)} placeholder={`Antwort ${ai + 1}`} />
              }
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function neueAntworten(typ) {
  if (typ === 'freitext') return []
  if (typ === 'wahr_falsch') return [{ text: 'Wahr', richtig: false }, { text: 'Falsch', richtig: false }]
  return [{ text: '', richtig: false }, { text: '', richtig: false }, { text: '', richtig: false }, { text: '', richtig: false }]
}

// ─── PruefungErstellen ────────────────────────────────────────────────────────

function PruefungErstellen({ profile, onBack, importDaten }) {
  const [form, setForm] = useState({
    titel: importDaten?.titel ?? '',
    beschreibung: importDaten?.beschreibung ?? '',
    bestehens_prozent: importDaten?.bestehens_prozent ?? 70,
    sofortfeedback: importDaten?.sofortfeedback ?? false,
  })
  const [fragen, setFragen] = useState(
    importDaten?.fragen
      ? importDaten.fragen.map((f, i) => ({
          id: 'imp_' + i, frage_text: f.frage_text ?? '',
          typ: f.typ ?? 'multiple_choice',
          antworten: f.antworten ?? [],
          musterloesung: f.musterloesung ?? '',
          punkte: f.punkte ?? 1, reihenfolge: i,
        }))
      : []
  )
  const [saving, setSaving] = useState(false)

  function addFrage() {
    setFragen(f => [...f, { id: Date.now(), frage_text: '', typ: 'multiple_choice', antworten: neueAntworten('multiple_choice'), musterloesung: '', punkte: 1, reihenfolge: f.length }])
  }
  function updateFrage(id, field, value) {
    setFragen(fs => fs.map(f => {
      if (f.id !== id) return f
      const updated = { ...f, [field]: value }
      if (field === 'typ') updated.antworten = neueAntworten(value)
      return updated
    }))
  }
  function updateAntwort(frageId, idx, field, value) {
    setFragen(fs => fs.map(f => { if (f.id !== frageId) return f; const antworten = [...f.antworten]; antworten[idx] = { ...antworten[idx], [field]: value }; return { ...f, antworten } }))
  }
  function toggleRichtig(frageId, idx) {
    setFragen(fs => fs.map(f => {
      if (f.id !== frageId) return f
      const antworten = f.antworten.map((a, i) => f.typ === 'mehrfachauswahl' ? (i === idx ? { ...a, richtig: !a.richtig } : a) : { ...a, richtig: i === idx })
      return { ...f, antworten }
    }))
  }
  function removeFrage(id) { setFragen(fs => fs.filter(f => f.id !== id)) }

  async function handleSave() {
    if (!form.titel || fragen.length === 0) return alert('Titel und mindestens eine Frage erforderlich')
    setSaving(true)
    const { data: pruefung, error } = await supabase.from('pruefungen').insert({
      ...form, erstellt_von: profile.id, wehr_id: profile.wehr_id, aktiv: false
    }).select().single()
    if (error) { alert('Fehler: ' + error.message); setSaving(false); return }
    const payload = fragen.map((f, i) => ({
      pruefung_id: pruefung.id, frage_text: f.frage_text, typ: f.typ,
      antworten: f.typ === 'freitext' ? null : f.antworten,
      musterloesung: f.musterloesung || null,
      punkte: f.punkte ?? 1, reihenfolge: i,
    }))
    const { error: fe } = await supabase.from('fragen').insert(payload)
    if (fe) { alert('Fehler beim Speichern der Fragen: ' + fe.message); setSaving(false); return }
    setSaving(false)
    onBack()
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurueck</button>
          <h1>{importDaten ? 'Pruefung importieren' : 'Neue Pruefung'}</h1>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Speichern...' : 'Pruefung speichern'}</button>
      </div>
      {importDaten && <div className="alert alert-success" style={{ marginBottom: 16 }}>{fragen.length} Fragen aus JSON importiert</div>}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 16 }}>Grunddaten</h3>
        <div className="form-group"><label>Titel</label><input value={form.titel} onChange={e => setForm(f => ({ ...f, titel: e.target.value }))} placeholder="z.B. Atemschutzgeraetetraeger" /></div>
        <div className="form-group"><label>Beschreibung (optional)</label><textarea value={form.beschreibung} onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))} rows={2} /></div>
        <div className="form-group"><label>Bestehensgrenze (%)</label><input type="number" min="1" max="100" value={form.bestehens_prozent} onChange={e => setForm(f => ({ ...f, bestehens_prozent: parseInt(e.target.value) }))} style={{ maxWidth: 100 }} /></div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={form.sofortfeedback} onChange={e => setForm(f => ({ ...f, sofortfeedback: e.target.checked }))} style={{ width: 'auto' }} />
            <span>Sofortiges Feedback nach jeder Frage</span>
            <span style={{ fontSize: 12, color: 'var(--gray-400)', fontWeight: 400 }}>— eine Frage pro Bildschirm, Antwort direkt angezeigt</span>
          </label>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3>Fragen ({fragen.length})</h3>
        <button className="btn btn-secondary btn-sm" onClick={addFrage}>+ Frage hinzufuegen</button>
      </div>
      {fragen.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 32 }}><p>Noch keine Fragen</p></div>}
      {fragen.map((frage, fi) => (
        <FrageEditor key={frage.id} frage={frage} fi={fi} onUpdate={updateFrage} onUpdateAntwort={updateAntwort} onToggleRichtig={toggleRichtig} onRemove={removeFrage} />
      ))}
    </div>
  )
}

// ─── PruefungBearbeiten ───────────────────────────────────────────────────────

function PruefungBearbeiten({ pruefung, profile, onBack }) {
  const [form, setForm] = useState({
    titel: pruefung.titel,
    beschreibung: pruefung.beschreibung ?? '',
    bestehens_prozent: pruefung.bestehens_prozent,
    sofortfeedback: pruefung.sofortfeedback ?? false,
  })
  const [fragen, setFragen] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('fragen').select('*').eq('pruefung_id', pruefung.id).order('reihenfolge').then(({ data }) => {
      setFragen((data ?? []).map(f => ({ ...f, antworten: f.antworten ?? [], musterloesung: f.musterloesung ?? '' })))
      setLoading(false)
    })
  }, [])

  function addFrage() { setFragen(f => [...f, { id: 'neu_' + Date.now(), pruefung_id: pruefung.id, frage_text: '', typ: 'multiple_choice', antworten: neueAntworten('multiple_choice'), musterloesung: '', punkte: 1, reihenfolge: f.length }]) }
  function updateFrage(id, field, value) {
    setFragen(fs => fs.map(f => {
      if (f.id !== id) return f
      const updated = { ...f, [field]: value }
      if (field === 'typ') updated.antworten = neueAntworten(value)
      return updated
    }))
  }
  function updateAntwort(frageId, idx, field, value) { setFragen(fs => fs.map(f => { if (f.id !== frageId) return f; const antworten = [...f.antworten]; antworten[idx] = { ...antworten[idx], [field]: value }; return { ...f, antworten } })) }
  function toggleRichtig(frageId, idx) {
    setFragen(fs => fs.map(f => {
      if (f.id !== frageId) return f
      const antworten = f.antworten.map((a, i) => f.typ === 'mehrfachauswahl' ? (i === idx ? { ...a, richtig: !a.richtig } : a) : { ...a, richtig: i === idx })
      return { ...f, antworten }
    }))
  }
  function removeFrage(id) { setFragen(fs => fs.filter(f => f.id !== id)) }

  async function handleSave() {
    if (!form.titel) return alert('Titel erforderlich')
    setSaving(true)
    await supabase.from('pruefungen').update({ ...form }).eq('id', pruefung.id)
    await supabase.from('fragen').delete().eq('pruefung_id', pruefung.id)
    if (fragen.length > 0) {
      await supabase.from('fragen').insert(fragen.map((f, i) => ({
        pruefung_id: pruefung.id, frage_text: f.frage_text, typ: f.typ,
        antworten: f.typ === 'freitext' ? null : f.antworten,
        musterloesung: f.musterloesung || null,
        punkte: f.punkte ?? 1, reihenfolge: i,
      })))
    }
    setSaving(false)
    onBack()
  }

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurueck</button>
          <h1>Pruefung bearbeiten</h1>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Speichern...' : 'Speichern'}</button>
      </div>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 16 }}>Grunddaten</h3>
        <div className="form-group"><label>Titel</label><input value={form.titel} onChange={e => setForm(f => ({ ...f, titel: e.target.value }))} /></div>
        <div className="form-group"><label>Beschreibung</label><textarea value={form.beschreibung} onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))} rows={2} /></div>
        <div className="form-group"><label>Bestehensgrenze (%)</label><input type="number" min="1" max="100" value={form.bestehens_prozent} onChange={e => setForm(f => ({ ...f, bestehens_prozent: parseInt(e.target.value) }))} style={{ maxWidth: 100 }} /></div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={form.sofortfeedback} onChange={e => setForm(f => ({ ...f, sofortfeedback: e.target.checked }))} style={{ width: 'auto' }} />
            <span>Sofortiges Feedback nach jeder Frage</span>
            <span style={{ fontSize: 12, color: 'var(--gray-400)', fontWeight: 400 }}>— eine Frage pro Bildschirm, Antwort direkt angezeigt</span>
          </label>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3>Fragen ({fragen.length})</h3>
        <button className="btn btn-secondary btn-sm" onClick={addFrage}>+ Frage hinzufuegen</button>
      </div>
      {fragen.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 32 }}><p>Keine Fragen</p></div>}
      {fragen.map((frage, fi) => (
        <FrageEditor key={frage.id} frage={frage} fi={fi} onUpdate={updateFrage} onUpdateAntwort={updateAntwort} onToggleRichtig={toggleRichtig} onRemove={removeFrage} />
      ))}
    </div>
  )
}

// ─── PruefungAuswertung ───────────────────────────────────────────────────────

function PruefungAuswertung({ pruefung, onBack }) {
  const [ergebnisse, setErgebnisse] = useState([])
  const [loading, setLoading] = useState(true)
  const [vonFilter, setVonFilter] = useState(pruefung.aktiv_von ? pruefung.aktiv_von.slice(0,10) : '')
  const [bisFilter, setBisFilter] = useState(pruefung.aktiv_bis ? pruefung.aktiv_bis.slice(0,10) : '')
  const [detailErgebnis, setDetailErgebnis] = useState(null)

  useEffect(() => {
    supabase.from('pruefungs_ergebnisse').select('*, kamerad:profiles(vorname,nachname)').eq('pruefung_id', pruefung.id).order('abgelegt_am', { ascending: false }).then(({ data }) => { setErgebnisse(data ?? []); setLoading(false) })
  }, [])

  if (detailErgebnis) return (
    <ErgebnisDetail pruefung={pruefung} ergebnis={detailErgebnis} onBack={() => setDetailErgebnis(null)} kameradName={`${detailErgebnis.kamerad?.vorname} ${detailErgebnis.kamerad?.nachname}`} />
  )

  const gefiltert = ergebnisse.filter(e => {
    const d = new Date(e.abgelegt_am)
    if (vonFilter && d < new Date(vonFilter)) return false
    if (bisFilter && d > new Date(bisFilter + 'T23:59:59')) return false
    return true
  })

  const bestanden = gefiltert.filter(e => e.bestanden).length
  const durchschnitt = gefiltert.length ? Math.round(gefiltert.reduce((s, e) => s + (e.punkte_gesamt > 0 ? e.punkte_erreicht / e.punkte_gesamt * 100 : 0), 0) / gefiltert.length) : 0

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurueck</button>
          <h1>Auswertung: {pruefung.titel}</h1>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 20, padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 150 }}><label style={{ fontSize: 12 }}>Von</label><input type="date" value={vonFilter} onChange={e => setVonFilter(e.target.value)} /></div>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 150 }}><label style={{ fontSize: 12 }}>Bis</label><input type="date" value={bisFilter} onChange={e => setBisFilter(e.target.value)} /></div>
          <button className="btn btn-secondary btn-sm" onClick={() => { setVonFilter(''); setBisFilter('') }}>Zuruecksetzen</button>
        </div>
        {(vonFilter || bisFilter) && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 8 }}>{gefiltert.length} von {ergebnisse.length} Ergebnissen im gewaehlten Zeitraum</div>}
      </div>
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card"><div className="stat-label">Teilnehmer</div><div className="stat-value">{gefiltert.length}</div></div>
        <div className="stat-card accent"><div className="stat-label">Bestanden</div><div className="stat-value">{bestanden}</div></div>
        <div className="stat-card"><div className="stat-label">Nicht bestanden</div><div className="stat-value">{gefiltert.length - bestanden}</div></div>
        <div className="stat-card"><div className="stat-label">Ø Ergebnis</div><div className="stat-value">{durchschnitt}%</div></div>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Kamerad</th><th className="col-hide-mobile">Versuch</th><th>Ergebnis</th><th className="col-hide-mobile">Punkte</th><th className="col-hide-mobile">Abgelegt am</th><th>Status</th></tr></thead>
          <tbody>
            {gefiltert.length === 0
              ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 24 }}>Keine Ergebnisse im gewaehlten Zeitraum</td></tr>
              : gefiltert.map(e => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 500 }}>{e.kamerad?.vorname} {e.kamerad?.nachname}</td>
                  <td className="col-hide-mobile" style={{ fontSize: 13, color: 'var(--gray-400)' }}>{e.versuch ?? 1}. Versuch</td>
                  <td>{e.punkte_gesamt > 0 ? Math.round(e.punkte_erreicht / e.punkte_gesamt * 100) : 0}%</td>
                  <td className="col-hide-mobile">{e.punkte_erreicht} / {e.punkte_gesamt}</td>
                  <td className="col-hide-mobile" style={{ fontSize: 13 }}>{format(new Date(e.abgelegt_am), 'd. MMM yyyy HH:mm', { locale: de })}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className={`badge badge-${e.bestanden ? 'green' : 'red'}`}>{e.bestanden ? 'Bestanden' : 'Nicht bestanden'}</span>
                      <button className="btn btn-sm btn-secondary" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setDetailErgebnis(e)}>Ansehen</button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── AktivToggle ─────────────────────────────────────────────────────────────

function AktivToggle({ pruefung, onToggle }) {
  const [modal, setModal] = useState(false)
  const [modus, setModus] = useState(pruefung.aktiv_von || pruefung.aktiv_bis ? 'zeitraum' : 'manuell')
  const [von, setVon] = useState(pruefung.aktiv_von ? pruefung.aktiv_von.slice(0,16) : '')
  const [bis, setBis] = useState(pruefung.aktiv_bis ? pruefung.aktiv_bis.slice(0,16) : '')
  const [saving, setSaving] = useState(false)

  const jetzt = new Date()
  const laeuft = pruefung.aktiv_von || pruefung.aktiv_bis
    ? (!pruefung.aktiv_von || new Date(pruefung.aktiv_von) <= jetzt) && (!pruefung.aktiv_bis || new Date(pruefung.aktiv_bis) >= jetzt)
    : pruefung.aktiv

  async function handleSave() {
    setSaving(true)
    if (modus === 'zeitraum') {
      await supabase.from('pruefungen').update({ aktiv: true, aktiv_von: von ? new Date(von).toISOString() : null, aktiv_bis: bis ? new Date(bis).toISOString() : null }).eq('id', pruefung.id)
    } else {
      await supabase.from('pruefungen').update({ aktiv: !laeuft, aktiv_von: null, aktiv_bis: null }).eq('id', pruefung.id)
    }
    setSaving(false); setModal(false); onToggle()
  }

  return (
    <>
      {laeuft ? (
        <button className="btn btn-sm btn-secondary" onClick={async () => { await supabase.from('pruefungen').update({ aktiv: false, aktiv_von: null, aktiv_bis: null }).eq('id', pruefung.id); onToggle() }}>Deaktivieren</button>
      ) : (
        <button className="btn btn-sm btn-primary" onClick={() => setModal(true)}>Aktivieren</button>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3>Pruefung aktivieren</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(false)}>x</button>
            </div>
            <div className="form-group">
              <label>Aktivierungsmodus</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button type="button" className={`btn btn-sm ${modus === 'manuell' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setModus('manuell')}>Sofort aktiv</button>
                <button type="button" className={`btn btn-sm ${modus === 'zeitraum' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setModus('zeitraum')}>Mit Zeitraum</button>
              </div>
            </div>
            {modus === 'manuell' ? (
              <div className="alert alert-info" style={{ fontSize: 13 }}>Pruefung wird sofort aktiviert — ohne Zeitbegrenzung.</div>
            ) : (
              <>
                <div className="form-group"><label>Aktiv von (optional)</label><input type="datetime-local" value={von} onChange={e => setVon(e.target.value)} /></div>
                <div className="form-group"><label>Aktiv bis (optional)</label><input type="datetime-local" value={bis} onChange={e => setBis(e.target.value)} /></div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>Leer lassen = kein Limit in diese Richtung</div>
              </>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Speichern...' : 'Speichern'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── WachenToggle ─────────────────────────────────────────────────────────────

function WachenToggle({ pruefung, onToggle }) {
  const [modal, setModal] = useState(false)
  const [wehren, setWehren] = useState([])
  const [auswahl, setAuswahl] = useState(pruefung.sichtbar_fuer_wehren ?? null)
  const [modus, setModus] = useState(pruefung.sichtbar_fuer_wehren ? 'ausgewaehlte' : 'alle')
  const [saving, setSaving] = useState(false)
  const { profile: myProfile } = useAuth()
  const nurEigeneWache = myProfile?.rolle === 'wehrleiter'

  async function oeffnen() {
    let wehrQuery = supabase.from('wehren').select('id,name').order('name')
    if (nurEigeneWache && myProfile?.wehr_id) wehrQuery = wehrQuery.eq('id', myProfile.wehr_id)
    const { data } = await wehrQuery
    setWehren(data ?? [])
    if (nurEigeneWache && myProfile?.wehr_id) {
      const istEnthalten = pruefung.sichtbar_fuer_wehren === null || (pruefung.sichtbar_fuer_wehren ?? []).includes(myProfile.wehr_id)
      setAuswahl(istEnthalten ? [myProfile.wehr_id] : [])
      setModus('ausgewaehlte')
    } else {
      setAuswahl(pruefung.sichtbar_fuer_wehren ?? [])
      setModus(pruefung.sichtbar_fuer_wehren ? 'ausgewaehlte' : 'alle')
    }
    setModal(true)
  }

  function toggleWehr(id) { setAuswahl(a => (a ?? []).includes(id) ? (a ?? []).filter(x => x !== id) : [...(a ?? []), id]) }

  async function handleSave() {
    setSaving(true)
    let neueWehren
    if (modus === 'alle') {
      neueWehren = null
    } else if (nurEigeneWache && myProfile?.wehr_id) {
      const istChecked = (auswahl ?? []).includes(myProfile.wehr_id)
      const aktuelle = pruefung.sichtbar_fuer_wehren
      if (istChecked) {
        neueWehren = aktuelle === null ? null : [...new Set([...aktuelle, myProfile.wehr_id])]
      } else {
        if (aktuelle === null) {
          const { data: alleWehren } = await supabase.from('wehren').select('id')
          neueWehren = (alleWehren ?? []).map(w => w.id).filter(id => id !== myProfile.wehr_id)
        } else {
          neueWehren = aktuelle.filter(id => id !== myProfile.wehr_id)
        }
      }
    } else {
      neueWehren = auswahl?.length > 0 ? auswahl : []
    }
    await supabase.from('pruefungen').update({ sichtbar_fuer_wehren: neueWehren }).eq('id', pruefung.id)
    setModal(false); setSaving(false); onToggle()
  }

  return (
    <>
      <button className="btn btn-sm btn-secondary" onClick={oeffnen} title="Sichtbarkeit fuer Wachen einstellen">🏠 Wachen</button>
      {modal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>Sichtbarkeit: {pruefung.titel}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(false)}>x</button>
            </div>
            <div className="form-group">
              <label>Pruefung sichtbar fuer</label>
              {nurEigeneWache ? (
                <div className="alert alert-info" style={{ marginTop: 6, fontSize: 13 }}>Als Wehrleiter koennen Sie Pruefungen nur fuer Ihre eigene Wache freigeben.</div>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button type="button" className={`btn btn-sm ${modus === 'alle' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setModus('alle')}>Alle Wachen</button>
                  <button type="button" className={`btn btn-sm ${modus === 'ausgewaehlte' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setModus('ausgewaehlte')}>Nur bestimmte</button>
                </div>
              )}
            </div>
            {modus === 'ausgewaehlte' && (
              <div className="form-group">
                <label>Wachen auswaehlen</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                  {wehren.map(w => {
                    const aktiv = (auswahl ?? []).includes(w.id)
                    return (
                      <label key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: `1px solid ${aktiv ? 'var(--red)' : 'var(--gray-200)'}`, cursor: 'pointer', background: aktiv ? 'var(--red-pale)' : 'white' }}>
                        <input type="checkbox" checked={aktiv} onChange={() => toggleWehr(w.id)} style={{ width: 'auto' }} />
                        <span style={{ fontWeight: aktiv ? 500 : 400, color: aktiv ? 'var(--red-dark)' : 'var(--gray-700)' }}>{w.name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Speichern...' : 'Speichern'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
