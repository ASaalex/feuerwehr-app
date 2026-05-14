import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Worker lokal aus node_modules laden (kein CDN noetig)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

async function extrahierePdfText(datei) {
  const arrayBuffer = await datei.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const seite = await pdf.getPage(i)
    const inhalt = await seite.getTextContent()
    const zeile = inhalt.items.map(item => item.str).join(' ')
    text += zeile + '\n'
  }
  return text.trim()
}

export default function RegelwerkeAdminPage() {
  const { profile } = useAuth()
  const [regelwerke, setRegelwerke] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploadModal, setUploadModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [extrahieren, setExtrahieren] = useState(false)
  const [form, setForm] = useState({ titel: '', beschreibung: '', datei: null })
  const [vorschau, setVorschau] = useState('')
  const [msg, setMsg] = useState('')
  const [fehler, setFehler] = useState('')
  const dateiRef = useRef()

  useEffect(() => { ladeRegelwerke() }, [])

  async function ladeRegelwerke() {
    const { data } = await supabase
      .from('regelwerke')
      .select('*, erstellt_von:profiles(vorname,nachname)')
      .order('erstellt_am', { ascending: false })
    setRegelwerke(data ?? [])
    setLoading(false)
  }

  async function handleDateiWahl(e) {
    const datei = e.target.files?.[0]
    if (!datei) return
    setForm(f => ({ ...f, datei, titel: f.titel || datei.name.replace(/\.pdf$/i, '') }))
    setVorschau('')
    setFehler('')

    if (datei.type === 'application/pdf') {
      setExtrahieren(true)
      try {
        const text = await extrahierePdfText(datei)
        setVorschau(text.slice(0, 500) + (text.length > 500 ? '…' : ''))
        setMsg(`✅ Text extrahiert: ${text.length.toLocaleString()} Zeichen aus ${(await pdfjsLib.getDocument({ data: await datei.arrayBuffer() }).promise).numPages} Seiten`)
      } catch (err) {
        setFehler('PDF-Text konnte nicht extrahiert werden: ' + err.message)
      } finally {
        setExtrahieren(false)
      }
    }
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!form.datei || !form.titel.trim()) return
    setUploading(true)
    setFehler('')

    try {
      // 1. PDF-Text extrahieren
      let inhaltsText = ''
      if (form.datei.type === 'application/pdf') {
        inhaltsText = await extrahierePdfText(form.datei)
      }

      // 2. Datei in Storage hochladen
      const ext = form.datei.name.split('.').pop()
      const pfad = `${profile.id}/${Date.now()}.${ext}`
      const { error: storageErr } = await supabase.storage
        .from('regelwerke')
        .upload(pfad, form.datei)
      if (storageErr) throw new Error('Datei-Upload: ' + storageErr.message)

      // 3. Datensatz in DB anlegen
      const { error: dbErr } = await supabase.from('regelwerke').insert({
        titel:        form.titel.trim(),
        beschreibung: form.beschreibung.trim() || null,
        datei_pfad:   pfad,
        datei_name:   form.datei.name,
        inhalt_text:  inhaltsText || null,
        aktiv:        true,
        erstellt_von: profile.id,
      })
      if (dbErr) throw new Error('Datenbank: ' + dbErr.message)

      await ladeRegelwerke()
      setUploadModal(false)
      setForm({ titel: '', beschreibung: '', datei: null })
      setVorschau('')
      setMsg('Regelwerk erfolgreich hochgeladen!')
      setTimeout(() => setMsg(''), 4000)
    } catch (err) {
      setFehler(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function toggleAktiv(rw) {
    await supabase.from('regelwerke').update({ aktiv: !rw.aktiv }).eq('id', rw.id)
    setRegelwerke(prev => prev.map(r => r.id === rw.id ? { ...r, aktiv: !r.aktiv } : r))
  }

  async function handleLoeschen(rw) {
    if (!confirm(`"${rw.titel}" wirklich löschen?`)) return
    if (rw.datei_pfad) {
      await supabase.storage.from('regelwerke').remove([rw.datei_pfad])
    }
    await supabase.from('regelwerke').delete().eq('id', rw.id)
    await ladeRegelwerke()
  }

  async function handleReextract(rw) {
    if (!rw.datei_pfad) return
    const { data } = await supabase.storage.from('regelwerke').createSignedUrl(rw.datei_pfad, 60)
    if (!data?.signedUrl) return alert('Datei nicht erreichbar.')
    setMsg('Extrahiere Text…')
    try {
      const res = await fetch(data.signedUrl)
      const blob = await res.blob()
      const text = await extrahierePdfText(blob)
      await supabase.from('regelwerke').update({ inhalt_text: text }).eq('id', rw.id)
      await ladeRegelwerke()
      setMsg(`Text neu extrahiert: ${text.length.toLocaleString()} Zeichen`)
      setTimeout(() => setMsg(''), 4000)
    } catch (err) {
      setMsg('Fehler: ' + err.message)
    }
  }

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  const aktiveAnzahl = regelwerke.filter(r => r.aktiv && r.inhalt_text).length

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Regelwerke für KI-Ausbilder</h1>
          <p style={{ marginTop: 4 }}>
            {aktiveAnzahl} aktiv · KI nutzt diese Dokumente als Grundlage
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setUploadModal(true); setFehler(''); setVorschau('') }}>
          <span>+</span> PDF hochladen
        </button>
      </div>

      {/* Hinweis-Box */}
      <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#3730A3' }}>
        <strong>Wie es funktioniert:</strong> Lade die offiziellen PDFs hoch (FwDV 1, 3, 7, 100, ThürBKG, lokale Dienstanweisungen).
        Der Text wird automatisch extrahiert und der KI beim Üben als exaktes Regelwerk übergeben.
        Nur aktive Dokumente werden verwendet.
      </div>

      {msg && <div className="alert alert-success" style={{ marginBottom: 16 }}>{msg}</div>}

      {regelwerke.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
          <p style={{ color: 'var(--gray-400)', marginBottom: 8 }}>Noch keine Regelwerke hochgeladen.</p>
          <p style={{ color: 'var(--gray-400)', fontSize: 13 }}>
            Lade FwDV-Dokumente, ThürBKG und lokale Dienstanweisungen hoch,
            damit der KI-Ausbilder nach den exakt geltenden Vorschriften bewertet.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {regelwerke.map(rw => (
            <div key={rw.id} className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px', opacity: rw.aktiv ? 1 : 0.55 }}>
              <div style={{ fontSize: 28, flexShrink: 0 }}>📄</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-700)' }}>{rw.titel}</span>
                  {rw.aktiv
                    ? <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, background: '#ECFDF5', color: '#065F46', fontWeight: 600 }}>Aktiv</span>
                    : <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, background: '#FFF1F2', color: '#BE123C' }}>Inaktiv</span>
                  }
                  {rw.inhalt_text
                    ? <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, background: '#EEF2FF', color: '#3730A3' }}>
                        {rw.inhalt_text.length.toLocaleString()} Zeichen
                      </span>
                    : <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, background: '#FFF8E1', color: '#F57F17' }}>Kein Text</span>
                  }
                </div>
                {rw.beschreibung && (
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 4 }}>{rw.beschreibung}</div>
                )}
                <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                  {rw.datei_name} · {format(new Date(rw.erstellt_am), 'dd.MM.yyyy', { locale: de })}
                  {rw.erstellt_von && ` · ${rw.erstellt_von.vorname} ${rw.erstellt_von.nachname}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {!rw.inhalt_text && (
                  <button className="btn btn-sm" style={{ background: '#EEF2FF', color: '#3730A3', border: 'none' }}
                    onClick={() => handleReextract(rw)} title="Text neu extrahieren">
                    🔄
                  </button>
                )}
                <button className="btn btn-sm btn-secondary" onClick={() => toggleAktiv(rw)} title={rw.aktiv ? 'Deaktivieren' : 'Aktivieren'}>
                  {rw.aktiv ? '⏸' : '▶'}
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => handleLoeschen(rw)} title="Löschen">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {uploadModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setUploadModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3>Regelwerk hochladen</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setUploadModal(false)}>✕</button>
            </div>

            {fehler && (
              <div style={{ marginBottom: 12, padding: '10px 14px', background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: 8, fontSize: 13, color: '#BE123C' }}>
                {fehler}
              </div>
            )}

            <form onSubmit={handleUpload}>
              <div className="form-group">
                <label>PDF-Datei *</label>
                <input
                  ref={dateiRef}
                  type="file"
                  accept=".pdf"
                  required
                  onChange={handleDateiWahl}
                />
                {extrahieren && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13, color: 'var(--gray-500)' }}>
                    <div className="spinner" style={{ width: 14, height: 14 }}></div>
                    Text wird extrahiert…
                  </div>
                )}
                {vorschau && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: '#F8FAFC', borderRadius: 6, fontSize: 11, color: 'var(--gray-500)', fontFamily: 'var(--mono)', lineHeight: 1.5, maxHeight: 100, overflow: 'hidden' }}>
                    {vorschau}
                  </div>
                )}
                {msg && !fehler && (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#065F46' }}>{msg}</div>
                )}
              </div>

              <div className="form-group">
                <label>Titel *</label>
                <input
                  value={form.titel}
                  onChange={e => setForm(f => ({ ...f, titel: e.target.value }))}
                  placeholder="z.B. FwDV 3 – Einheiten im Löscheinsatz"
                  required
                />
              </div>

              <div className="form-group">
                <label>Beschreibung (optional)</label>
                <input
                  value={form.beschreibung}
                  onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))}
                  placeholder="z.B. Fassung 2006, gültig für Thüringen"
                />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setUploadModal(false)}>Abbrechen</button>
                <button type="submit" className="btn btn-primary" disabled={uploading || extrahieren}>
                  {uploading ? 'Wird hochgeladen…' : 'Hochladen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
