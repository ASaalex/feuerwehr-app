import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function WachenPage() {
  const [wehren, setWehren] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'neu' | wehr-objekt
  const [form, setForm] = useState({ name: '', ort: '', kuerzel: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { fetchWehren() }, [])

  async function fetchWehren() {
    const { data } = await supabase
      .from('wehren')
      .select('*, mitglieder:profiles(count)')
      .order('name')
    setWehren(data ?? [])
    setLoading(false)
  }

  function oeffneNeu() {
    setForm({ name: '', ort: '', kuerzel: '' })
    setModal('neu')
  }

  function oeffneBearbeiten(w) {
    setForm({ name: w.name, ort: w.ort ?? '', kuerzel: w.kuerzel ?? '' })
    setModal(w)
  }

  async function handleSpeichern(e) {
    e.preventDefault()
    setSaving(true)
    if (modal === 'neu') {
      await supabase.from('wehren').insert({
        name: form.name,
        ort: form.ort || null,
        kuerzel: form.kuerzel.toLowerCase() || null,
      })
    } else {
      await supabase.from('wehren').update({
        name: form.name,
        ort: form.ort || null,
        kuerzel: form.kuerzel.toLowerCase() || null,
      }).eq('id', modal.id)
    }
    await fetchWehren()
    setModal(null)
    setMsg(modal === 'neu' ? 'Wache angelegt!' : 'Wache gespeichert!')
    setTimeout(() => setMsg(''), 3000)
    setSaving(false)
  }

  async function handleLoeschen(w) {
    if (!confirm(`"${w.name}" wirklich loeschen? Alle zugeordneten Kameraden verlieren ihre Wachen-Zuweisung.`)) return
    await supabase.from('wehren').delete().eq('id', w.id)
    await fetchWehren()
  }

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Wachen verwalten</h1>
          <p style={{ marginTop: 4 }}>{wehren.length} Wache{wehren.length !== 1 ? 'n' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={oeffneNeu}>+ Neue Wache</button>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {wehren.map(w => (
          <div key={w.id} className="card">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--red-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--gray-800)' }}>{w.name}</div>
                    {w.ort && <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{w.ort}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {w.kuerzel && (
                    <span className="badge badge-blue" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                      Kuerzel: {w.kuerzel}
                    </span>
                  )}
                  <span className="badge badge-gray">
                    {w.mitglieder?.[0]?.count ?? 0} Kameraden
                  </span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--gray-100)' }}>
              <button className="btn btn-sm btn-secondary" style={{ flex: 1 }} onClick={() => oeffneBearbeiten(w)}>
                Bearbeiten
              </button>
              <button className="btn btn-sm btn-danger" onClick={() => handleLoeschen(w)}>
                Loeschen
              </button>
            </div>
          </div>
        ))}

        {wehren.length === 0 && (
          <div className="empty-state card" style={{ gridColumn: '1/-1' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
            <p>Noch keine Wachen angelegt</p>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <h3>{modal === 'neu' ? 'Neue Wache anlegen' : 'Wache bearbeiten'}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>x</button>
            </div>
            <form onSubmit={handleSpeichern}>
              <div className="form-group">
                <label>Name der Wache</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="z.B. FF Nohra" required autoFocus />
              </div>
              <div className="form-group">
                <label>Ort (optional)</label>
                <input value={form.ort} onChange={e => setForm(f => ({ ...f, ort: e.target.value }))}
                  placeholder="z.B. Nohra" />
              </div>
              <div className="form-group">
                <label>Kuerzel (fuer Nutzernamen)</label>
                <input value={form.kuerzel} onChange={e => setForm(f => ({ ...f, kuerzel: e.target.value.toLowerCase() }))}
                  placeholder="z.B. no" maxLength={5} style={{ fontFamily: 'var(--mono)' }} />
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                  Wird fuer automatische Nutzernamen verwendet: <code style={{ fontFamily: 'var(--mono)' }}>{form.kuerzel || 'xx'}asaalfeld</code>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Abbrechen</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Speichern...' : modal === 'neu' ? 'Anlegen' : 'Speichern'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
