import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { renderMd, findeVorschriftInRegelwerken } from '../lib/vorschriftSuche.jsx'

const COOLDOWN_SEK = 8 // Mindestabstand zwischen zwei KI-Anfragen

const KATEGORIE_META = {
  verkehrsunfall:          { label: 'Verkehrsunfall',        farbe: '#E8F4FD', textfarbe: '#1565C0', icon: '🚗' },
  wohnungsbrand:           { label: 'Wohnungsbrand',         farbe: '#FDE8E8', textfarbe: '#B91C1C', icon: '🔥' },
  technische_hilfeleistung:{ label: 'Techn. Hilfeleistung',  farbe: '#E8F8EE', textfarbe: '#1B5E20', icon: '🔧' },
  gefahrgut:               { label: 'Gefahrgut',             farbe: '#FFF3E0', textfarbe: '#E65100', icon: '☢️' },
  waldbrand:               { label: 'Waldbrand',             farbe: '#F3E5F5', textfarbe: '#6A1B9A', icon: '🌲' },
  sonstiges:               { label: 'Sonstiges',             farbe: '#F5F5F5', textfarbe: '#424242', icon: '📋' },
}

const SCHWIERIGKEIT_FARBE = {
  leicht: { bg: '#E8F5E9', text: '#2E7D32' },
  mittel: { bg: '#FFF8E1', text: '#F57F17' },
  schwer: { bg: '#FCE4EC', text: '#880E4F' },
}

const FUNKTION_META = [
  { key: 'gruppenfuehrer',  label: 'Gruppenführer',  kuerzel: 'GF',      icon: '🎯', farbe: '#3B82F6',
    beschreibung: 'Lageerkundung, Befehlsgebung, Kommunikation mit EL' },
  { key: 'melder',          label: 'Melder',          kuerzel: 'Me',      icon: '📻', farbe: '#8B5CF6',
    beschreibung: 'Meldungsübermittlung, Verbindungsdienst' },
  { key: 'angriffstrupp',   label: 'Angriffstrupp',   kuerzel: 'A-Trupp', icon: '🔥', farbe: '#EF4444',
    beschreibung: 'Brandbekämpfung, Menschenrettung, Atemschutz' },
  { key: 'wassertrupp',     label: 'Wassertrupp',     kuerzel: 'W-Trupp', icon: '💧', farbe: '#0EA5E9',
    beschreibung: 'Wasserversorgung, Strahlrohrbedienung' },
  { key: 'schlauchtrupp',   label: 'Schlauchtrupp',   kuerzel: 'S-Trupp', icon: '🔗', farbe: '#F59E0B',
    beschreibung: 'Schlauchmanagement, Wasserversorgung verlegen' },
  { key: 'maschinist',      label: 'Maschinist',      kuerzel: 'Ma',      icon: '⚙️', farbe: '#6B7280',
    beschreibung: 'Pumpenführung, Fahrzeugbedienung, Hydrant' },
]

const NOTE_META = {
  A: { bg: '#DCFCE7', text: '#15803D', label: 'Note A' },
  B: { bg: '#D1FAE5', text: '#065F46', label: 'Note B' },
  C: { bg: '#FEF3C7', text: '#B45309', label: 'Note C' },
  D: { bg: '#FEE2E2', text: '#B91C1C', label: 'Note D' },
}

function extrahiereNote(nachrichten) {
  if (!nachrichten?.length) return null
  for (let i = nachrichten.length - 1; i >= 0; i--) {
    const m = nachrichten[i]
    if (m.role === 'assistant' && m.content?.includes('🏁')) {
      const match = m.content.match(/Note\s+([A-D])\b/i)
      if (match) return match[1].toUpperCase()
    }
  }
  return null
}

// ── Nachricht-Renderer: parst das strukturierte Feedback-Format ──────────────
function NachrichtBlase({ msg, onVorschriftClick }) {
  const istUser = msg.role === 'user'

  if (istUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <div style={{
          maxWidth: '80%', background: 'var(--red)', color: 'white',
          borderRadius: '16px 16px 4px 16px', padding: '10px 14px',
          fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap',
        }}>
          {msg.content}
        </div>
      </div>
    )
  }

  // KI-Nachricht: Zeilen parsen und farblich markieren
  // Robustheit: "📖 VORSCHRIFT:\nFwDV 3 ..." → zusammenführen
  const roheZeilen = msg.content.split('\n')
  const zeilen = []
  for (let i = 0; i < roheZeilen.length; i++) {
    const z = roheZeilen[i]
    if (/^📖\s*(VORSCHRIFT:?\s*)$/.test(z.trim()) && i + 1 < roheZeilen.length) {
      zeilen.push(z.trimEnd() + ' ' + roheZeilen[i + 1].trim())
      i++ // nächste Zeile überspringen
    } else {
      zeilen.push(z)
    }
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
      <div style={{ maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>
            🎓
          </div>
          <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 500 }}>Ausbilder</span>
        </div>
        {/* Inhalt */}
        <div style={{ background: 'white', border: '1px solid var(--gray-100)', borderRadius: '4px 16px 16px 16px', overflow: 'hidden' }}>
          {zeilen.map((zeile, i) => {
            if (!zeile.trim()) return <div key={i} style={{ height: 6 }} />
            return <ZeileFormatiert key={i} zeile={zeile} onVorschriftClick={onVorschriftClick} />
          })}
        </div>
      </div>
    </div>
  )
}

function ZeileFormatiert({ zeile, onVorschriftClick }) {
  if (zeile.startsWith('✅')) {
    return (
      <div style={{ padding: '8px 14px', background: '#F0FDF4', borderLeft: '3px solid #16A34A', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <span style={{ flexShrink: 0, marginTop: 1 }}>✅</span>
        <span style={{ fontSize: 13, color: '#15803D', lineHeight: 1.5 }}>{renderMd(zeile.replace(/^✅\s*(RICHTIG:?\s*)?/, ''))}</span>
      </div>
    )
  }
  if (zeile.startsWith('❌')) {
    return (
      <div style={{ padding: '8px 14px', background: '#FFF1F2', borderLeft: '3px solid #E11D48', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <span style={{ flexShrink: 0, marginTop: 1 }}>❌</span>
        <span style={{ fontSize: 13, color: '#BE123C', lineHeight: 1.5 }}>{renderMd(zeile.replace(/^❌\s*(FEHLT:?\s*)?/, ''))}</span>
      </div>
    )
  }
  if (zeile.startsWith('📖')) {
    const referenzText = zeile.replace(/^📖\s*(VORSCHRIFT:?\s*)?/, '')
    return (
      <div
        onClick={() => onVorschriftClick?.(zeile)}
        style={{
          padding: '6px 14px', background: '#EEF2FF', borderLeft: '3px solid #6366F1',
          display: 'flex', gap: 6, alignItems: 'flex-start',
          cursor: onVorschriftClick ? 'pointer' : 'default',
          transition: 'background 120ms',
        }}
        onMouseEnter={e => { if (onVorschriftClick) e.currentTarget.style.background = '#E0E7FF' }}
        onMouseLeave={e => { e.currentTarget.style.background = '#EEF2FF' }}
        title={onVorschriftClick ? 'Tippen zum Nachschlagen' : undefined}
      >
        <span style={{ flexShrink: 0, marginTop: 1 }}>📖</span>
        <span style={{ fontSize: 12, color: '#4338CA', lineHeight: 1.5, fontStyle: 'italic' }}>
          {renderMd(referenzText)}
        </span>
        {onVorschriftClick && (
          <span style={{ flexShrink: 0, marginTop: 1, fontSize: 11, color: '#6366F1', marginLeft: 'auto', opacity: 0.7 }}>↗</span>
        )}
      </div>
    )
  }
  if (zeile.startsWith('▶')) {
    return (
      <div style={{ padding: '10px 14px', background: '#F8FAFC', borderLeft: '3px solid #475569', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <span style={{ flexShrink: 0, marginTop: 1 }}>▶</span>
        <span style={{ fontSize: 13, color: '#1E293B', fontWeight: 500, lineHeight: 1.5 }}>{renderMd(zeile.replace(/^▶\s*(SITUATION:?\s*)?/, ''))}</span>
      </div>
    )
  }
  if (zeile.startsWith('🏁')) {
    return (
      <div style={{ padding: '12px 14px', background: '#ECFDF5', borderLeft: '4px solid #059669', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ flexShrink: 0, marginTop: 1, fontSize: 18 }}>🏁</span>
        <span style={{ fontSize: 14, color: '#065F46', fontWeight: 600, lineHeight: 1.5 }}>{renderMd(zeile.replace(/^🏁\s*(ÜBUNG BEENDET:?\s*)?/, ''))}</span>
      </div>
    )
  }
  // Normale Zeile (z.B. Trennlinie --- oder freier Text)
  if (zeile === '---') return <hr style={{ border: 'none', borderTop: '1px solid var(--gray-100)', margin: '4px 14px' }} />
  return (
    <div style={{ padding: '4px 14px', fontSize: 13, color: 'var(--gray-700)', lineHeight: 1.5 }}>
      {renderMd(zeile)}
    </div>
  )
}

// ── Haupt-Komponente ─────────────────────────────────────────────────────────
export default function AusbildungChatPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const chatEndeRef = useRef(null)

  const [phase, setPhase] = useState('auswahl') // 'auswahl' | 'chat' | 'verlauf' | 'auswertung'
  const [szenarien, setSzenarien] = useState([])
  const [vergSessions, setVergSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [auswertungSessions, setAuswertungSessions] = useState([])
  const [auswertungLoading, setAuswertungLoading] = useState(false)
  const [funktionModal, setFunktionModal] = useState(null) // { szenario, fortsetzen? }

  const istAdmin = ['wehrleiter', 'gemeindebrandmeister', 'ausbilder'].includes(profile?.rolle)

  const [aktSession, setAktSession] = useState(null)
  const [nachrichten, setNachrichten] = useState([])
  const [eingabe, setEingabe] = useState('')
  const [ladend, setLadend] = useState(false)
  const [abgeschlossen, setAbgeschlossen] = useState(false)
  const [fehler, setFehler] = useState('')
  const [cooldown, setCooldown] = useState(0) // verbleibende Sekunden Wartezeit
  const cooldownRef = useRef(null)
  const [kiGuthaben, setKiGuthaben] = useState(null) // null = noch nicht geladen
  const [regelwerke, setRegelwerke] = useState([])   // { titel, inhalt_text }[]
  const [vorschriftModal, setVorschriftModal] = useState(null) // null | { referenz, dokTitel, abschnittText, gefunden }
  const [hoert, setHoert] = useState(false)          // Spracheingabe aktiv
  const erkennungRef = useRef(null)

  useEffect(() => { ladeDaten(); ladeGuthaben(); ladeRegelwerke() }, [])

  async function ladeGuthaben() {
    const { data } = await supabase
      .from('profiles')
      .select('ki_guthaben_cent')
      .eq('id', profile.id)
      .single()
    setKiGuthaben(data?.ki_guthaben_cent ?? 0)
  }

  async function ladeRegelwerke() {
    const { data } = await supabase
      .from('regelwerke')
      .select('titel, inhalt_text')
      .eq('aktiv', true)
      .not('inhalt_text', 'is', null)
    setRegelwerke(data ?? [])
  }

  function oeffneVorschriftModal(zeile) {
    setVorschriftModal(findeVorschriftInRegelwerken(zeile, regelwerke))
  }

  // Spracheingabe mit Web Speech API (Chrome, Edge, Opera)
  // Firefox: kein natives Support → Fehlermeldung
  const spracheVerfuegbar = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  function toggleSprache() {
    if (!spracheVerfuegbar) {
      alert('Spracheingabe wird von Firefox nicht unterstützt.\nBitte Chrome, Edge oder Opera verwenden.')
      return
    }

    if (hoert) {
      erkennungRef.current?.stop()
      // hoert → false wird durch onend gesetzt
      return
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const erkennung = new SR()
    erkennungRef.current = erkennung
    erkennung.lang = 'de-DE'
    erkennung.continuous = true      // Hört weiter bis explizit gestoppt
    erkennung.interimResults = false // Nur finale Ergebnisse
    erkennung.maxAlternatives = 1

    erkennung.onstart = () => setHoert(true)   // Erst hier → nach Mic-Freigabe
    erkennung.onresult = e => {
      // Alle neu finalisierten Segmente zusammensetzen
      let neu = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) neu += e.results[i][0].transcript + ' '
      }
      if (neu.trim()) setEingabe(prev => (prev ? prev.trimEnd() + ' ' : '') + neu.trimEnd())
    }
    erkennung.onend = () => setHoert(false)
    erkennung.onerror = err => {
      console.warn('Spracherkennung:', err.error)
      setHoert(false)
    }

    erkennung.start()
  }

  // Cooldown-Timer: zählt sekündlich runter
  function starteCooldown() {
    clearInterval(cooldownRef.current)
    setCooldown(COOLDOWN_SEK)
    cooldownRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  // Aufräumen beim Unmount
  useEffect(() => () => clearInterval(cooldownRef.current), [])

  useEffect(() => {
    chatEndeRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [nachrichten, ladend])

  async function ladeDaten() {
    const [{ data: sz }, { data: sess }] = await Promise.all([
      supabase.from('szenarien').select('*').eq('aktiv', true).order('kategorie').order('titel'),
      supabase.from('uebungs_sessions').select('id,szenario_id,szenario_titel,erstellt_am,abgeschlossen,nachrichten').eq('kamerad_id', profile.id).order('erstellt_am', { ascending: false }).limit(20),
    ])
    setSzenarien(sz ?? [])
    setVergSessions(sess ?? [])
    setLoading(false)
  }

  async function ladeAuswertung() {
    setAuswertungLoading(true)
    let q = supabase
      .from('uebungs_sessions')
      .select('id, szenario_titel, erstellt_am, abgeschlossen, nachrichten, kamerad:profiles!kamerad_id(vorname, nachname)')
      .order('erstellt_am', { ascending: false })
      .limit(200)
    if (profile?.rolle === 'wehrleiter' && profile?.wehr_id) {
      // Nur Kameraden der eigenen Wache
      const { data: kIds } = await supabase.from('profiles').select('id').eq('wehr_id', profile.wehr_id)
      if (kIds?.length) q = q.in('kamerad_id', kIds.map(k => k.id))
    }
    const { data } = await q
    setAuswertungSessions(data ?? [])
    setAuswertungLoading(false)
  }

  async function starteSzenario(szenario, funktion) {
    // Guthaben prüfen
    if (kiGuthaben !== null && kiGuthaben <= 0) {
      setFehler('💳 Kein KI-Guthaben vorhanden. Bitte den Wehrleiter um Aufladung bitten.')
      return
    }
    setFunktionModal(null)
    setFehler('')
    setLadend(true)
    setAbgeschlossen(false)
    setNachrichten([])

    // Sitzung in DB anlegen
    const { data: sess, error: sessErr } = await supabase.from('uebungs_sessions').insert({
      kamerad_id: profile.id,
      szenario_id: szenario.id,
      szenario_titel: szenario.titel,
      nachrichten: [],
    }).select().single()

    if (sessErr) {
      setFehler('Sitzung konnte nicht erstellt werden.')
      setLadend(false)
      return
    }

    const session = { ...sess, szenario, funktion }
    setAktSession(session)
    setPhase('chat')

    // Erste KI-Nachricht: Alarmierung starten
    const init = [{ role: 'user', content: 'Starte das Szenario. Beschreibe die Alarmierungsmeldung.' }]
    await rufKiAuf(init, session, szenario, funktion)
    setLadend(false)
  }

  async function zufallsSzenario() {
    if (!szenarien.length) return
    const zuf = szenarien[Math.floor(Math.random() * szenarien.length)]
    setFunktionModal({ szenario: zuf })
  }

  async function rufKiAuf(msgs, session, szenario, funktion) {
    const funk = funktion ?? session?.funktion
    const { data, error } = await supabase.functions.invoke('chat-ausbildung', {
      body: {
        nachrichten: msgs,
        szenario: `${szenario.anfangs_meldung}\n\nKategorie: ${szenario.kategorie}\nSchwierigkeit: ${szenario.schwierigkeitsgrad}`,
        kamerad_id: profile.id,
        funktion: funk ?? null,
      },
    })

    if (error || !data?.antwort) {
      const details = data?.error ?? error?.message ?? 'Unbekannter Fehler'

      if (details === 'KEIN_GUTHABEN') {
        setFehler('💳 Kein KI-Guthaben mehr vorhanden. Bitte den Wehrleiter um Aufladung bitten.')
        setKiGuthaben(0)
      } else if (String(details).includes('429')) {
        setFehler('⏱ Zu viele Anfragen in kurzer Zeit. Bitte 60 Sekunden warten und erneut senden.')
      } else {
        setFehler(`KI-Antwort fehlgeschlagen: ${details}`)
      }
      return
    }

    // Guthaben aus Antwort aktualisieren
    if (typeof data.guthaben_rest_cent === 'number') {
      setKiGuthaben(data.guthaben_rest_cent)
    }

    const kiNachricht = { role: 'assistant', content: data.antwort, ts: new Date().toISOString() }
    const aktualisiert = [
      ...msgs.filter(m => !(m.role === 'user' && m.content === 'Starte das Szenario. Beschreibe die Alarmierungsmeldung.')),
      kiNachricht,
    ]

    setNachrichten(aktualisiert)
    starteCooldown() // Schutz: 4 Sek. Pause nach jeder KI-Antwort

    // Session in DB speichern
    await supabase.from('uebungs_sessions').update({
      nachrichten: aktualisiert,
    }).eq('id', session.id)

    // Übung beendet?
    if (data.antwort.includes('🏁')) {
      setAbgeschlossen(true)
      await supabase.from('uebungs_sessions').update({
        abgeschlossen: true,
        beendet_am: new Date().toISOString(),
      }).eq('id', session.id)
    }
  }

  async function sendeNachricht(e) {
    e?.preventDefault()
    if (!eingabe.trim() || ladend || abgeschlossen || cooldown > 0) return
    setFehler('')

    const userMsg = { role: 'user', content: eingabe.trim(), ts: new Date().toISOString() }
    const neueNachrichten = [...nachrichten, userMsg]
    setNachrichten(neueNachrichten)
    setEingabe('')
    setLadend(true)

    await rufKiAuf(neueNachrichten, aktSession, aktSession.szenario, aktSession.funktion)
    setLadend(false)
  }

  async function beendeSession() {
    if (aktSession && !abgeschlossen) {
      await supabase.from('uebungs_sessions').update({
        abgeschlossen: true,
        beendet_am: new Date().toISOString(),
      }).eq('id', aktSession.id)
    }
    setPhase('auswahl')
    setAktSession(null)
    setNachrichten([])
    setAbgeschlossen(false)
    await ladeDaten()
  }

  function oeffneVerlauf(sess) {
    setNachrichten(sess.nachrichten ?? [])
    setAbgeschlossen(sess.abgeschlossen)
    setAktSession({ id: sess.id, szenario: { titel: sess.szenario_titel } })
    setPhase('verlauf')
  }

  async function fortsetzeSzenario(sess) {
    if (kiGuthaben !== null && kiGuthaben <= 0) {
      setFehler('💳 Kein KI-Guthaben vorhanden. Bitte den Wehrleiter um Aufladung bitten.')
      return
    }
    // Szenario-Daten ermitteln, dann Funktionswahl anzeigen
    const szenario = szenarien.find(s => s.id === sess.szenario_id)
      ?? { id: sess.szenario_id, titel: sess.szenario_titel, kategorie: 'sonstiges', anfangs_meldung: sess.szenario_titel ?? '', schwierigkeitsgrad: 'mittel' }
    setFehler('')
    setAbgeschlossen(false)
    setNachrichten(sess.nachrichten ?? [])
    setFunktionModal({ szenario, fortsetzen: sess })
  }

  async function waehlesFunktionUndStarte(funktion) {
    const { szenario, fortsetzen } = funktionModal
    if (fortsetzen) {
      // Bestehende Session fortsetzen
      setFunktionModal(null)
      setAktSession({ ...fortsetzen, szenario, funktion })
      setPhase('chat')
    } else {
      await starteSzenario(szenario, funktion)
    }
  }

  async function loescheSession(sess, e) {
    e.stopPropagation()
    if (!confirm(`Übung "${sess.szenario_titel ?? 'Unbekannt'}" wirklich löschen?`)) return
    await supabase.from('uebungs_sessions').delete().eq('id', sess.id)
    await ladeDaten()
  }

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  // ── Szenario-Auswahl ─────────────────────────────────────────────────────
  if (phase === 'auswahl') {
    const kategorien = [...new Set(szenarien.map(s => s.kategorie))]

    return (
      <div>
        <div className="page-header">
          <div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/ausbildung')} style={{ marginBottom: 8, padding: '4px 8px', fontSize: 12 }}>
              ← Zurück zur Ausbildung
            </button>
            <h1>Einsatz-Simulation</h1>
            <p style={{ marginTop: 4 }}>Wähle ein Szenario und übe dein taktisches Vorgehen</p>
          </div>
        </div>

        {/* Guthaben-Anzeige */}
        {kiGuthaben !== null && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', borderRadius: 10, marginBottom: 20,
            background: kiGuthaben <= 0 ? '#FFF1F2' : kiGuthaben < 20 ? '#FFF8E1' : '#F0FDF4',
            border: `1px solid ${kiGuthaben <= 0 ? '#FECDD3' : kiGuthaben < 20 ? '#FDE68A' : '#BBF7D0'}`,
          }}>
            <span style={{ fontSize: 16 }}>💳</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: kiGuthaben <= 0 ? '#BE123C' : kiGuthaben < 20 ? '#B45309' : '#15803D' }}>
              KI-Guthaben: {(kiGuthaben / 100).toFixed(2)} €
            </span>
            {kiGuthaben <= 0 && (
              <span style={{ fontSize: 12, color: '#BE123C' }}>– Bitte Wehrleiter kontaktieren</span>
            )}
            {kiGuthaben > 0 && kiGuthaben < 20 && (
              <span style={{ fontSize: 12, color: '#B45309' }}>– Guthaben fast aufgebraucht</span>
            )}
          </div>
        )}

        {/* Zufall-Button */}
        <div style={{ marginBottom: 24 }}>
          <button className="btn btn-primary" onClick={zufallsSzenario} disabled={kiGuthaben !== null && kiGuthaben <= 0}
            style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: kiGuthaben !== null && kiGuthaben <= 0 ? 0.5 : 1 }}>
            <span style={{ fontSize: 18 }}>🎲</span> Zufalls-Szenario starten
          </button>
        </div>

        {/* Szenarien nach Kategorie */}
        {kategorien.map(kat => {
          const meta = KATEGORIE_META[kat] ?? KATEGORIE_META.sonstiges
          const szInKat = szenarien.filter(s => s.kategorie === kat)
          return (
            <div key={kat} style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>{meta.icon}</span>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: meta.textfarbe }}>{meta.label}</h3>
                <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>{szInKat.length} Szenario{szInKat.length !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {szInKat.map(sz => {
                  const schw = SCHWIERIGKEIT_FARBE[sz.schwierigkeitsgrad] ?? SCHWIERIGKEIT_FARBE.mittel
                  return (
                    <button key={sz.id} onClick={() => setFunktionModal({ szenario: sz })}
                      style={{
                        background: meta.farbe, border: `1.5px solid ${meta.textfarbe}20`,
                        borderRadius: 12, padding: '14px 16px', textAlign: 'left', cursor: 'pointer',
                        transition: 'all 150ms', display: 'flex', flexDirection: 'column', gap: 8,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = meta.textfarbe + '60'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = meta.textfarbe + '20'; e.currentTarget.style.transform = 'none' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: meta.textfarbe, lineHeight: 1.3 }}>{sz.titel}</div>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 8, background: schw.bg, color: schw.text, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {sz.schwierigkeitsgrad}
                        </span>
                      </div>
                      {sz.beschreibung && (
                        <div style={{ fontSize: 12, color: meta.textfarbe, opacity: 0.7, lineHeight: 1.4 }}>
                          {sz.beschreibung}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: meta.textfarbe, fontWeight: 500, marginTop: 2 }}>
                        Übung starten →
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        {szenarien.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <p style={{ color: 'var(--gray-400)' }}>Noch keine Szenarien vorhanden.</p>
            <p style={{ color: 'var(--gray-400)', fontSize: 13, marginTop: 4 }}>Wehrleiter oder Ausbilder können Szenarien unter Administration → Szenarien anlegen.</p>
          </div>
        )}

        {/* ── Funktionswahl-Modal ──────────────────────────────────────────── */}
        {funktionModal && (
          <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setFunktionModal(null)}>
            <div className="modal" style={{ maxWidth: 480 }}>
              <div className="modal-header">
                <div>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                    {funktionModal.fortsetzen ? 'Übung fortsetzen' : 'Übung starten'}
                  </div>
                  <h3 style={{ margin: 0, fontSize: 15 }}>{funktionModal.szenario?.titel}</h3>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setFunktionModal(null)}>✕</button>
              </div>

              <p style={{ fontSize: 13, color: 'var(--gray-500)', margin: '4px 0 20px' }}>
                In welcher Funktion übst du heute?
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {FUNKTION_META.map(f => (
                  <button key={f.key}
                    onClick={() => waehlesFunktionUndStarte(f.key)}
                    disabled={ladend}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                      borderRadius: 10, border: `1.5px solid ${f.farbe}30`, background: `${f.farbe}08`,
                      cursor: 'pointer', textAlign: 'left', transition: 'all 150ms',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = `${f.farbe}18`; e.currentTarget.style.borderColor = `${f.farbe}60` }}
                    onMouseLeave={e => { e.currentTarget.style.background = `${f.farbe}08`; e.currentTarget.style.borderColor = `${f.farbe}30` }}
                  >
                    <span style={{ fontSize: 22, flexShrink: 0 }}>{f.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: f.farbe, marginBottom: 2 }}>
                        {f.label}
                        <span style={{ fontSize: 10, fontWeight: 500, marginLeft: 5, color: 'var(--gray-400)' }}>{f.kuerzel}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--gray-400)', lineHeight: 1.4 }}>{f.beschreibung}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Vergangene Sessions */}
        {vergSessions.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>Meine letzten Übungen</h3>
              {istAdmin && (
                <button className="btn btn-sm btn-secondary" onClick={() => { setPhase('auswertung'); ladeAuswertung() }}
                  style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                  📊 Alle Kameraden auswerten
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {vergSessions.map(sess => {
                const note = extrahiereNote(sess.nachrichten)
                const noteMeta = note ? NOTE_META[note] : null
                return (
                  <div key={sess.id} style={{ background: 'white', border: '1px solid var(--gray-100)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{sess.abgeschlossen ? '🏁' : '⏸️'}</span>
                    {/* Hauptinfo – klickbar für Verlauf */}
                    <button onClick={() => oeffneVerlauf(sess)}
                      style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-700)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                          {sess.szenario_titel ?? 'Unbekanntes Szenario'}
                        </span>
                        {noteMeta && (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 8, background: noteMeta.bg, color: noteMeta.text, flexShrink: 0 }}>
                            {noteMeta.label}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>
                        {format(new Date(sess.erstellt_am), 'dd.MM.yyyy HH:mm', { locale: de })}
                        {' · '}{(sess.nachrichten ?? []).filter(m => m.role === 'user').length} Antworten
                        {sess.abgeschlossen ? '' : ' · Unterbrochen'}
                      </div>
                    </button>
                    {/* Aktions-Buttons */}
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {!sess.abgeschlossen && (
                        <button className="btn btn-sm btn-primary" onClick={() => fortsetzeSzenario(sess)}
                          style={{ fontSize: 11, padding: '4px 10px' }}
                          disabled={kiGuthaben !== null && kiGuthaben <= 0}
                          title="Übung fortsetzen">
                          ▶ Weiter
                        </button>
                      )}
                      <button onClick={e => loescheSession(sess, e)}
                        style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'var(--gray-100)', color: 'var(--gray-400)', cursor: 'pointer', fontSize: 12 }}
                        title="Übung löschen">
                        🗑
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Auswertungs-Ansicht (Admin) ──────────────────────────────────────────
  if (phase === 'auswertung') {
    const noteStats = { A: 0, B: 0, C: 0, D: 0, offen: 0 }
    auswertungSessions.forEach(s => {
      const n = extrahiereNote(s.nachrichten)
      if (n) noteStats[n]++
      else noteStats.offen++
    })

    return (
      <div>
        <div className="page-header">
          <div>
            <button className="btn btn-ghost btn-sm" onClick={() => setPhase('auswahl')} style={{ marginBottom: 8, padding: '4px 8px', fontSize: 12 }}>
              ← Zurück
            </button>
            <h1>Auswertung – Alle Übungen</h1>
            <p style={{ marginTop: 4 }}>Abgelegte Einsatz-Simulationen aller Kameraden</p>
          </div>
        </div>

        {auswertungLoading ? (
          <div className="loading-page"><div className="spinner"></div></div>
        ) : (
          <>
            {/* Statistik-Kacheln */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10, marginBottom: 24 }}>
              {Object.entries(noteStats).map(([key, count]) => {
                const meta = key === 'offen' ? { bg: '#F1F5F9', text: '#64748B', label: 'Offen' } : NOTE_META[key]
                return (
                  <div key={key} style={{ background: meta.bg, borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: meta.text }}>{count}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: meta.text }}>{meta.label}</div>
                  </div>
                )
              })}
              <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--gray-600)' }}>{auswertungSessions.length}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-400)' }}>Gesamt</div>
              </div>
            </div>

            {/* Tabelle */}
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Kamerad</th>
                      <th>Szenario</th>
                      <th>Datum</th>
                      <th>Note</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auswertungSessions.length === 0 ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 32 }}>Noch keine Übungen abgelegt</td></tr>
                    ) : auswertungSessions.map(sess => {
                      const note = extrahiereNote(sess.nachrichten)
                      const noteMeta = note ? NOTE_META[note] : null
                      const antworten = (sess.nachrichten ?? []).filter(m => m.role === 'user').length
                      return (
                        <tr key={sess.id}>
                          <td style={{ fontWeight: 500 }}>
                            {sess.kamerad ? `${sess.kamerad.vorname} ${sess.kamerad.nachname}` : '–'}
                          </td>
                          <td style={{ fontSize: 13, color: 'var(--gray-600)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {sess.szenario_titel ?? '–'}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>
                            {format(new Date(sess.erstellt_am), 'dd.MM.yy HH:mm', { locale: de })}
                          </td>
                          <td>
                            {noteMeta ? (
                              <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: noteMeta.bg, color: noteMeta.text }}>
                                {noteMeta.label}
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: 'var(--gray-300)' }}>–</span>
                            )}
                          </td>
                          <td>
                            <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 8, background: sess.abgeschlossen ? '#ECFDF5' : '#FFF8E1', color: sess.abgeschlossen ? '#065F46' : '#B45309', fontWeight: 500 }}>
                              {sess.abgeschlossen ? `✓ ${antworten} Antworten` : `⏸ ${antworten} Antworten`}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── Chat-Ansicht (aktive Session oder Verlauf) ────────────────────────────
  const istVerlauf = phase === 'verlauf'
  const szenTitel = aktSession?.szenario?.titel ?? aktSession?.szenario_titel ?? 'Einsatz-Simulation'
  const szenMeta = aktSession?.szenario?.kategorie ? (KATEGORIE_META[aktSession.szenario.kategorie] ?? KATEGORIE_META.sonstiges) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', minHeight: 400 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={beendeSession} style={{ padding: '4px 8px', fontSize: 12, flexShrink: 0 }}>
          ← {istVerlauf ? 'Zurück' : abgeschlossen ? 'Zurück' : 'Abbrechen'}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {szenMeta && <span style={{ fontSize: 16 }}>{szenMeta.icon}</span>}
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {szenTitel}
            </span>
            {aktSession?.funktion && (() => {
              const f = FUNKTION_META.find(x => x.key === aktSession.funktion)
              return f ? (
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: `${f.farbe}15`, color: f.farbe, border: `1px solid ${f.farbe}30` }}>
                  {f.icon} {f.kuerzel}
                </span>
              ) : null
            })()}
            {abgeschlossen && <span style={{ fontSize: 11, padding: '2px 8px', background: '#ECFDF5', color: '#065F46', borderRadius: 10, fontWeight: 600 }}>Abgeschlossen</span>}
            {istVerlauf && !abgeschlossen && <span style={{ fontSize: 11, padding: '2px 8px', background: '#FFF8E1', color: '#F57F17', borderRadius: 10, fontWeight: 600 }}>Verlauf</span>}
          </div>
        </div>
        {!istVerlauf && kiGuthaben !== null && (
          <div style={{
            fontSize: 11, padding: '3px 9px', borderRadius: 8, flexShrink: 0,
            background: kiGuthaben <= 0 ? '#FFF1F2' : kiGuthaben < 20 ? '#FFF8E1' : '#F0FDF4',
            color: kiGuthaben <= 0 ? '#BE123C' : kiGuthaben < 20 ? '#B45309' : '#15803D',
            border: `1px solid ${kiGuthaben <= 0 ? '#FECDD3' : kiGuthaben < 20 ? '#FDE68A' : '#BBF7D0'}`,
          }}>
            💳 {(kiGuthaben / 100).toFixed(2)} €
          </div>
        )}
        {!istVerlauf && !abgeschlossen && (
          <button className="btn btn-secondary btn-sm" onClick={beendeSession} style={{ flexShrink: 0, fontSize: 12 }}>
            Übung beenden
          </button>
        )}
      </div>

      {/* Fehler */}
      {fehler && (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: 8, fontSize: 13, color: '#BE123C' }}>
          {fehler}
          <button onClick={() => setFehler('')} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 600 }}>✕</button>
        </div>
      )}

      {/* Nachrichten */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0', marginBottom: 8 }}>
        {nachrichten.length === 0 && ladend && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
            <div style={{ background: 'white', border: '1px solid var(--gray-100)', borderRadius: '4px 16px 16px 16px', padding: '12px 16px', display: 'flex', gap: 6, alignItems: 'center' }}>
              <div className="spinner" style={{ width: 16, height: 16 }}></div>
              <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>Szenario wird gestartet…</span>
            </div>
          </div>
        )}

        {nachrichten.map((msg, i) => (
          <NachrichtBlase key={i} msg={msg} onVorschriftClick={regelwerke.length > 0 ? oeffneVorschriftModal : null} />
        ))}

        {ladend && nachrichten.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
            <div style={{ background: 'white', border: '1px solid var(--gray-100)', borderRadius: '4px 16px 16px 16px', padding: '12px 16px', display: 'flex', gap: 6, alignItems: 'center' }}>
              <div className="spinner" style={{ width: 16, height: 16 }}></div>
              <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>Ausbilder bewertet…</span>
            </div>
          </div>
        )}

        {abgeschlossen && !istVerlauf && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <button className="btn btn-primary" onClick={beendeSession}>
              Neues Szenario wählen
            </button>
          </div>
        )}

        <div ref={chatEndeRef} />
      </div>

      {/* ── Vorschrift-Popup ──────────────────────────────────────────────────── */}
      {vorschriftModal && (
        <div
          className="modal-backdrop"
          onClick={e => e.target === e.currentTarget && setVorschriftModal(null)}
          style={{ zIndex: 1100 }}
        >
          <div className="modal" style={{ maxWidth: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Dienstvorschrift</div>
                <h3 style={{ margin: 0, fontSize: 15 }}>📖 {vorschriftModal.dokTitel}</h3>
                <div style={{ fontSize: 12, color: '#6366F1', fontStyle: 'italic', marginTop: 3 }}>{renderMd(vorschriftModal.referenz)}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setVorschriftModal(null)}>✕</button>
            </div>

            <div style={{ overflowY: 'auto', padding: '16px 20px', flex: 1 }}>
              {vorschriftModal.abschnittText ? (
                <div style={{ fontSize: 13, color: 'var(--gray-800)', lineHeight: 1.75, whiteSpace: 'pre-wrap', fontFamily: 'var(--mono, monospace)', background: '#F8FAFC', borderRadius: 8, padding: '12px 16px', border: '1px solid var(--gray-100)' }}>
                  {vorschriftModal.abschnittText}
                </div>
              ) : vorschriftModal.gefunden ? (
                <div style={{ color: 'var(--gray-500)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>🔍</div>
                  <div>Der genaue Abschnitt konnte im Dokument nicht gefunden werden.</div>
                  <div style={{ fontSize: 12, marginTop: 6, color: 'var(--gray-400)' }}>Das Regelwerk ist hinterlegt – der Abschnitt liegt möglicherweise außerhalb des indexierten Bereichs.</div>
                </div>
              ) : (
                <div style={{ color: 'var(--gray-500)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>📂</div>
                  <div>Dieses Regelwerk ist noch nicht hinterlegt.</div>
                  <div style={{ fontSize: 12, marginTop: 6, color: 'var(--gray-400)' }}>Bitte unter <strong>Administration → Regelwerke</strong> das entsprechende PDF hochladen.</div>
                </div>
              )}
            </div>

            <div style={{ flexShrink: 0, padding: '12px 20px', borderTop: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setVorschriftModal(null)}>Schließen</button>
            </div>
          </div>
        </div>
      )}

      {/* Eingabe (nur bei aktiver, nicht abgeschlossener Session) */}
      {!istVerlauf && !abgeschlossen && (
        <form onSubmit={sendeNachricht} style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--gray-100)', paddingTop: 12 }}>
          <textarea
            value={eingabe}
            onChange={e => setEingabe(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendeNachricht() } }}
            placeholder={hoert ? '🎤 Spreche jetzt…' : cooldown > 0 ? `Bitte ${cooldown} Sek. warten…` : 'Deine Antwort… (Enter zum Senden, Shift+Enter für neue Zeile)'}
            rows={2}
            disabled={ladend || cooldown > 0}
            style={{ flex: 1, resize: 'none', borderRadius: 10, padding: '8px 12px', fontSize: 13, border: `1.5px solid ${hoert ? '#EF4444' : 'var(--gray-200)'}`, lineHeight: 1.4, opacity: cooldown > 0 ? 0.6 : 1, transition: 'border-color 200ms' }}
          />
          {/* Mikrofon-Button */}
          <button
            type="button"
            onClick={toggleSprache}
            disabled={ladend || cooldown > 0}
            title={!spracheVerfuegbar ? 'Spracheingabe nicht verfügbar (Firefox)' : hoert ? 'Aufnahme stoppen' : 'Spracheingabe starten'}
            style={{
              alignSelf: 'flex-end', flexShrink: 0,
              width: 40, height: 40, borderRadius: 10, border: 'none',
              background: hoert ? '#EF4444' : 'var(--gray-100)',
              color: hoert ? 'white' : !spracheVerfuegbar ? 'var(--gray-300)' : 'var(--gray-500)',
              cursor: !spracheVerfuegbar || ladend || cooldown > 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, transition: 'all 200ms',
              opacity: !spracheVerfuegbar || ladend || cooldown > 0 ? 0.4 : 1,
              boxShadow: hoert ? '0 0 0 3px rgba(239,68,68,0.25)' : 'none',
            }}
          >
            {hoert ? '⏹' : '🎤'}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!eingabe.trim() || ladend || cooldown > 0}
            style={{ alignSelf: 'flex-end', padding: '8px 16px', flexShrink: 0, minWidth: 44 }}>
            {ladend ? '…' : cooldown > 0 ? `${cooldown}s` : '→'}
          </button>
        </form>
      )}
    </div>
  )
}
