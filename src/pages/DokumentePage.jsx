import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

const KATEGORIEN = [
  { value: 'dienstanweisung', label: 'Dienstanweisung' },
  { value: 'vorlage', label: 'Vorlage' },
  { value: 'ausbildung', label: 'Ausbildung' },
  { value: 'sonstiges', label: 'Sonstiges' },
]

const KAT_COLOR = { dienstanweisung: 'red', vorlage: 'blue', ausbildung: 'green', sonstiges: 'gray' }

export default function DokumentePage() {
  const { profile, isAdmin, isAusbilder } = useAuth()
  const [dokumente, setDokumente] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploadModal, setUploadModal] = useState(false)
  const [filter, setFilter] = useState({ kategorie: 'alle', suche: '' })
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState({ titel: '', beschreibung: '', kategorie: 'dienstanweisung', datei: null })
  const [msg, setMsg] = useState('')

  useEffect(() => { fetchDokumente() }, [])

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
          <h1>Dokumente</h1>
          <p style={{ marginTop: 4 }}>{dokumente.length} Dokument{dokumente.length !== 1 ? 'e' : ''}</p>
        </div>
        {kannHochladen && (
          <button className="btn btn-primary" onClick={() => setUploadModal(true)}>
            <span>+</span> Hochladen
          </button>
        )}
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          placeholder="Dokument suchen..."
          value={filter.suche}
          onChange={e => setFilter(f => ({ ...f, suche: e.target.value }))}
          style={{ maxWidth: 260 }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ value: 'alle', label: 'Alle' }, ...KATEGORIEN].map(k => (
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
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => handleDownload(dok)}>
                    Öffnen
                  </button>
                  {isAdmin && (
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(dok)}>✕</button>
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
