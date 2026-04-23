import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format, isPast, isToday } from 'date-fns'
import { de } from 'date-fns/locale'

const STATUS_LIST = ['offen', 'in_arbeit', 'erledigt']
const STATUS_LABEL = { offen: 'Offen', in_arbeit: 'In Arbeit', erledigt: 'Erledigt' }
const STATUS_COLOR = { offen: 'amber', in_arbeit: 'blue', erledigt: 'green' }
const PRIO_COLOR = { niedrig: 'gray', mittel: 'amber', hoch: 'red' }

export default function AufgabenPage() {
  const { profile, isAdmin, isGruppenfuehrer } = useAuth()
  const [aufgaben, setAufgaben] = useState([])
  const [kameraden, setKameraden] = useState([])
  const [loading, setLoading] = useState(true)
  const [neueAufgabe, setNeueAufgabe] = useState(false)
  const [filter, setFilter] = useState({ status: 'alle', ansicht: 'meine' })
  const [form, setForm] = useState({ titel: '', beschreibung: '', zugewiesen_an: '', faellig_am: '', prioritaet: 'mittel' })
  const [saving, setSaving] = useState(false)

  const kannErstellen = isAdmin || isGruppenfuehrer

  useEffect(() => { fetchData() }, [filter.ansicht])

  async function fetchData() {
    let query = supabase.from('aufgaben')
      .select('*, zugewiesen_an:profiles!aufgaben_zugewiesen_an_fkey(vorname,nachname), erstellt_von:profiles!aufgaben_erstellt_von_fkey(vorname,nachname)')
      .order('erstellt_am', { ascending: false })

    if (filter.ansicht === 'meine') {
      query = query.eq('zugewiesen_an', profile.id)
    }

    const { data } = await query
    setAufgaben(data ?? [])

    if (kannErstellen) {
      const { data: k } = await supabase.from('profiles').select('id,vorname,nachname').eq('status', 'aktiv').order('nachname')
      setKameraden(k ?? [])
    }

    setLoading(false)
  }

  async function handleErstellen(e) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('aufgaben').insert({
      titel: form.titel,
      beschreibung: form.beschreibung || null,
      zugewiesen_an: form.zugewiesen_an || null,
      faellig_am: form.faellig_am || null,
      prioritaet: form.prioritaet,
      erstellt_von: profile.id,
    })
    setForm({ titel: '', beschreibung: '', zugewiesen_an: '', faellig_am: '', prioritaet: 'mittel' })
    setNeueAufgabe(false)
    await fetchData()
    setSaving(false)
  }

  async function statusAendern(id, status) {
    await supabase.from('aufgaben').update({ status }).eq('id', id)
    setAufgaben(a => a.map(x => x.id === id ? { ...x, status } : x))
  }

  async function loeschen(id) {
    if (!confirm('Aufgabe wirklich löschen?')) return
    await supabase.from('aufgaben').delete().eq('id', id)
    setAufgaben(a => a.filter(x => x.id !== id))
  }

  const gefiltert = aufgaben.filter(a => filter.status === 'alle' || a.status === filter.status)

  const istUeberfaellig = (a) => a.faellig_am && isPast(new Date(a.faellig_am)) && !isToday(new Date(a.faellig_am)) && a.status !== 'erledigt'

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Aufgaben</h1>
          <p style={{ marginTop: 4 }}>{gefiltert.filter(a => a.status !== 'erledigt').length} offene Aufgaben</p>
        </div>
        {kannErstellen && (
          <button className="btn btn-primary" onClick={() => setNeueAufgabe(true)}>+ Neue Aufgabe</button>
        )}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {kannErstellen && (
          <div style={{ display: 'flex', gap: 6, marginRight: 8 }}>
            <button className={`btn btn-sm ${filter.ansicht === 'meine' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(f => ({ ...f, ansicht: 'meine' }))}>Meine</button>
            <button className={`btn btn-sm ${filter.ansicht === 'alle' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(f => ({ ...f, ansicht: 'alle' }))}>Alle</button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          {['alle', ...STATUS_LIST].map(s => (
            <button key={s} className={`btn btn-sm ${filter.status === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(f => ({ ...f, status: s }))}>
              {s === 'alle' ? 'Alle' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {gefiltert.length === 0 ? (
        <div className="empty-state card">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          <p>Keine Aufgaben</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {gefiltert.map(a => (
            <div key={a.id} className="card" style={{
              display: 'flex', alignItems: 'flex-start', gap: 16,
              borderLeft: `3px solid ${istUeberfaellig(a) ? 'var(--red)' : 'transparent'}`,
              padding: '16px 20px 16px 17px',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontWeight: 500, fontSize: 15, color: 'var(--gray-700)' }}>{a.titel}</span>
                  <span className={`badge badge-${PRIO_COLOR[a.prioritaet]}`} style={{ fontSize: 11 }}>{a.prioritaet}</span>
                  {istUeberfaellig(a) && <span className="badge badge-red" style={{ fontSize: 11 }}>Überfällig</span>}
                </div>
                {a.beschreibung && <p style={{ fontSize: 13, color: 'var(--gray-400)', lineHeight: 1.5, marginBottom: 6 }}>{a.beschreibung}</p>}
                <div style={{ fontSize: 12, color: 'var(--gray-400)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {a.zugewiesen_an && <span>→ {a.zugewiesen_an.vorname} {a.zugewiesen_an.nachname}</span>}
                  {a.faellig_am && <span>Fällig: {format(new Date(a.faellig_am), 'd. MMM yyyy', { locale: de })}</span>}
                  <span>von {a.erstellt_von?.vorname} {a.erstellt_von?.nachname}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                <span className={`badge badge-${STATUS_COLOR[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                <select value={a.status} onChange={e => statusAendern(a.id, e.target.value)}
                  style={{ width: 'auto', padding: '5px 10px', fontSize: 13 }}>
                  {STATUS_LIST.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
                {(isAdmin || a.erstellt_von?.id === profile.id) && (
                  <button className="btn btn-sm btn-danger" onClick={() => loeschen(a.id)}>✕</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Neue Aufgabe Modal */}
      {neueAufgabe && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setNeueAufgabe(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Neue Aufgabe erstellen</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setNeueAufgabe(false)}>✕</button>
            </div>
            <form onSubmit={handleErstellen}>
              <div className="form-group">
                <label>Titel</label>
                <input value={form.titel} onChange={e => setForm(f => ({ ...f, titel: e.target.value }))} placeholder="Aufgabentitel" required />
              </div>
              <div className="form-group">
                <label>Beschreibung (optional)</label>
                <textarea value={form.beschreibung} onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))} rows={3} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Zuweisen an</label>
                  <select value={form.zugewiesen_an} onChange={e => setForm(f => ({ ...f, zugewiesen_an: e.target.value }))}>
                    <option value="">— Alle / Niemand</option>
                    {kameraden.map(k => <option key={k.id} value={k.id}>{k.nachname}, {k.vorname}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Priorität</label>
                  <select value={form.prioritaet} onChange={e => setForm(f => ({ ...f, prioritaet: e.target.value }))}>
                    <option value="niedrig">Niedrig</option>
                    <option value="mittel">Mittel</option>
                    <option value="hoch">Hoch</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Fällig am (optional)</label>
                <input type="date" value={form.faellig_am} onChange={e => setForm(f => ({ ...f, faellig_am: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setNeueAufgabe(false)}>Abbrechen</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Erstellen...' : 'Aufgabe erstellen'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
