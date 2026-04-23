import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

const ROLLEN = ['gemeindebrandmeister', 'wehrleiter', 'gruppenfuehrer', 'ausbilder', 'kamerad']
const ROLLEN_LABEL = { gemeindebrandmeister: 'Gemeindebrandmeister', wehrleiter: 'Wehrleiter', gruppenfuehrer: 'Gruppenführer', ausbilder: 'Ausbilder', kamerad: 'Kamerad' }
const FS_OPTIONEN = ['B', 'BE', 'C1', 'C', 'C1E', 'CE', 'D1', 'D', 'D1E', 'DE', 'T', 'L']

export default function KameradenPage() {
  const [kameraden, setKameraden] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ status: 'alle', suche: '' })
  const [editModal, setEditModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { fetchKameraden() }, [])

  async function fetchKameraden() {
    const { data } = await supabase.from('profiles').select('*').order('nachname')
    setKameraden(data ?? [])
    setLoading(false)
  }

  async function saveEdit() {
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      vorname: editModal.vorname,
      nachname: editModal.nachname,
      telefon: editModal.telefon,
      geburtsdatum: editModal.geburtsdatum || null,
      eintrittsdatum: editModal.eintrittsdatum || null,
      fuehrerschein: editModal.fuehrerschein,
      atemschutz: editModal.atemschutz,
      rolle: editModal.rolle,
      status: editModal.status,
    }).eq('id', editModal.id)

    if (!error) {
      await fetchKameraden()
      setEditModal(null)
      setMsg('Gespeichert!')
      setTimeout(() => setMsg(''), 3000)
    }
    setSaving(false)
  }

  async function statusAendern(id, status) {
    await supabase.from('profiles').update({ status }).eq('id', id)
    await fetchKameraden()
  }

  const gefiltert = kameraden.filter(k => {
    if (filter.status !== 'alle' && k.status !== filter.status) return false
    if (filter.suche) {
      const q = filter.suche.toLowerCase()
      return `${k.vorname} ${k.nachname} ${k.email}`.toLowerCase().includes(q)
    }
    return true
  })

  const ausstehend = kameraden.filter(k => k.status === 'ausstehend').length

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Kameraden</h1>
          <p style={{ marginTop: 4 }}>{kameraden.filter(k => k.status === 'aktiv').length} aktive Mitglieder</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {msg && <div className="alert alert-success" style={{ margin: 0, padding: '8px 14px' }}>{msg}</div>}
        </div>
      </div>

      {ausstehend > 0 && (
        <div className="alert alert-info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{ausstehend} Kamerad{ausstehend > 1 ? 'en warten' : ' wartet'} auf Freischaltung</span>
          <button className="btn btn-sm btn-secondary" onClick={() => setFilter(f => ({ ...f, status: 'ausstehend' }))}>Anzeigen</button>
        </div>
      )}

      {/* Filter */}
      <div className="card" style={{ marginBottom: 20, padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input
            placeholder="Suche nach Name oder E-Mail..."
            value={filter.suche}
            onChange={e => setFilter(f => ({ ...f, suche: e.target.value }))}
            style={{ maxWidth: 280 }}
          />
          <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))} style={{ maxWidth: 160 }}>
            <option value="alle">Alle Status</option>
            <option value="aktiv">Aktiv</option>
            <option value="ausstehend">Ausstehend</option>
            <option value="inaktiv">Inaktiv</option>
          </select>
        </div>
      </div>

      {/* Tabelle */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Rolle</th>
                <th>Kontakt</th>
                <th>Atemschutz</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 32 }}>Keine Kameraden gefunden</td></tr>
              ) : gefiltert.map(k => (
                <tr key={k.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--red-light)', color: 'var(--red-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                        {(k.vorname?.[0] ?? '') + (k.nachname?.[0] ?? '')}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500, color: 'var(--gray-700)' }}>{k.vorname} {k.nachname}</div>
                        {k.eintrittsdatum && <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>Seit {format(new Date(k.eintrittsdatum), 'yyyy', { locale: de })}</div>}
                      </div>
                    </div>
                  </td>
                  <td><span className="badge badge-blue" style={{ fontSize: 11 }}>{ROLLEN_LABEL[k.rolle] ?? k.rolle}</span></td>
                  <td>
                    <div style={{ fontSize: 13 }}>{k.email}</div>
                    {k.telefon && <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{k.telefon}</div>}
                  </td>
                  <td>
                    {k.atemschutz
                      ? <span className="badge badge-green">Ja</span>
                      : <span className="badge badge-gray">Nein</span>}
                  </td>
                  <td>
                    <span className={`badge badge-${statusColor(k.status)}`}>{statusLabel(k.status)}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {k.status === 'ausstehend' && (
                        <button className="btn btn-sm" style={{ background: '#D5F5E3', color: '#1E8449', border: 'none' }} onClick={() => statusAendern(k.id, 'aktiv')}>
                          Freischalten
                        </button>
                      )}
                      <button className="btn btn-sm btn-secondary" onClick={() => setEditModal({ ...k, fuehrerschein: k.fuehrerschein ?? [] })}>
                        Bearbeiten
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setEditModal(null)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3>Kamerad bearbeiten</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditModal(null)}>✕</button>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Vorname</label>
                <input value={editModal.vorname} onChange={e => setEditModal(m => ({ ...m, vorname: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Nachname</label>
                <input value={editModal.nachname} onChange={e => setEditModal(m => ({ ...m, nachname: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Telefon</label>
                <input value={editModal.telefon ?? ''} onChange={e => setEditModal(m => ({ ...m, telefon: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Geburtsdatum</label>
                <input type="date" value={editModal.geburtsdatum ?? ''} onChange={e => setEditModal(m => ({ ...m, geburtsdatum: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Eintrittsdatum</label>
                <input type="date" value={editModal.eintrittsdatum ?? ''} onChange={e => setEditModal(m => ({ ...m, eintrittsdatum: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Rolle</label>
                <select value={editModal.rolle} onChange={e => setEditModal(m => ({ ...m, rolle: e.target.value }))}>
                  {ROLLEN.map(r => <option key={r} value={r}>{ROLLEN_LABEL[r]}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={editModal.status} onChange={e => setEditModal(m => ({ ...m, status: e.target.value }))}>
                <option value="ausstehend">Ausstehend</option>
                <option value="aktiv">Aktiv</option>
                <option value="inaktiv">Inaktiv</option>
              </select>
            </div>
            <div className="form-group">
              <label>Führerscheinklassen</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {FS_OPTIONEN.map(fs => (
                  <button key={fs} type="button"
                    style={{
                      padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                      border: '1px solid',
                      background: editModal.fuehrerschein?.includes(fs) ? 'var(--red)' : 'var(--white)',
                      color: editModal.fuehrerschein?.includes(fs) ? 'white' : 'var(--gray-500)',
                      borderColor: editModal.fuehrerschein?.includes(fs) ? 'var(--red)' : 'var(--gray-200)',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      const fs_list = editModal.fuehrerschein ?? []
                      setEditModal(m => ({
                        ...m,
                        fuehrerschein: fs_list.includes(fs) ? fs_list.filter(x => x !== fs) : [...fs_list, fs]
                      }))
                    }}>
                    {fs}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={editModal.atemschutz} onChange={e => setEditModal(m => ({ ...m, atemschutz: e.target.checked }))} style={{ width: 'auto' }} />
                Atemschutzträger
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setEditModal(null)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
                {saving ? 'Speichern...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function statusColor(s) { return s === 'aktiv' ? 'green' : s === 'ausstehend' ? 'amber' : 'gray' }
function statusLabel(s) { return s === 'aktiv' ? 'Aktiv' : s === 'ausstehend' ? 'Ausstehend' : 'Inaktiv' }
