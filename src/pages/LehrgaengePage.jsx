import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

export default function LehrgaengePage() {
  const [lehrgaenge, setLehrgaenge] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ name: '', kuerzel: '', beschreibung: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { fetchLehrgaenge() }, [])

  async function fetchLehrgaenge() {
    const { data } = await supabase
      .from('lehrgaenge')
      .select('*, teilnehmer:kamerad_lehrgaenge(count)')
      .order('name')
    setLehrgaenge(data ?? [])
    setLoading(false)
  }

  function oeffneNeu() {
    setForm({ name: '', kuerzel: '', beschreibung: '' })
    setModal('neu')
  }

  function oeffneBearbeiten(l) {
    setForm({ name: l.name, kuerzel: l.kuerzel ?? '', beschreibung: l.beschreibung ?? '' })
    setModal(l)
  }

  async function handleSpeichern(e) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      name: form.name,
      kuerzel: form.kuerzel || null,
      beschreibung: form.beschreibung || null,
    }
    if (modal === 'neu') {
      await supabase.from('lehrgaenge').insert(payload)
    } else {
      await supabase.from('lehrgaenge').update(payload).eq('id', modal.id)
    }
    await fetchLehrgaenge()
    setModal(null)
    setMsg(modal === 'neu' ? 'Lehrgang angelegt!' : 'Lehrgang gespeichert!')
    setTimeout(() => setMsg(''), 3000)
    setSaving(false)
  }

  async function handleLoeschen(l) {
    if (!confirm(`"${l.name}" wirklich loeschen?`)) return
    await supabase.from('lehrgaenge').delete().eq('id', l.id)
    await fetchLehrgaenge()
  }

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Lehrgaenge verwalten</h1>
          <p style={{ marginTop: 4 }}>{lehrgaenge.length} Lehrgang{lehrgaenge.length !== 1 ? 'e' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={oeffneNeu}>+ Neuer Lehrgang</button>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Lehrgang</th>
                <th>Kuerzel</th>
                <th>Beschreibung</th>
                <th>Kameraden</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lehrgaenge.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 32 }}>Noch keine Lehrgaenge angelegt</td></tr>
              ) : lehrgaenge.map(l => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 500, color: 'var(--gray-700)' }}>{l.name}</td>
                  <td>
                    {l.kuerzel && (
                      <span className="badge badge-blue" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{l.kuerzel}</span>
                    )}
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--gray-400)' }}>{l.beschreibung ?? '—'}</td>
                  <td style={{ fontSize: 13, color: 'var(--gray-500)' }}>{l.teilnehmer?.[0]?.count ?? 0}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => oeffneBearbeiten(l)}>Bearbeiten</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleLoeschen(l)}>Loeschen</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <h3>{modal === 'neu' ? 'Neuer Lehrgang' : 'Lehrgang bearbeiten'}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>x</button>
            </div>
            <form onSubmit={handleSpeichern}>
              <div className="form-group">
                <label>Name des Lehrgangs</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="z.B. Truppmann Teil 1" required autoFocus />
              </div>
              <div className="form-group">
                <label>Kuerzel (optional)</label>
                <input value={form.kuerzel} onChange={e => setForm(f => ({ ...f, kuerzel: e.target.value }))}
                  placeholder="z.B. TM1" maxLength={10} style={{ maxWidth: 120, fontFamily: 'var(--mono)' }} />
              </div>
              <div className="form-group">
                <label>Beschreibung (optional)</label>
                <textarea value={form.beschreibung} onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))}
                  placeholder="Kurze Beschreibung..." rows={2} />
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
