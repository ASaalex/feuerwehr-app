import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { BrowserMultiFormatReader, NotFoundException, BarcodeFormat, DecodeHintType } from '@zxing/library'
import { useWakeLock } from '../hooks/useWakeLock'
import { geraetSuchen, pruefInfoSprechen } from '../data/pruefintervalle'

const LS_KEY = 'geraetewart_liste'

function ladeListe() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') } catch { return [] }
}
function speichereListe(liste) {
  localStorage.setItem(LS_KEY, JSON.stringify(liste))
}

export default function GeraetewartPage() {
  const { profile } = useAuth()
  useWakeLock()
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

  // Sprachsteuerung
  const [sprachAktiv, setSprachAktiv] = useState(false)
  const [sprachStatus, setSprachStatus] = useState('bereit') // bereit | seriennummer | pruefung | bemerkung
  const [sprachInfo, setSprachInfo] = useState('')
  const [sprachSn, setSprachSn] = useState('')
  const [sprachTippen, setSprachTippen] = useState(null) // iOS: Callback für manuelles Starten
  const [infoModal, setInfoModal] = useState(null) // { geraet, sprachCallback }
  const srRef = useRef(null)
  const pruefungsartenRef = useRef([])
  const artIdRef = useRef('')
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream

  useEffect(() => { pruefungsartenRef.current = pruefungsarten }, [pruefungsarten])
  useEffect(() => { artIdRef.current = artId }, [artId])

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
      BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
      BarcodeFormat.EAN_13,  BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,   BarcodeFormat.UPC_E,
      BarcodeFormat.QR_CODE, BarcodeFormat.ITF,
    ])
    hints.set(DecodeHintType.TRY_HARDER, true)

    const reader = new BrowserMultiFormatReader(hints)
    readerRef.current = reader

    try {
      // decodeFromVideoDevice startet Kamera intern + ist stabiler als manueller Stream
      await reader.decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
        if (result) {
          setSeriennummer(result.getText())
          stopScanner()
        }
      })

      // Stream nach Start holen (für Torch-Zugriff)
      const stream = videoRef.current?.srcObject
      if (stream) {
        streamRef.current = stream
        const track = stream.getVideoTracks?.()?.[0]
        const caps = track?.getCapabilities?.()
        if (caps?.torch) setHasTorch(true)
      }
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

  // ── Sprachsteuerung ──────────────────────────────────────────
  function spreche(text) {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'de-DE'
    u.rate = 1.05
    window.speechSynthesis.speak(u)
  }

  // Prüfungsart per Name oder Nummer erkennen
  function pruefungErkennen(text) {
    const norm = t => t.toLowerCase().replace(/[äöü]/g, c => ({ä:'ae',ö:'oe',ü:'ue'}[c])).replace(/[^a-z0-9 ]/g, '').trim()
    const input = norm(text)
    const arten = pruefungsartenRef.current

    // Per Nummer erkennen ("1", "zwei", "drei" etc.)
    const zahlwoerter = { 'eins':1,'ein':1,'eine':1,'zwei':2,'drei':3,'vier':4,'fünf':5,'fuenf':5,'sechs':6,'sieben':7,'acht':8,'neun':9,'zehn':10 }
    const nummerMatch = input.match(/\b(\d+|eins?|eine?|zwei|drei|vier|f[uü]nf|sechs|sieben|acht|neun|zehn)\b/)
    if (nummerMatch) {
      const nr = parseInt(nummerMatch[1]) || zahlwoerter[nummerMatch[1]] || 0
      if (nr >= 1 && nr <= arten.length) return arten[nr - 1]
    }

    // Per Name erkennen
    let treffer = arten.find(a => norm(a.name) === input)
    if (!treffer) treffer = arten.find(a => input.includes(norm(a.name)) || norm(a.name).includes(input))
    if (!treffer) {
      const woerter = input.split(/\s+/)
      treffer = arten.find(a => woerter.some(w => w.length > 3 && norm(a.name).includes(w)))
    }
    return treffer ?? null
  }

  const ABBRUCH_WORTE = ['abbrechen', 'abbruch', 'stopp', 'stop', 'zurück', 'zurueck', 'neustart']
  const WIEDERHOLEN_WORTE = ['nochmal', 'wiederholen', 'wiederholung', 'nocheinmal', 'neu']

  function istAbbruch(text) { return ABBRUCH_WORTE.some(w => text.toLowerCase().includes(w)) }
  function istWiederholen(text) { return WIEDERHOLEN_WORTE.some(w => text.toLowerCase().includes(w)) }

  function starteSprache() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Spracherkennung nicht unterstützt. Bitte Chrome oder Safari verwenden.'); return }
    setSprachAktiv(true)

    function hoere(naechsterStatus, onResult, wiederholen) {
      srRef.current?.abort()
      setSprachStatus(naechsterStatus)

      // Kleines Delay verhindert das "hängen" nach dem vorherigen Schritt
      setTimeout(() => {
        const neu = new SR()
        neu.lang = 'de-DE'
        neu.continuous = false
        neu.interimResults = false
        srRef.current = neu

        function starte() {
          let ergebnis = false
          neu.onresult = e => {
            ergebnis = true
            setSprachTippen(null)
            const text = e.results[0][0].transcript.trim()
            if (istAbbruch(text)) {
              spreche('Abgebrochen. Sage Prüfung für ein neues Gerät.')
              setSprachSn('')
              setSprachInfo('Abgebrochen — Sage „Prüfung" für ein neues Gerät')
              warteAufTrigger()
              return
            }
            if (istWiederholen(text) && wiederholen) {
              spreche('Okay, nochmal.')
              wiederholen()
              return
            }
            onResult(text)
          }
          neu.onerror = e => {
            setSprachTippen(null)
            if (e.error === 'no-speech') hoere(naechsterStatus, onResult, wiederholen)
            else setSprachInfo('Mikrofon-Fehler: ' + e.error)
          }
          neu.onend = () => {
            // Falls kein Ergebnis und kein Fehler kam → nochmal hören
            if (!ergebnis) setTimeout(() => hoere(naechsterStatus, onResult, wiederholen), 200)
          }
          try { neu.start() } catch {}
        }

        if (isIOS) {
          setSprachTippen(() => starte)
        } else {
          starte()
        }
      }, 300)
    }

    function warteAufTrigger() {
      setSprachStatus('bereit')
      setSprachInfo('Sage „Prüfung" um zu erfassen, oder „Info" für Prüfintervalle')
      hoere('bereit', text => {
        const t = text.toLowerCase()
        if (t.includes('prüfung') || t.includes('pruefung')) {
          spreche('Seriennummer bitte')
          setSprachInfo('Seriennummer sprechen…')
          warteAufSeriennummer()
        } else if (t.includes('info')) {
          // Gerätename aus dem Rest des Satzes extrahieren (z.B. "Info Wathose")
          const gerätName = text.replace(/info/gi, '').trim()
          if (gerätName) {
            zeigeInfo(gerätName)
          } else {
            spreche('Welches Gerät?')
            setSprachInfo('Gerätename sprechen…')
            hoere('bereit', geraetText => zeigeInfo(geraetText), null)
          }
        } else {
          warteAufTrigger()
        }
      }, null)
    }

    function zeigeInfo(gerätName) {
      const geraet = geraetSuchen(gerätName)
      if (geraet) {
        const infoText = pruefInfoSprechen(geraet)
        spreche(`${geraet.name}: ${infoText} Prüfanweisung anzeigen? Ja oder Nein.`)
        setSprachInfo(`Info: ${geraet.name}`)
        setInfoModal({ geraet, offen: true })
        // Auf Ja/Nein warten
        hoere('bereit', antwort => {
          const a = antwort.toLowerCase()
          if (a.includes('ja') || a.includes('anzeigen') || a.includes('zeigen') || a.includes('öffnen')) {
            if (geraet.pdfSeite) {
              window.open(`/305-002.pdf#page=${geraet.pdfSeite}`, '_blank')
              spreche(`Prüfanweisung wird auf Seite ${geraet.pdfSeite} geöffnet.`)
            } else {
              spreche('Keine Prüfanweisung verfügbar.')
            }
          } else {
            setInfoModal(null)
            spreche('Okay. Sage Prüfung für ein Gerät.')
          }
          warteAufTrigger()
        }, null)
      } else {
        spreche(`${gerätName} nicht gefunden. Sage Prüfung für ein Gerät.`)
        setSprachInfo(`"${gerätName}" nicht in Datenbank`)
        warteAufTrigger()
      }
    }

    function warteAufSeriennummer() {
      setSprachStatus('seriennummer')
      hoere('seriennummer', text => {
        const sn = text.toUpperCase().replace(/\s+/g, '').replace(/[.,!?]/g, '')
        setSprachSn(sn)
        setSeriennummer(sn)
        const pruefListe = pruefungsartenRef.current.map((a, i) => `${i + 1} ${a.name}`).join(', ')
        spreche(`Seriennummer ${sn}. Welche Prüfung? ${pruefListe}`)
        setSprachInfo(`Seriennummer: ${sn} — Prüfungsart als Name oder Nummer sprechen`)
        warteAufPruefung(sn)
      }, () => warteAufSeriennummer())
    }

    function warteAufPruefung(sn) {
      setSprachStatus('pruefung')
      hoere('pruefung', text => {
        const art = pruefungErkennen(text)
        if (art) {
          spreche(`${art.name} erkannt. Bemerkung sprechen, oder sage weiter.`)
          setSprachInfo(`Prüfung: ${art.name} — Bemerkung sprechen oder „weiter"`)
          warteAufBemerkung(sn, art)
        } else {
          const pruefListe = pruefungsartenRef.current.map((a, i) => `${i + 1} ${a.name}`).join(', ')
          spreche(`Nicht erkannt. Sage eine Nummer oder den Namen. ${pruefListe}`)
          setSprachInfo('Nicht erkannt — Name oder Nummer sprechen')
          warteAufPruefung(sn)
        }
      }, () => warteAufPruefung(sn))
    }

    function warteAufBemerkung(sn, art) {
      setSprachStatus('bemerkung')
      hoere('bemerkung', text => {
        const keineBemerkung = ['weiter', 'keine', 'nein', 'skip', 'überspringen', 'ueberspringen'].some(w => text.toLowerCase().includes(w))
        const bemerkung = keineBemerkung ? '' : text
        const uhrzeit = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
        const eintrag = { id: Date.now(), seriennummer: sn, artId: art.id, artName: art.name, notiz: bemerkung, uhrzeit, datum: new Date().toLocaleDateString('de-DE') }
        setListe(prev => [...prev, eintrag])
        setNotiz(bemerkung)
        setArtId(art.id)
        setSeriennummer('')
        setSprachSn('')
        const msg = bemerkung ? `Eingetragen mit Bemerkung: ${bemerkung}.` : 'Eingetragen.'
        spreche(`${msg} Sage Prüfung für das nächste Gerät.`)
        setSprachInfo('Eingetragen ✓ — Sage „Prüfung" für das nächste Gerät')
        setTimeout(warteAufTrigger, 400)
      }, () => warteAufBemerkung(sn, art))
    }

    warteAufTrigger()
  }

  function stoppeSprache() {
    srRef.current?.abort()
    window.speechSynthesis.cancel()
    setSprachAktiv(false)
    setSprachStatus('bereit')
    setSprachInfo('')
    setSprachSn('')
    setSprachTippen(null)
  }

  function loeschen(id) {
    setListe(prev => prev.filter(e => e.id !== id))
  }

  function aktualisieren(updated) {
    setListe(prev => prev.map(e => e.id === updated.id ? updated : e))
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

      {/* Info-Modal */}
      {infoModal?.offen && (
        <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>📋 {infoModal.geraet.name}</div>
            <button onClick={() => setInfoModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--gray-400)' }}>✕</button>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {infoModal.geraet.sichtpruefung && (
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: 4, flexShrink: 0 }}>Sichtprüfung</span>
                <span style={{ fontSize: 13 }}>{infoModal.geraet.sichtpruefung}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#065f46', background: '#d1fae5', padding: '2px 8px', borderRadius: 4, flexShrink: 0 }}>Regelmäßig</span>
              <span style={{ fontSize: 13 }}>{infoModal.geraet.regelmaessig}</span>
            </div>
            {infoModal.geraet.belastung && (
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#1e40af', background: '#dbeafe', padding: '2px 8px', borderRadius: 4, flexShrink: 0 }}>Belastung</span>
                <span style={{ fontSize: 13 }}>{infoModal.geraet.belastung}</span>
              </div>
            )}
            {infoModal.geraet.hinweis && (
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#7c3aed', background: '#ede9fe', padding: '2px 8px', borderRadius: 4, flexShrink: 0 }}>Hinweis</span>
                <span style={{ fontSize: 13 }}>{infoModal.geraet.hinweis}</span>
              </div>
            )}
            {infoModal.geraet.norm && (
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
                Norm: {infoModal.geraet.norm} · Quelle: DGUV 305-002
              </div>
            )}
          </div>
          {infoModal.geraet.pdfSeite ? (
            <button
              onClick={() => window.open(`/305-002.pdf#page=${infoModal.geraet.pdfSeite}`, '_blank')}
              className="btn btn-sm btn-secondary"
              style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              📄 Prüfanweisung öffnen (Seite {infoModal.geraet.pdfSeite})
            </button>
          ) : (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--gray-400)' }}>
              Keine Prüfanweisung im Dokument verfügbar.
            </div>
          )}
        </div>
      )}

      {/* Sprachsteuerung */}
      <div style={{
        background: sprachAktiv ? (sprachStatus === 'seriennummer' ? '#eff6ff' : sprachStatus === 'pruefung' ? '#f0fdf4' : '#fefce8') : 'var(--white)',
        border: `1px solid ${sprachAktiv ? (sprachStatus === 'seriennummer' ? '#93c5fd' : sprachStatus === 'pruefung' ? '#86efac' : '#fde047') : 'var(--gray-200)'}`,
        borderRadius: 10, padding: 16, marginBottom: 16,
        transition: 'all 300ms',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>🎤 Sprachsteuerung</div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
              {sprachAktiv ? sprachInfo : 'Freihändige Erfassung per Sprache'}
            </div>
          </div>
          <button
            onClick={sprachAktiv ? stoppeSprache : starteSprache}
            className="btn btn-sm"
            style={{
              background: sprachAktiv ? '#ef4444' : 'var(--red)', color: 'white', border: 'none',
              borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', flexShrink: 0,
              boxShadow: sprachAktiv ? '0 0 0 4px rgba(239,68,68,0.2)' : 'none',
            }}
          >
            {sprachAktiv ? '⏹ Stopp' : '🎤 Starten'}
          </button>
        </div>
        {sprachAktiv && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Status-Badge + Seriennummer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                background: sprachStatus === 'bereit' ? '#fef08a' : sprachStatus === 'seriennummer' ? '#bfdbfe' : sprachStatus === 'pruefung' ? '#bbf7d0' : '#f3e8ff',
                color: '#374151',
              }}>
                {sprachStatus === 'bereit' ? '👂 Warte auf „Prüfung"'
                  : sprachStatus === 'seriennummer' ? '🔢 Seriennummer sprechen'
                  : sprachStatus === 'pruefung' ? '📋 Prüfungsart sprechen (Name oder Nummer)'
                  : '💬 Bemerkung sprechen oder „weiter"'}
              </div>
              {sprachSn && <div style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: '#1d4ed8' }}>{sprachSn}</div>}
            </div>

            {/* Prüfungsarten-Tabelle mit Nummern */}
            {pruefungsarten.length > 0 && (
              <div style={{ background: 'rgba(0,0,0,0.04)', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray-400)', padding: '5px 10px', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                  Verfügbare Prüfungen
                </div>
                {pruefungsarten.map((a, i) => (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
                    borderBottom: i < pruefungsarten.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                    background: sprachStatus === 'pruefung' ? 'rgba(34,197,94,0.06)' : 'transparent',
                  }}>
                    <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--red)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                  </div>
                ))}
                <div style={{ padding: '5px 10px', fontSize: 11, color: 'var(--gray-400)', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                  Schlagwörter: <strong>abbrechen</strong> · <strong>nochmal</strong> · <strong>weiter</strong> (Bemerkung überspringen)
                </div>
              </div>
            )}

            {/* iOS: Tippen-Button */}
            {sprachTippen && (
              <button onClick={sprachTippen} style={{
                padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: '#1d4ed8', color: 'white', fontWeight: 600, fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: '0 0 0 4px rgba(29,78,216,0.2)',
              }}>
                🎤 Tippen zum Sprechen
              </button>
            )}
          </div>
        )}
      </div>

      {/* Erfassungsformular */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>Geraet erfassen</div>

        {scanning ? (
          <div style={{ marginBottom: 16 }}>
            {/* Kamera-View mit Scan-Overlay */}
            <div style={{ position: 'relative', width: '100%', borderRadius: 8, overflow: 'hidden', background: '#000' }}>
              <video ref={videoRef} style={{ width: '100%', maxHeight: '38vh', objectFit: 'cover', display: 'block' }} playsInline muted />
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
                  onUpdate={aktualisieren} pruefungsarten={pruefungsarten}
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
                  onUpdate={aktualisieren} pruefungsarten={pruefungsarten}
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

function EintragZeile({ eintrag, onDelete, onUpdate, isLast, pruefungsarten }) {
  const [editMode, setEditMode] = useState(false)
  const [sn, setSn] = useState(eintrag.seriennummer)
  const [notiz, setNotiz] = useState(eintrag.notiz)
  const [artId, setArtId] = useState(eintrag.artId)

  function speichern() {
    const art = pruefungsarten.find(a => a.id === artId)
    onUpdate({ ...eintrag, seriennummer: sn.trim().toUpperCase(), notiz: notiz.trim(), artId, artName: art?.name ?? eintrag.artName })
    setEditMode(false)
  }

  if (editMode) {
    return (
      <div style={{ padding: '12px 16px', borderBottom: isLast ? 'none' : '1px solid var(--gray-100)', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input className="form-control" value={sn} onChange={e => setSn(e.target.value)} placeholder="Seriennummer" style={{ fontFamily: 'monospace', fontWeight: 600 }} />
        <select className="form-control" value={artId} onChange={e => setArtId(e.target.value)}>
          {pruefungsarten.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input className="form-control" value={notiz} onChange={e => setNotiz(e.target.value)} placeholder="Notiz (optional)" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={speichern} className="btn btn-primary btn-sm">Speichern</button>
          <button onClick={() => setEditMode(false)} className="btn btn-secondary btn-sm">Abbrechen</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '11px 16px',
      borderBottom: isLast ? 'none' : '1px solid var(--gray-100)',
    }}>
      <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setEditMode(true)}>
        <div style={{ fontWeight: 600, fontSize: 14, fontFamily: 'monospace' }}>{eintrag.seriennummer}</div>
        {eintrag.notiz && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{eintrag.notiz}</div>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--gray-400)', flexShrink: 0 }}>{eintrag.uhrzeit}</div>
      <button onClick={() => setEditMode(true)} className="btn btn-ghost btn-sm"
        style={{ padding: '4px 8px', flexShrink: 0, color: 'var(--gray-400)' }} title="Bearbeiten">✎</button>
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
