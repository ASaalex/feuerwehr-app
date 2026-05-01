import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function WachenPage() {
  const [wehren, setWehren] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ name: '', ort: '', kuerzel: '', aufgaben_aktiv: false })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { fetchWehren() }, [])

  async function fetchWehren() {
    const { data } = await supabase
      .from('wehren')
      .select('id, name, ort, kuerzel, aufgaben_aktiv, mitglieder:profiles(count)')
      .order('name')
    setWehren(data ?? [])
    setLoading(false)
  }

  function oeffneNeu() {
    setForm({ name: '', ort: '', kuerzel: '', aufgaben_aktiv: false })
    setModal('neu')
  }

  function oeffneBearbeiten(w) {
    console.log('Bearbeiten:', w.name, 'aufgaben_aktiv:', w.aufgaben_aktiv)
    setForm({
      name: w.name,
      ort: w.ort ?? '',
      kuerzel: w.kuerzel ?? '',
      aufgaben_aktiv: w.aufgaben_aktiv === true,
    })
    setModal(w)
  }

  async function handleSpeichern(e) {
    e.preventDefault()
    setSaving(true)

    const payload = {
      name: form.name,
      ort: form.ort || null,
      kuerzel: form.kuerzel.toLowerCase() || null,
      aufgaben_aktiv: form.aufgaben_aktiv === true,
    }

    console.log('Speichere Wache:', modal === 'neu' ? 'NEU' : modal.id, payload)

    if (modal === 'neu') {
      const { error } = await supabase.from('wehren').insert(payload)
      if (error) {
        console.error('Fehler beim Anlegen:', error)
        alert('Fehler: ' + error.message)
        setSaving(false)
        return
      }
    } else {
      const { error } = await supabase.from('wehren').update(payload).eq('id', modal.id)
      if (error) {
        console.error('Fehler beim Speichern:', error)
        alert('Fehler: ' + error.message)
        setSaving(false)
        return
      }
    }

    await fetchWehren()
    setModal(null)
    setForm({ name: '', ort: '', kuerzel: '', aufgaben_aktiv: false })
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
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--red-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--gray-800)' }}>{w.name}</div>
                    {w.ort && <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{w.ort}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  {w.kuerzel && (
                    <span className="badge badge-blue" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                      {w.kuerzel}
                    </span>
                  )}
                  <span className="badge badge-gray">
                    {w.mitglieder?.[0]?.count ?? 0} Kameraden
                  </span>
                  <span className={`badge badge-${w.aufgaben_aktiv ? 'green' : 'gray'}`}>
                    Aufgaben: {w.aufgaben_aktiv ? 'Aktiv' : 'Inaktiv'}
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
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="z.B. FF Nohra"
                  required autoFocus
                />
              </div>
              <div className="form-group">
                <label>Ort (optional)</label>
                <input
                  value={form.ort}
                  onChange={e => setForm(f => ({ ...f, ort: e.target.value }))}
                  placeholder="z.B. Nohra"
                />
              </div>
              <div className="form-group">
                <label>Kuerzel (fuer Nutzernamen)</label>
                <input
                  value={form.kuerzel}
                  onChange={e => setForm(f => ({ ...f, kuerzel: e.target.value.toLowerCase() }))}
                  placeholder="z.B. no"
                  maxLength={5}
                  style={{ maxWidth: 120, fontFamily: 'var(--mono)' }}
                />
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                  Nutzername-Vorschau: <code style={{ fontFamily: 'var(--mono)' }}>{form.kuerzel || 'xx'}asaalfeld</code>
                </div>
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 'normal' }}>
                  <input
                    type="checkbox"
                    checked={form.aufgaben_aktiv}
                    onChange={e => setForm(f => ({ ...f, aufgaben_aktiv: e.target.checked }))}
                    style={{ width: 'auto', height: 18, cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontWeight: 500, color: 'var(--gray-700)' }}>Aufgaben-Modul aktivieren</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>Kameraden dieser Wache sehen den Bereich "Aufgaben"</div>
                  </div>
                </label>
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
