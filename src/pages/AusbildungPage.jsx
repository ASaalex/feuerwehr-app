import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import AusbildungsnachweisModal from './AusbildungsnachweisModal'
import AuslagenerstattungModal from './AuslagenerstattungModal'
import VerdienstausfallModal from './VerdienstausfallModal'
import { renderMd, findeVorschriftInRegelwerken } from '../lib/vorschriftSuche'

const KATEGORIEN = [
  { value: 'ausbildung', label: 'Ausbildung' },
]

const KAT_COLOR = { dienstanweisung: 'red', vorlage: 'blue', ausbildung: 'green', sonstiges: 'gray' } // ausbildung behalten fuer alte Dokumente

export default function AusbildungPage() {
  const { profile, isAdmin, isAusbilder } = useAuth()
  const [dokumente, setDokumente] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploadModal, setUploadModal] = useState(false)
  const [filter, setFilter] = useState({ kategorie: 'ausbildung', suche: '' })
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState({ titel: '', beschreibung: '', kategorie: 'dienstanweisung', datei: null })
  const [msg, setMsg] = useState('')
  const [ausbildungsModal, setAusbildungsModal] = useState(false)
  const [auslagenModal, setAuslagenModal] = useState(false)
  const [verdienstModal, setVerdienstModal] = useState(false)
  const [kiGuthaben, setKiGuthaben] = useState(null)
  const [wissensFrage, setWissensFrage] = useState('')
  const [wissensAntwort, setWissensAntwort] = useState(null)
  const [wissensLoading, setWissensLoading] = useState(false)
  const [wissensFehler, setWissensFehler] = useState('')
  const [regelwerke, setRegelwerke] = useState([])
  const [wissensVorschriftModal, setWissensVorschriftModal] = useState(null)

  useEffect(() => { fetchDokumente(); fetchKiGuthaben(); ladeRegelwerke() }, [])

  async function ladeRegelwerke() {
    const { data } = await supabase
      .from('regelwerke')
      .select('titel, inhalt_text')
      .eq('aktiv', true)
      .not('inhalt_text', 'is', null)
    setRegelwerke(data ?? [])
  }

  async function fetchKiGuthaben() {
    const { data } = await supabase
      .from('profiles')
      .select('ki_guthaben_cent')
      .eq('id', profile.id)
      .single()
    setKiGuthaben(data?.ki_guthaben_cent ?? 0)
  }

  async function stelleWissensFrage() {
    const q = wissensFrage.trim()
    if (!q || wissensLoading) return
    setWissensLoading(true)
    setWissensAntwort(null)
    setWissensFehler('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-ausbildung`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          modus: 'wissen',
          frage: q,
          kamerad_id: profile?.id,
        }),
      })
      const data = await res.json()
      if (data.error) {
        setWissensFehler(data.error === 'KEIN_GUTHABEN' ? 'Kein Guthaben – bitte beim Wehrleiter aufladen.' : data.error)
      } else {
        setWissensAntwort(data.antwort)
        if (data.guthaben_rest_cent !== undefined) setKiGuthaben(data.guthaben_rest_cent)
      }
    } catch (e) {
      setWissensFehler('Verbindungsfehler – bitte erneut versuchen.')
    }
    setWissensLoading(false)
  }

  function oeffneWissensVorschriftModal(zeile) {
    setWissensVorschriftModal(findeVorschriftInRegelwerken(zeile, regelwerke))
  }

  async function fetchDokumente() {
    const { data } = await supabase.from('dokumente').select('*, hochgeladen_von:profiles(vorname,nachname)').order('erstellt_am', { ascending: false })
    setDokumente(data ?? [])
    setLoading(false)
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!form.datei) return
    setUploading(true)

    const ext = form.datei.name.split('.').pop()
    const pfad = `${profile.id}/${Date.now()}.${ext}`

    const { error: storageError } = await supabase.storage.from('dokumente').upload(pfad, form.datei)
    if (storageError) {
      alert('Upload fehlgeschlagen: ' + storageError.message)
      setUploading(false)
      return
    }

    const { error: dbError } = await supabase.from('dokumente').insert({
      titel: form.titel,
      beschreibung: form.beschreibung,
      kategorie: form.kategorie,
      datei_pfad: pfad,
      datei_name: form.datei.name,
      datei_groesse: form.datei.size,
      hochgeladen_von: profile.id,
    })

    if (!dbError) {
      await fetchDokumente()
      setUploadModal(false)
      setForm({ titel: '', beschreibung: '', kategorie: 'dienstanweisung', datei: null })
      setMsg('Dokument erfolgreich hochgeladen!')
      setTimeout(() => setMsg(''), 3000)
    }
    setUploading(false)
  }

  async function handleDownload(dok) {
    const { data } = await supabase.storage.from('dokumente').createSignedUrl(dok.datei_pfad, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function handlePrint(dok) {
    const { data } = await supabase.storage.from('dokumente').createSignedUrl(dok.datei_pfad, 60)
    if (data?.signedUrl) {
      const ext = dok.datei_name.split('.').pop()?.toLowerCase()
      if (ext === 'pdf') {
        // PDF in neuem Tab oeffnen, Browser-Druckdialog startet automatisch
        const win = window.open(data.signedUrl, '_blank')
        if (win) {
          win.onload = () => {
            try { win.print() } catch(e) {}
          }
        }
      } else {
        // Andere Dateitypen: erst oeffnen, dann Nutzer manuell drucken lassen
        window.open(data.signedUrl, '_blank')
      }
    }
  }

  async function handleDelete(dok) {
    if (!confirm(`"${dok.titel}" wirklich löschen?`)) return
    await supabase.storage.from('dokumente').remove([dok.datei_pfad])
    await supabase.from('dokumente').delete().eq('id', dok.id)
    await fetchDokumente()
  }

  const gefiltert = dokumente.filter(d => {
    if (filter.kategorie !== 'alle' && d.kategorie !== filter.kategorie) return false
    if (filter.suche && !d.titel.toLowerCase().includes(filter.suche.toLowerCase())) return false
    return true
  })

  const kannHochladen = isAusbilder || isAdmin

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Ausbildung</h1>
          <p style={{ marginTop: 4 }}>{dokumente.length} Dokument{dokumente.length !== 1 ? 'e' : ''}</p>
        </div>
        {kannHochladen && (
          <button className="btn btn-primary" onClick={() => setUploadModal(true)}>
            <span>+</span> Hochladen
          </button>
        )}
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}

      {/* Einsatz-Simulation Banner */}
      {kiGuthaben !== null && kiGuthaben <= 0 ? (
        /* Kein Guthaben → ausgegraut, nicht klickbar */
        <div style={{ marginBottom: 20 }}>
          <div style={{
            background: 'linear-gradient(135deg, #9CA3AF 0%, #6B7280 100%)',
            borderRadius: 12, padding: '16px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            opacity: 0.75, cursor: 'not-allowed',
          }}>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>KI-gestützt</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 4 }}>🎮 Einsatz-Simulation</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600 }}>
                  💳 0,00 € Guthaben
                </span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>– Wehrleiter um Aufladung bitten</span>
              </div>
            </div>
            <div style={{ fontSize: 28, opacity: 0.5 }}>🚒</div>
          </div>
        </div>
      ) : (
        <Link to="/ausbildung/chat" style={{ textDecoration: 'none', display: 'block', marginBottom: 20 }}>
          <div style={{
            background: 'linear-gradient(135deg, #B91C1C 0%, #991B1B 100%)',
            borderRadius: 12, padding: '16px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            cursor: 'pointer', transition: 'opacity 150ms',
          }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.92'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>KI-gestützt</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 4 }}>🎮 Einsatz-Simulation</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Taktisches Training mit KI-Ausbilder · Bewertung nach FwDV &amp; ThürBKG</span>
                {kiGuthaben !== null && (
                  <span style={{
                    fontSize: 11, padding: '2px 9px', borderRadius: 20, fontWeight: 600,
                    background: kiGuthaben < 20 ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.2)',
                    color: kiGuthaben < 20 ? '#FDE68A' : 'rgba(255,255,255,0.9)',
                    border: kiGuthaben < 20 ? '1px solid rgba(251,191,36,0.5)' : '1px solid rgba(255,255,255,0.2)',
                  }}>
                    💳 {(kiGuthaben / 100).toFixed(2).replace('.', ',')} €
                  </span>
                )}
              </div>
            </div>
            <div style={{ fontSize: 28, opacity: 0.8 }}>🚒</div>
          </div>
        </Link>
      )}

      {/* Wissensfrage Banner */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          background: 'linear-gradient(135deg, #1D4ED8 0%, #1E40AF 100%)',
          borderRadius: 12, padding: '16px 20px',
        }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>KI-gestützt</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 4 }}>💬 Wissensfrage</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginBottom: 12 }}>
            Stelle eine Frage – KI antwortet direkt aus den Dienstvorschriften
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="z.B. Wer baut die Wasserversorgung im Löscheinsatz auf?"
              value={wissensFrage}
              onChange={e => { setWissensFrage(e.target.value); setWissensAntwort(null); setWissensFehler('') }}
              onKeyDown={e => e.key === 'Enter' && stelleWissensFrage()}
              disabled={wissensLoading || (kiGuthaben !== null && kiGuthaben <= 0)}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.3)',
                color: 'white',
                borderRadius: 8,
                padding: '9px 13px',
                fontSize: 14,
                outline: 'none',
              }}
            />
            <button
              onClick={stelleWissensFrage}
              disabled={!wissensFrage.trim() || wissensLoading || (kiGuthaben !== null && kiGuthaben <= 0)}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: '1px solid rgba(255,255,255,0.35)',
                color: 'white',
                borderRadius: 8,
                padding: '9px 16px',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                flexShrink: 0,
                opacity: (!wissensFrage.trim() || wissensLoading || (kiGuthaben !== null && kiGuthaben <= 0)) ? 0.5 : 1,
                transition: 'opacity 150ms',
              }}
            >
              {wissensLoading ? '…' : 'Fragen →'}
            </button>
          </div>

          {/* Antwort */}
          {wissensLoading && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
              <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              KI sucht in den Dienstvorschriften…
            </div>
          )}
          {wissensFehler && (
            <div style={{ marginTop: 10, background: 'rgba(254,202,202,0.15)', border: '1px solid rgba(254,202,202,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#FCA5A5' }}>
              ⚠️ {wissensFehler}
            </div>
          )}
          {wissensAntwort && (
            <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '12px 16px', fontSize: 14, color: 'white', lineHeight: 1.65 }}>
              {wissensAntwort.split('\n').map((zeile, i) => {
                const trimmed = zeile.trim()
                if (!trimmed) return <div key={i} style={{ height: 6 }} />
                if (trimmed.startsWith('📖')) {
                  return (
                    <div
                      key={i}
                      onClick={() => oeffneWissensVorschriftModal(trimmed)}
                      style={{
                        background: 'rgba(255,255,255,0.1)', borderRadius: 6, padding: '6px 10px',
                        marginBottom: 6, fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'flex-start', gap: 6,
                        transition: 'background 120ms',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                      title="Tippen zum Nachschlagen"
                    >
                      <span style={{ flexShrink: 0 }}>📖</span>
                      <span style={{ flex: 1 }}>{renderMd(trimmed.replace(/^📖\s*(VORSCHRIFT:?\s*)?/, ''))}</span>
                      <span style={{ flexShrink: 0, opacity: 0.7, fontSize: 12 }}>↗</span>
                    </div>
                  )
                }
                if (trimmed.startsWith('✅')) {
                  return (
                    <div key={i} style={{ background: 'rgba(134,239,172,0.15)', borderRadius: 6, padding: '6px 10px', marginBottom: 6, fontWeight: 500 }}>
                      {renderMd(trimmed)}
                    </div>
                  )
                }
                if (trimmed.startsWith('💡')) {
                  return (
                    <div key={i} style={{ background: 'rgba(253,224,71,0.1)', borderRadius: 6, padding: '6px 10px', marginBottom: 6 }}>
                      {renderMd(trimmed)}
                    </div>
                  )
                }
                return <div key={i} style={{ paddingLeft: 4, marginBottom: 3 }}>{renderMd(trimmed)}</div>
              })}
              <button
                onClick={() => { setWissensAntwort(null); setWissensFrage('') }}
                style={{ marginTop: 10, background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.7)', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}
              >
                Neue Frage
              </button>
            </div>
          )}
          {kiGuthaben !== null && kiGuthaben <= 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              💳 Kein Guthaben – Wehrleiter um Aufladung bitten
            </div>
          )}
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          placeholder="Dokument suchen..."
          value={filter.suche}
          onChange={e => setFilter(f => ({ ...f, suche: e.target.value }))}
          style={{ maxWidth: 260 }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {KATEGORIEN.map(k => (
            <button key={k.value}
              className={`btn btn-sm ${filter.kategorie === k.value ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(f => ({ ...f, kategorie: k.value }))}>
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dokumente Grid */}
      {gefiltert.length === 0 ? (
        <div className="empty-state card">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
          <p>Keine Dokumente gefunden</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {gefiltert.map(dok => (
            <div key={dok.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <FileIcon name={dok.datei_name} />
                    <span className={`badge badge-${KAT_COLOR[dok.kategorie]}`} style={{ fontSize: 11 }}>
                      {KATEGORIEN.find(k => k.value === dok.kategorie)?.label}
                    </span>
                  </div>
                  <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--gray-700)', lineHeight: 1.4 }}>{dok.titel}</div>
                  {dok.beschreibung && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4, lineHeight: 1.5 }}>{dok.beschreibung}</div>}
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--gray-400)', borderTop: '1px solid var(--gray-100)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  {dok.hochgeladen_von?.vorname} {dok.hochgeladen_von?.nachname}<br />
                  {format(new Date(dok.erstellt_am), 'd. MMM yyyy', { locale: de })}
                </span>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {(dok.titel?.toLowerCase().includes('ausbildungsnachweis') || dok.datei_name?.toLowerCase().includes('ausbildungsnachweis')) && (
                    <button className="btn btn-sm" style={{ background: '#E1F5EE', color: '#085041', border: 'none' }}
                      onClick={() => setAusbildungsModal(true)} title="Ausbildungsnachweis ausfuellen">
                      ✏️
                    </button>
                  )}
                  {(dok.titel?.toLowerCase().includes('auslagenerstattung') || dok.datei_name?.toLowerCase().includes('auslagenerstattung')) && (
                    <button className="btn btn-sm" style={{ background: '#E6F1FB', color: '#0C447C', border: 'none' }}
                      onClick={() => setAuslagenModal(true)} title="Auslagenerstattung ausfuellen">
                      ✏️
                    </button>
                  )}
                  {(dok.titel?.toLowerCase().includes('verdienstausfall') || dok.datei_name?.toLowerCase().includes('verdienstausfall')) && (
                    <button className="btn btn-sm" style={{ background: '#FAEEDA', color: '#633806', border: 'none' }}
                      onClick={() => setVerdienstModal(true)} title="Verdienstausfall ausfuellen">
                      ✏️
                    </button>
                  )}
                  <button className="btn btn-sm btn-secondary" onClick={() => handleDownload(dok)} title="Oeffnen">
                    ↓
                  </button>
                  <button className="btn btn-sm btn-secondary" onClick={() => handlePrint(dok)} title="Drucken" style={{ padding: '6px 10px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6,9 6,2 18,2 18,9"/>
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                      <rect x="6" y="14" width="12" height="8"/>
                    </svg>
                  </button>
                  {isAdmin && (
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(dok)} title="Loeschen">✕</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {uploadModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setUploadModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Dokument hochladen</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setUploadModal(false)}>✕</button>
            </div>
            <form onSubmit={handleUpload}>
              <div className="form-group">
                <label>Titel</label>
                <input value={form.titel} onChange={e => setForm(f => ({ ...f, titel: e.target.value }))} placeholder="z.B. Dienstanweisung Atemschutz" required />
              </div>
              <div className="form-group">
                <label>Kategorie</label>
                <select value={form.kategorie} onChange={e => setForm(f => ({ ...f, kategorie: e.target.value }))}>
                  {KATEGORIEN.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Beschreibung (optional)</label>
                <textarea value={form.beschreibung} onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))} placeholder="Kurze Beschreibung..." rows={3} />
              </div>
              <div className="form-group">
                <label>Datei</label>
                <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.png" required
                  onChange={e => setForm(f => ({ ...f, datei: e.target.files[0] }))} />
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>PDF, Word, Excel, PowerPoint, Bilder</div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setUploadModal(false)}>Abbrechen</button>
                <button type="submit" className="btn btn-primary" disabled={uploading}>
                  {uploading ? 'Wird hochgeladen...' : 'Hochladen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {ausbildungsModal && <AusbildungsnachweisModal onClose={() => setAusbildungsModal(false)} />}
      {auslagenModal && <AuslagenerstattungModal onClose={() => setAuslagenModal(false)} />}
      {verdienstModal && <VerdienstausfallModal onClose={() => setVerdienstModal(false)} />}

      {/* Vorschrift-Popup (Wissensfrage) */}
      {wissensVorschriftModal && (
        <div
          className="modal-backdrop"
          onClick={e => e.target === e.currentTarget && setWissensVorschriftModal(null)}
          style={{ zIndex: 1100 }}
        >
          <div className="modal" style={{ maxWidth: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Dienstvorschrift</div>
                <h3 style={{ margin: 0, fontSize: 15 }}>📖 {wissensVorschriftModal.dokTitel}</h3>
                <div style={{ fontSize: 12, color: '#6366F1', fontStyle: 'italic', marginTop: 3 }}>{renderMd(wissensVorschriftModal.referenz)}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setWissensVorschriftModal(null)}>✕</button>
            </div>

            <div style={{ overflowY: 'auto', padding: '16px 20px', flex: 1 }}>
              {wissensVorschriftModal.abschnittText ? (
                <div style={{ fontSize: 13, color: 'var(--gray-800)', lineHeight: 1.75, whiteSpace: 'pre-wrap', fontFamily: 'var(--mono, monospace)', background: '#F8FAFC', borderRadius: 8, padding: '12px 16px', border: '1px solid var(--gray-100)' }}>
                  {wissensVorschriftModal.abschnittText}
                </div>
              ) : wissensVorschriftModal.gefunden ? (
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
              <button className="btn btn-secondary" onClick={() => setWissensVorschriftModal(null)}>Schließen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FileIcon({ name }) {
  const ext = name?.split('.').pop()?.toLowerCase()
  const color = ext === 'pdf' ? '#C0392B' : ['doc','docx'].includes(ext) ? '#2E86C1' : ['xls','xlsx'].includes(ext) ? '#1E8449' : '#888'
  return (
    <div style={{ width: 28, height: 28, background: color + '18', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontSize: 9, fontWeight: 700, color, fontFamily: 'var(--mono)' }}>{ext?.toUpperCase().slice(0,3)}</span>
    </div>
  )
}
