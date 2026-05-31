import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { BrowserMultiFormatReader, NotFoundException, BarcodeFormat, DecodeHintType } from '@zxing/library'

const LS_KEY = 'geraetewart_liste'

function ladeListe() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') } catch { return [] }
}
function speichereListe(liste) {
  localStorage.setItem(LS_KEY, JSON.stringify(liste))
}

export default function GeraetewartPage() {
  const { profile } = useAuth()
  const [pruefungsarten, setPruefungsarten] = useState([])
  const [liste, setListe] = useState(ladeListe)
  const [seriennummer, setSeriennummer] = useState('')
  const [artId, setArtId] = useState('')
  const [notiz, setNotiz] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [torchOn, setTorchOn] = useState(false)
  const [hasTorch, setHasTorch] = useState(false)
  const [mailStatus, setMailStatus] = useState(null)
  const [wehrEmail, setWehrEmail] = useState('')
  const videoRef = useRef(null)
  const readerRef = useRef(null)
  const streamRef = useRef(null)

  useEffect(() => {
    supabase.from('pruefungsarten').select('*').order('reihenfolge').order('name').then(({ data }) => {
      setPruefungsarten(data ?? [])
      if (data?.length > 0 && !artId) setArtId(data[0].id)
    })
    supabase.from('wehren').select('einsatzbericht_email').eq('id', profile?.wehr_id).single().then(({ data }) => {
      setWehrEmail(data?.einsatzbericht_email ?? '')
    })
    return () => stopScanner()
  }, [])

  useEffect(() => { speichereListe(liste) }, [liste])

  async function startScanner() {
    setScanError('')
    setTorchOn(false)
    setHasTorch(false)
    setScanning(true)

    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.ITF,
    ])
    hints.set(DecodeHintType.TRY_HARDER, true)
    hints.set(DecodeHintType.ALLOWED_LENGTHS, [6, 8, 10, 12, 14])

    const reader = new BrowserMultiFormatReader(hints)
    readerRef.current = reader

    try {
      // Kamera-Stream direkt holen um Torch-Zugriff zu haben
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()

      // Prüfen ob Taschenlampe verfügbar
      const track = stream.getVideoTracks()[0]
      const capabilities = track.getCapabilities?.()
      if (capabilities?.torch) setHasTorch(true)

      // ZXing kontinuierlich auf das laufende Video-Element ansetzen
      reader.decodeFromVideoElementContinuously(videoRef.current, (result, err) => {
        if (result) {
          setSeriennummer(result.getText())
          stopScanner()
        }
        // NotFoundException ist normal (kein Barcode im Frame) — ignorieren
      })
    } catch (e) {
      setScanError('Kamera konnte nicht gestartet werden: ' + e.message)
      setScanning(false)
    }
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] })
      setTorchOn(next)
    } catch (e) {
      setScanError('Taschenlampe nicht verfügbar.')
    }
  }

  function stopScanner() {
    readerRef.current?.reset()
    // Stream-Tracks stoppen (Kamera-LED aus)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setTorchOn(false)
    setScanning(false)
  }

  function hinzufuegen(e) {
    e.preventDefault()
    const sn = seriennummer.trim()
    if (!sn || !artId) return
    const art = pruefungsarten.find(a => a.id === artId)
    const eintrag = {
      id: Date.now(),
      seriennummer: sn,
      artId,
      artName: art?.name ?? '',
      notiz: notiz.trim(),
      uhrzeit: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      datum: new Date().toLocaleDateString('de-DE'),
    }
    setListe(prev => [...prev, eintrag])
    setSeriennummer('')
    setNotiz('')
  }

  function loeschen(id) {
    setListe(prev => prev.filter(e => e.id !== id))
  }

  function listeLeeren() {
    setListe([])
    localStorage.removeItem(LS_KEY)
  }

  async function mailSenden() {
    if (!profile?.wehr_id) { alert('Du bist keiner Wache zugeordnet.'); return }

    const datum = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const name = `${profile?.vorname ?? ''} ${profile?.nachname ?? ''}`.trim()

    const gruppen = pruefungsarten
      .map(art => ({ art, eintraege: liste.filter(e => e.artId === art.id) }))
      .filter(g => g.eintraege.length > 0)
    const sonstigeEintraege = liste.filter(e => !pruefungsarten.find(a => a.id === e.artId))

    const alleGruppen = [
      ...gruppen,
      ...(sonstigeEintraege.length > 0 ? [{ art: { name: 'Sonstige' }, eintraege: sonstigeEintraege }] : [])
    ]

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 14px; color: #222; }
  h2 { margin-bottom: 4px; }
  p { margin: 2px 0 16px; color: #555; }
  h3 { margin: 24px 0 6px; font-size: 15px; border-bottom: 2px solid #c0392b; padding-bottom: 4px; color: #c0392b; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 8px; }
  th { background: #c0392b; color: white; padding: 7px 12px; text-align: left; font-size: 13px; }
  td { padding: 7px 12px; border-bottom: 1px solid #eee; font-size: 13px; }
  tr:last-child td { border-bottom: none; }
  .sn { font-family: monospace; font-size: 14px; font-weight: bold; }
  .footer { margin-top: 32px; font-size: 11px; color: #aaa; border-top: 1px solid #eee; padding-top: 8px; }
</style>
</head>
<body>
  <h2>Pruefprotokoll ${datum}</h2>
  <p>Erstellt von: <strong>${name}</strong></p>
  ${alleGruppen.map(g => `
    <h3>${g.art.name} (${g.eintraege.length})</h3>
    <table>
      <thead><tr><th>Seriennummer</th><th>Uhrzeit</th><th>Notiz</th></tr></thead>
      <tbody>
        ${g.eintraege.map(e => `
          <tr>
            <td class="sn">${e.seriennummer}</td>
            <td>${e.uhrzeit}</td>
            <td>${e.notiz || '–'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`).join('')}
  <div class="footer">Erstellt mit Feuerwehr-Organisationstool</div>
</body>
</html>`

    const plainText = alleGruppen.map(g =>
      `${g.art.name}:\n` + g.eintraege.map(e =>
        `  ${e.seriennummer}\t${e.uhrzeit}${e.notiz ? '\t' + e.notiz : ''}`
      ).join('\n')
    ).join('\n\n')

    setMailStatus('sending')
    try {
      const { data, error } = await supabase.functions.invoke('send-document-email', {
        body: {
          wehr_id: profile.wehr_id,
          email_feld: 'einsatzbericht_email',
          titel: `Pruefprotokoll ${datum} – ${name}`,
          html_body: htmlBody,
          text_body: plainText,
        },
      })
      if (error || !data?.success) {
        setMailStatus('error:' + (data?.error || error?.message || 'Unbekannter Fehler'))
        setTimeout(() => setMailStatus(null), 8000)
      } else {
        setMailStatus('ok')
        listeLeeren()
        setTimeout(() => setMailStatus(null), 3000)
      }
    } catch (err) {
      setMailStatus('error:' + err.message)
      setTimeout(() => setMailStatus(null), 8000)
    }
  }

  const gruppen = pruefungsarten
    .map(art => ({ art, eintraege: liste.filter(e => e.artId === art.id) }))
    .filter(g => g.eintraege.length > 0)

  const sonstige = liste.filter(e => !pruefungsarten.find(a => a.id === e.artId))

  return (
    <div style={{ maxWidth: 680 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Geraetewart</h1>
      <p style={{ color: 'var(--gray-400)', fontSize: 14, marginBottom: 24 }}>
        Geraete erfassen, Pruefung dokumentieren und als E-Mail versenden.
      </p>

      {/* Erfassungsformular */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>Geraet erfassen</div>

        {scanning ? (
          <div style={{ marginBottom: 16 }}>
            {/* Kamera-View mit Scan-Overlay */}
            <div style={{ position: 'relative', width: '100%', borderRadius: 8, overflow: 'hidden', background: '#000' }}>
              <video ref={videoRef} style={{ width: '100%', display: 'block' }} playsInline muted />
              {/* Abdunkelungs-Overlay mit Scan-Fenster */}
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {/* Dunkle Bereiche oben/unten/links/rechts */}
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
                {/* Helles Scan-Fenster (Ausschnitt) */}
                <div style={{
                  position: 'absolute',
                  top: '25%', left: '10%', right: '10%', height: '35%',
                  background: 'transparent',
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                  borderRadius: 8,
                }}>
                  {/* Ecken-Markierungen */}
                  {[['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(([v,h]) => (
                    <div key={v+h} style={{ position: 'absolute', [v]: -1, [h]: -1, width: 28, height: 28,
                      borderTop: v === 'top' ? '3px solid #c0392b' : 'none',
                      borderBottom: v === 'bottom' ? '3px solid #c0392b' : 'none',
                      borderLeft: h === 'left' ? '3px solid #c0392b' : 'none',
                      borderRight: h === 'right' ? '3px solid #c0392b' : 'none',
                      borderRadius: h === 'left' && v === 'top' ? '4px 0 0 0' : h === 'right' && v === 'top' ? '0 4px 0 0' : h === 'left' ? '0 0 0 4px' : '0 0 4px 0',
                    }} />
                  ))}
                  {/* Scan-Linie */}
                  <div style={{
                    position: 'absolute', left: 0, right: 0, top: '50%',
                    height: 1, background: 'rgba(192,57,43,0.6)',
                  }} />
                </div>
              </div>
              {/* Hinweis-Text */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                padding: '8px 12px', background: 'rgba(0,0,0,0.6)',
                color: 'white', fontSize: 12, textAlign: 'center',
              }}>
                Barcode in den roten Rahmen halten
              </div>
            </div>

            {/* Buttons unter dem Scanner */}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={stopScanner} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>
                ✕ Scanner schliessen
              </button>
              {hasTorch && (
                <button onClick={toggleTorch} className="btn btn-sm" style={{
                  flex: 1,
                  background: torchOn ? '#a16207' : 'var(--gray-600)',
                  color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer',
                }}>
                  {torchOn ? '🔦 Licht aus' : '🔦 Licht an'}
                </button>
              )}
            </div>
            {scanError && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 6 }}>{scanError}</div>}
          </div>
        ) : null}

        <form onSubmit={hinzufuegen} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-control"
              value={seriennummer}
              onChange={e => setSeriennummer(e.target.value)}
              placeholder="Seriennummer (z.B. NO0015532)"
              style={{ flex: 1 }}
              required
            />
            <button type="button" onClick={scanning ? stopScanner : startScanner}
              className="btn btn-secondary"
              title="QR/Barcode scannen"
              style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconScan /> Scan
            </button>
          </div>

          <select className="form-control" value={artId} onChange={e => setArtId(e.target.value)} required>
            {pruefungsarten.length === 0
              ? <option value="">Keine Pruefungsarten angelegt</option>
              : pruefungsarten.map(a => <option key={a.id} value={a.id}>{a.name}</option>)
            }
          </select>

          <input
            className="form-control"
            value={notiz}
            onChange={e => setNotiz(e.target.value)}
            placeholder="Notiz (optional)"
          />

          <button type="submit" className="btn btn-primary" disabled={!seriennummer.trim() || !artId}>
            + Hinzufuegen
          </button>
        </form>
      </div>

      {/* Pruef-Liste */}
      {liste.length > 0 && (
        <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              Pruef-Liste ({liste.length} {liste.length === 1 ? 'Eintrag' : 'Eintraege'})
            </div>
            <button onClick={listeLeeren} className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', fontSize: 12 }}>
              Liste leeren
            </button>
          </div>

          {gruppen.map(({ art, eintraege }) => (
            <div key={art.id}>
              <div style={{
                padding: '8px 16px', fontSize: 11, fontWeight: 600, letterSpacing: '0.07em',
                textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)',
                background: 'var(--gray-700)',
              }}>
                {art.name} ({eintraege.length})
              </div>
              {eintraege.map((e, i) => (
                <EintragZeile key={e.id} eintrag={e} onDelete={() => loeschen(e.id)}
                  isLast={i === eintraege.length - 1} />
              ))}
            </div>
          ))}

          {sonstige.length > 0 && (
            <div>
              <div style={{ padding: '8px 16px', fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', background: 'var(--gray-700)' }}>
                Sonstige ({sonstige.length})
              </div>
              {sonstige.map((e, i) => (
                <EintragZeile key={e.id} eintrag={e} onDelete={() => loeschen(e.id)}
                  isLast={i === sonstige.length - 1} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mail-Button */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          onClick={mailSenden}
          className="btn btn-primary"
          disabled={liste.length === 0 || mailStatus === 'sending'}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <IconMail />
          {mailStatus === 'sending' ? 'Wird gesendet...' : 'Protokoll per E-Mail senden'}
        </button>
        {mailStatus === 'ok' && (
          <span style={{ fontSize: 13, color: 'green', fontWeight: 500 }}>✓ Gesendet, Liste geleert</span>
        )}
        {mailStatus?.startsWith('error:') && (
          <span style={{ fontSize: 13, color: 'var(--red)', fontWeight: 500 }}>Fehler: {mailStatus.slice(6)}</span>
        )}
        {!mailStatus && !wehrEmail && (
          <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Keine Einsatz-E-Mail konfiguriert</span>
        )}
      </div>

      {liste.length === 0 && (
        <div style={{ marginTop: 32, textAlign: 'center', color: 'var(--gray-300)', fontSize: 14 }}>
          Noch keine Geraete erfasst.
        </div>
      )}
    </div>
  )
}

function EintragZeile({ eintrag, onDelete, isLast }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '11px 16px',
      borderBottom: isLast ? 'none' : '1px solid var(--gray-100)',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14, fontFamily: 'monospace' }}>{eintrag.seriennummer}</div>
        {eintrag.notiz && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{eintrag.notiz}</div>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--gray-400)', flexShrink: 0 }}>{eintrag.uhrzeit}</div>
      <button onClick={onDelete} className="btn btn-ghost btn-sm"
        style={{ color: 'var(--red)', padding: '4px 8px', flexShrink: 0 }}>✕</button>
    </div>
  )
}

function IconScan({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>
    <path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
    <line x1="7" y1="12" x2="17" y2="12"/>
  </svg>
}

function IconMail({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
}
