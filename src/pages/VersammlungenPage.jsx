import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────
function dateiname(datum, name) {
  const d = datum ? new Date(datum) : new Date()
  const ymd = format(d, 'yyyy-MM-dd')
  const slug = name.replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, '').replace(/\s+/g, '-')
  return `${ymd}-${slug}`
}

function druckeProtokoll(v) {
  const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><title>${v.name}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11pt; padding: 20mm; max-width: 800px; margin: 0 auto; }
  h1 { font-size: 16pt; margin-bottom: 4mm; }
  .meta { font-size: 10pt; color: #666; margin-bottom: 10mm; border-bottom: 1px solid #ccc; padding-bottom: 4mm; }
  pre { white-space: pre-wrap; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.6; }
  @media print { @page { size: A4; margin: 20mm; } }
</style>
</head>
<body>
<h1>${v.name}</h1>
<div class="meta">Datum: ${format(new Date(v.datum), 'dd.MM.yyyy', { locale: de })} · Abgeschlossen: ${v.abgeschlossen_am ? format(new Date(v.abgeschlossen_am), 'dd.MM.yyyy HH:mm', { locale: de }) : '—'}</div>
<pre>${v.protokoll_text ?? ''}</pre>
<script>window.onload = function(){ window.print() }<\/script>
</body></html>`
  const w = window.open('', '_blank')
  w.document.write(html)
  w.document.close()
}

// ── Haupt-Komponente ─────────────────────────────────────────────────────────
export default function VersammlungenPage() {
  const { profile } = useAuth()
  const isGbm = profile?.rolle === 'gemeindebrandmeister'
  const kannAufnehmen = ['gemeindebrandmeister', 'wehrleiter'].includes(profile?.rolle)

  const [versammlungen, setVersammlungen] = useState([])
  const [loading, setLoading] = useState(true)
  const [aufnahmeModal, setAufnahmeModal] = useState(false)
  const [editModal, setEditModal] = useState(null)   // { ...versammlung }
  const [detailModal, setDetailModal] = useState(null) // abgeschlossene Versammlung lesen
  const [msg, setMsg] = useState('')

  useEffect(() => { laden() }, [])

  async function laden() {
    const { data } = await supabase
      .from('versammlungen')
      .select('*, erstellt_von:profiles(vorname,nachname)')
      .order('datum', { ascending: false })
    setVersammlungen(data ?? [])
    setLoading(false)
  }

  async function abschliessen(v) {
    if (!confirm(`Protokoll "${v.name}" wirklich abschließen? Es kann danach nicht mehr bearbeitet werden.`)) return
    await supabase.from('versammlungen').update({ status: 'abgeschlossen', abgeschlossen_am: new Date().toISOString() }).eq('id', v.id)
    laden()
    setMsg('Protokoll abgeschlossen ✓')
    setTimeout(() => setMsg(''), 3000)
  }

  async function loeschen(v) {
    if (!confirm(`Versammlung "${v.name}" wirklich löschen?`)) return
    await supabase.from('versammlungen').delete().eq('id', v.id)
    laden()
  }

  const entwuerfe = versammlungen.filter(v => v.status === 'entwurf')
  const abgeschlossen = versammlungen.filter(v => v.status === 'abgeschlossen')

  if (loading) return <div className="loading-page"><div className="spinner" /></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Versammlungen</h1>
          <p style={{ marginTop: 4 }}>Protokolle zu Dienstbesprechungen und Versammlungen</p>
        </div>
        {msg && <div className="alert alert-success" style={{ margin: 0, padding: '8px 14px' }}>{msg}</div>}
        {kannAufnehmen && (
          <button className="btn btn-primary" onClick={() => setAufnahmeModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>
            Neue Versammlung
          </button>
        )}
      </div>

      {/* Entwürfe */}
      {isGbm && entwuerfe.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Entwürfe ({entwuerfe.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {entwuerfe.map(v => (
              <div key={v.id} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 22, flexShrink: 0 }}>📝</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--gray-800)' }}>{v.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
                    {format(new Date(v.datum), 'dd.MM.yyyy', { locale: de })}
                    {v.erstellt_von && ` · ${v.erstellt_von.vorname} ${v.erstellt_von.nachname}`}
                    {v.protokoll_text ? ' · Protokoll vorhanden' : ' · Kein Protokoll'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => setEditModal({ ...v })}>
                    ✏️ Bearbeiten
                  </button>
                  {v.protokoll_text && (
                    <button className="btn btn-sm btn-primary" onClick={() => abschliessen(v)}>
                      ✓ Abschließen
                    </button>
                  )}
                  <button className="btn btn-sm btn-danger" onClick={() => loeschen(v)}>
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Abgeschlossene Protokolle */}
      <div>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
          Protokolle ({abgeschlossen.length})
        </h3>
        {abgeschlossen.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <p style={{ color: 'var(--gray-400)' }}>Noch keine abgeschlossenen Protokolle vorhanden.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {abgeschlossen.map(v => (
              <div key={v.id} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', cursor: 'pointer' }}
                onClick={() => setDetailModal(v)}>
                <div style={{ fontSize: 22, flexShrink: 0 }}>📄</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--gray-800)' }}>{v.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
                    {format(new Date(v.datum), 'dd.MM.yyyy', { locale: de })}
                    {' · '}
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{dateiname(v.datum, v.name)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button className="btn btn-sm btn-secondary" onClick={() => druckeProtokoll(v)}>
                    🖨️ PDF
                  </button>
                  {isGbm && (
                    <button className="btn btn-sm btn-danger" onClick={() => loeschen(v)}>
                      🗑
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Aufnahme-Modal */}
      {aufnahmeModal && (
        <AufnahmeModal
          onClose={() => setAufnahmeModal(false)}
          onSaved={() => { setAufnahmeModal(false); laden() }}
          profile={profile}
        />
      )}

      {/* Edit-Modal (GBM bearbeitet Protokoll) */}
      {editModal && (
        <EditModal
          versammlung={editModal}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); laden() }}
        />
      )}

      {/* Detail-Modal (Lesen) */}
      {detailModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setDetailModal(null)}>
          <div className="modal" style={{ maxWidth: 720, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>{detailModal.name}</h3>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
                  {format(new Date(detailModal.datum), 'dd.MM.yyyy', { locale: de })}
                  {detailModal.abgeschlossen_am && ` · Abgeschlossen: ${format(new Date(detailModal.abgeschlossen_am), 'dd.MM.yyyy HH:mm', { locale: de })}`}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setDetailModal(null)}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px' }}>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.7, color: 'var(--gray-700)' }}>
                {detailModal.protokoll_text ?? '(Kein Protokoll)'}
              </pre>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--gray-100)' }}>
              <button className="btn btn-secondary" onClick={() => setDetailModal(null)}>Schließen</button>
              <button className="btn btn-primary" onClick={() => druckeProtokoll(detailModal)}>🖨️ Als PDF drucken</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Aufnahme-Modal ────────────────────────────────────────────────────────────
function AufnahmeModal({ onClose, onSaved, profile }) {
  const [schritt, setSchritt] = useState('info') // 'info' | 'aufnahme' | 'generieren' | 'vorschau'
  const [name, setName] = useState('')
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10))
  const [transkript, setTranskript] = useState('')
  const [protokoll, setProtokoll] = useState('')
  const [hoert, setHoert] = useState(false)
  const [fehler, setFehler] = useState('')
  const [generieren, setGenerieren] = useState(false)
  const [speichern, setSpeichern] = useState(false)
  const [wakeLockAktiv, setWakeLockAktiv] = useState(false)
  const [aufnahmeZeit, setAufnahmeZeit] = useState(0) // Sekunden
  const [laufendeSessionId, setLaufendeSessionId] = useState(null) // für Auto-Speichern
  const [letzterSave, setLetzterSave] = useState(null) // Zeitpunkt letztes Auto-Save

  const hoertRef = useRef(false)
  const erkennungRef = useRef(null)
  const transkriptRef = useRef('')
  const wakeLockRef = useRef(null)
  const timerRef = useRef(null)
  const autoSaveRef = useRef(null)
  const sessionIdRef = useRef(null)

  const sprachVerfuegbar = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  // Wake Lock anfordern – verhindert Bildschirm-Abdunkeln auf Mobilgeräten
  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen')
      setWakeLockAktiv(true)
      // Wake Lock neu anfordern wenn Seite wieder sichtbar wird (z.B. nach Tab-Wechsel)
      wakeLockRef.current.addEventListener('release', () => setWakeLockAktiv(false))
    } catch (_) { /* Wake Lock nicht verfügbar – kein Fehler */ }
  }

  function releaseWakeLock() {
    wakeLockRef.current?.release().catch(() => {})
    wakeLockRef.current = null
    setWakeLockAktiv(false)
  }

  // Seite wieder sichtbar → Wake Lock erneuern
  useEffect(() => {
    async function onVisibilityChange() {
      if (document.visibilityState === 'visible' && hoertRef.current) {
        await requestWakeLock()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  function starteErkennung() {
    if (!hoertRef.current) return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setFehler('Spracherkennung nicht verfügbar – bitte Chrome oder Edge nutzen'); return }
    const e = new SR()
    erkennungRef.current = e
    e.lang = 'de-DE'
    e.continuous = false
    e.interimResults = false
    e.maxAlternatives = 1
    e.onresult = ev => {
      const text = Array.from(ev.results).map(r => r[0].transcript).join(' ')
      transkriptRef.current = (transkriptRef.current + ' ' + text).trim()
      setTranskript(transkriptRef.current)
    }
    e.onend = () => { if (hoertRef.current) setTimeout(starteErkennung, 150) }
    e.onerror = err => {
      if (err.error === 'no-speech' || err.error === 'aborted') return
      hoertRef.current = false; setHoert(false)
      releaseWakeLock()
      clearInterval(timerRef.current)
    }
    try { e.start() } catch { hoertRef.current = false; setHoert(false); releaseWakeLock() }
  }

  // Auto-Speichern alle 60 Sekunden – schützt vor Datenverlust bei langen Versammlungen
  async function autoSpeichern() {
    if (!transkriptRef.current.trim()) return
    const jetzt = new Date().toISOString()
    if (sessionIdRef.current) {
      // Bestehenden Entwurf aktualisieren
      await supabase.from('versammlungen')
        .update({ transkript: transkriptRef.current })
        .eq('id', sessionIdRef.current)
    } else {
      // Ersten Entwurf anlegen
      const { data } = await supabase.from('versammlungen').insert({
        name: name || 'Laufende Aufnahme',
        datum,
        status: 'entwurf',
        transkript: transkriptRef.current,
        erstellt_von: profile.id,
      }).select('id').single()
      if (data?.id) {
        sessionIdRef.current = data.id
        setLaufendeSessionId(data.id)
      }
    }
    setLetzterSave(jetzt)
  }

  async function toggleAufnahme() {
    if (hoertRef.current) {
      // Stopp – einmal manuell speichern
      hoertRef.current = false
      setHoert(false)
      erkennungRef.current?.abort()
      releaseWakeLock()
      clearInterval(timerRef.current)
      clearInterval(autoSaveRef.current)
      await autoSpeichern()
    } else {
      // Start
      hoertRef.current = true
      setHoert(true)
      setAufnahmeZeit(0)
      await requestWakeLock()
      timerRef.current = setInterval(() => setAufnahmeZeit(t => t + 1), 1000)
      // Auto-Speichern alle 60 Sekunden
      autoSaveRef.current = setInterval(autoSpeichern, 60_000)
      starteErkennung()
    }
  }

  useEffect(() => () => {
    hoertRef.current = false
    erkennungRef.current?.abort()
    releaseWakeLock()
    clearInterval(timerRef.current)
    clearInterval(autoSaveRef.current)
  }, [])

  function formatZeit(sek) {
    const m = String(Math.floor(sek / 60)).padStart(2, '0')
    const s = String(sek % 60).padStart(2, '0')
    return `${m}:${s}`
  }

  async function generiereProtokoll() {
    if (!transkript.trim()) { setFehler('Bitte zuerst Versammlung aufnehmen'); return }
    setGenerieren(true); setFehler('')
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session?.session?.access_token
      const { data, error } = await supabase.functions.invoke('versammlung-protokoll', {
        body: { name, datum, transkript },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (error || !data?.protokoll) throw new Error(data?.error || error?.message || 'Fehler')
      setProtokoll(data.protokoll)
      setSchritt('vorschau')
    } catch (err) {
      setFehler('Protokoll-Generierung fehlgeschlagen: ' + err.message)
    }
    setGenerieren(false)
  }

  async function speichereEntwurf() {
    setSpeichern(true)
    let error
    if (sessionIdRef.current) {
      // Bereits auto-gespeicherter Entwurf → updaten
      ;({ error } = await supabase.from('versammlungen').update({
        name, datum, transkript: transkript || null, protokoll_text: protokoll || null,
      }).eq('id', sessionIdRef.current))
    } else {
      // Kein Auto-Save bisher → neu anlegen
      ;({ error } = await supabase.from('versammlungen').insert({
        name, datum, status: 'entwurf',
        transkript: transkript || null,
        protokoll_text: protokoll || null,
        erstellt_von: profile.id,
      }))
    }
    setSpeichern(false)
    if (error) { setFehler('Fehler: ' + error.message); return }
    onSaved()
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 620, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0 }}>Neue Versammlung</h3>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
              {schritt === 'info' ? 'Schritt 1: Informationen' : schritt === 'aufnahme' ? 'Schritt 2: Aufnahme' : schritt === 'generieren' ? 'Schritt 3: Protokoll erstellen' : 'Schritt 4: Vorschau & Speichern'}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px' }}>

          {/* Schritt 1: Name & Datum */}
          {schritt === 'info' && (
            <div>
              <div className="form-group">
                <label>Name der Versammlung</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="z.B. Dienstbesprechung Wache Nohra"
                  autoFocus
                />
                {name && (
                  <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
                    Dateiname: <code style={{ fontSize: 11 }}>{dateiname(datum, name)}</code>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Datum</label>
                <input type="date" value={datum} onChange={e => setDatum(e.target.value)} style={{ maxWidth: 200 }} />
              </div>
            </div>
          )}

          {/* Schritt 2: Aufnahme */}
          {schritt === 'aufnahme' && (
            <div>
              {!sprachVerfuegbar && (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>
                  ⚠️ Spracherkennung nicht verfügbar. Bitte <strong>Chrome</strong> oder <strong>Edge</strong> verwenden (kein Firefox/Safari).
                </div>
              )}

              <div style={{ textAlign: 'center', padding: '16px 0 20px' }}>
                <button
                  onClick={toggleAufnahme}
                  disabled={!sprachVerfuegbar}
                  style={{
                    width: 88, height: 88, borderRadius: '50%', border: 'none', cursor: sprachVerfuegbar ? 'pointer' : 'not-allowed',
                    background: hoert ? '#EF4444' : 'var(--red)',
                    color: 'white', fontSize: 32, transition: 'all 200ms',
                    boxShadow: hoert ? '0 0 0 10px rgba(239,68,68,0.2), 0 0 0 20px rgba(239,68,68,0.1)' : '0 2px 8px rgba(0,0,0,0.2)',
                    animation: hoert ? 'none' : undefined,
                  }}
                >
                  {hoert ? '⏹' : '🎤'}
                </button>

                {hoert && (
                  <div style={{ marginTop: 10, fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: '#EF4444', letterSpacing: 2 }}>
                    {formatZeit(aufnahmeZeit)}
                  </div>
                )}

                <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600, color: hoert ? '#EF4444' : 'var(--gray-500)' }}>
                  {hoert ? '● Aufnahme läuft...' : 'Aufnahme starten'}
                </div>

                {/* Wake Lock Status */}
                <div style={{ marginTop: 6, fontSize: 11, color: hoert ? (wakeLockAktiv ? '#15803D' : '#B45309') : 'var(--gray-400)' }}>
                  {hoert
                    ? wakeLockAktiv
                      ? '🔒 Bildschirm bleibt aktiv'
                      : '⚠️ Bildschirm-Sperre nicht verfügbar – Handy nicht sperren!'
                    : 'Sprecht in das Mikrofon – Text wird live erkannt'}
                </div>

                {/* Auto-Save Status */}
                {hoert && (
                  <div style={{ marginTop: 4, fontSize: 11, color: 'var(--gray-400)' }}>
                    💾 Auto-Speichern alle 60 Sek.
                    {letzterSave && ` · Zuletzt: ${new Date(letzterSave).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
                  </div>
                )}
              </div>

              {transkript && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', display: 'block', marginBottom: 6 }}>
                    TRANSKRIPT
                    <span style={{ fontWeight: 400, marginLeft: 6 }}>
                      {transkript.trim().split(/\s+/).length} Wörter
                      {transkript.trim().split(/\s+/).length > 8000 && (
                        <span style={{ color: '#B45309', marginLeft: 6 }}>
                          · ⚠️ Sehr langes Transkript – KI-Generierung kann einige Minuten dauern
                        </span>
                      )}
                    </span>
                  </label>
                  <textarea
                    value={transkript}
                    onChange={e => { setTranskript(e.target.value); transkriptRef.current = e.target.value }}
                    rows={8}
                    style={{ fontSize: 13, lineHeight: 1.6 }}
                    placeholder="Transkript erscheint hier..."
                  />
                  <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
                    Du kannst den Text manuell korrigieren.
                  </div>
                </div>
              )}

              {!transkript && (
                <div style={{ marginBottom: 16 }}>
                  <textarea
                    value={transkript}
                    onChange={e => { setTranskript(e.target.value); transkriptRef.current = e.target.value }}
                    rows={6}
                    placeholder="Oder Transkript manuell eingeben / einfügen..."
                    style={{ fontSize: 13, color: 'var(--gray-500)' }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Schritt 3/4: Generieren / Vorschau */}
          {(schritt === 'generieren' || schritt === 'vorschau') && (
            <div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Protokoll</span>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={generiereProtokoll} disabled={generieren} style={{ fontSize: 12 }}>
                    {generieren ? '⏳ Wird erstellt...' : '🔄 Neu generieren'}
                  </button>
                </label>
                <textarea
                  value={protokoll}
                  onChange={e => setProtokoll(e.target.value)}
                  rows={16}
                  style={{ fontSize: 13, lineHeight: 1.7, fontFamily: 'inherit' }}
                  placeholder="Protokoll wird hier erscheinen..."
                />
                <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
                  Du kannst das Protokoll direkt bearbeiten bevor du es speicherst.
                </div>
              </div>
            </div>
          )}

          {fehler && <div className="alert alert-error" style={{ marginTop: 8 }}>{fehler}</div>}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid var(--gray-100)' }}>
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <div style={{ display: 'flex', gap: 8 }}>
            {schritt === 'aufnahme' && (
              <button className="btn btn-secondary" onClick={() => setSchritt('info')}>← Zurück</button>
            )}
            {(schritt === 'generieren' || schritt === 'vorschau') && (
              <button className="btn btn-secondary" onClick={() => setSchritt('aufnahme')}>← Zurück</button>
            )}

            {schritt === 'info' && (
              <button className="btn btn-primary" onClick={() => setSchritt('aufnahme')} disabled={!name.trim()}>
                Weiter →
              </button>
            )}
            {schritt === 'aufnahme' && (
              <button className="btn btn-primary" onClick={() => { setSchritt('generieren'); generiereProtokoll() }} disabled={!transkript.trim()}>
                Protokoll erstellen →
              </button>
            )}
            {schritt === 'vorschau' && (
              <button className="btn btn-primary" onClick={speichereEntwurf} disabled={speichern || !protokoll.trim()}>
                {speichern ? 'Wird gespeichert...' : '💾 Als Entwurf speichern'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Edit-Modal (GBM bearbeitet Protokoll) ────────────────────────────────────
function EditModal({ versammlung, onClose, onSaved }) {
  const [name, setName] = useState(versammlung.name)
  const [datum, setDatum] = useState(versammlung.datum)
  const [protokoll, setProtokoll] = useState(versammlung.protokoll_text ?? '')
  const [saving, setSaving] = useState(false)
  const [fehler, setFehler] = useState('')

  async function speichern() {
    setSaving(true)
    const { error } = await supabase.from('versammlungen').update({
      name, datum, protokoll_text: protokoll,
    }).eq('id', versammlung.id)
    setSaving(false)
    if (error) { setFehler(error.message); return }
    onSaved()
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 720, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3>Protokoll bearbeiten</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px' }}>
          <div className="form-row">
            <div className="form-group">
              <label>Name der Versammlung</label>
              <input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Datum</label>
              <input type="date" value={datum} onChange={e => setDatum(e.target.value)} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 12 }}>
            Dateiname: <code>{dateiname(datum, name)}</code>
          </div>
          <div className="form-group">
            <label>Protokoll</label>
            <textarea
              value={protokoll}
              onChange={e => setProtokoll(e.target.value)}
              rows={18}
              style={{ fontSize: 13, lineHeight: 1.7, fontFamily: 'inherit' }}
            />
          </div>
          {fehler && <div className="alert alert-error">{fehler}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--gray-100)' }}>
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={speichern} disabled={saving}>
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
