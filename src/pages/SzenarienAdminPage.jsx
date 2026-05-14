import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

const KATEGORIEN = [
  { value: 'verkehrsunfall',          label: 'Verkehrsunfall',         icon: '🚗' },
  { value: 'wohnungsbrand',           label: 'Wohnungsbrand',          icon: '🔥' },
  { value: 'technische_hilfeleistung',label: 'Techn. Hilfeleistung',   icon: '🔧' },
  { value: 'gefahrgut',               label: 'Gefahrgut',              icon: '☢️' },
  { value: 'waldbrand',               label: 'Waldbrand',              icon: '🌲' },
  { value: 'sonstiges',               label: 'Sonstiges',              icon: '📋' },
]

const SCHWIERIGKEITEN = [
  { value: 'leicht', label: 'Leicht' },
  { value: 'mittel', label: 'Mittel' },
  { value: 'schwer', label: 'Schwer' },
]

const LEER_FORM = {
  titel: '',
  kategorie: 'verkehrsunfall',
  anfangs_meldung: '',
  beschreibung: '',
  schwierigkeitsgrad: 'mittel',
  aktiv: true,
}

export default function SzenarienAdminPage() {
  const { profile } = useAuth()
  const [szenarien, setSzenarien] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(LEER_FORM)
  const [speichern, setSpeichern] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { ladeSzenarien() }, [])

  async function ladeSzenarien() {
    const { data } = await supabase
      .from('szenarien')
      .select('*, erstellt_von:profiles(vorname,nachname)')
      .order('kategorie')
      .order('titel')
    setSzenarien(data ?? [])
    setLoading(false)
  }

  function oeffneNeu() {
    setEditId(null)
    setForm(LEER_FORM)
    setModal(true)
  }

  function oeffneEdit(sz) {
    setEditId(sz.id)
    setForm({
      titel:            sz.titel,
      kategorie:        sz.kategorie,
      anfangs_meldung:  sz.anfangs_meldung,
      beschreibung:     sz.beschreibung ?? '',
      schwierigkeitsgrad: sz.schwierigkeitsgrad,
      aktiv:            sz.aktiv,
    })
    setModal(true)
  }

  async function handleSpeichern(e) {
    e.preventDefault()
    if (!form.titel.trim() || !form.anfangs_meldung.trim()) return
    setSpeichern(true)

    const payload = {
      titel:            form.titel.trim(),
      kategorie:        form.kategorie,
      anfangs_meldung:  form.anfangs_meldung.trim(),
      beschreibung:     form.beschreibung.trim() || null,
      schwierigkeitsgrad: form.schwierigkeitsgrad,
      aktiv:            form.aktiv,
    }

    if (editId) {
      await supabase.from('szenarien').update(payload).eq('id', editId)
      setMsg('Szenario gespeichert.')
    } else {
      await supabase.from('szenarien').insert({ ...payload, erstellt_von: profile.id })
      setMsg('Szenario angelegt.')
    }

    await ladeSzenarien()
    setModal(false)
    setSpeichern(false)
    setTimeout(() => setMsg(''), 3000)
  }

  async function handleLoeschen(id, titel) {
    if (!confirm(`"${titel}" wirklich löschen?`)) return
    await supabase.from('szenarien').delete().eq('id', id)
    await ladeSzenarien()
  }

  async function toggleAktiv(sz) {
    await supabase.from('szenarien').update({ aktiv: !sz.aktiv }).eq('id', sz.id)
    setSzenarien(prev => prev.map(s => s.id === sz.id ? { ...s, aktiv: !s.aktiv } : s))
  }

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Szenarien verwalten</h1>
          <p style={{ marginTop: 4 }}>{szenarien.length} Szenario{szenarien.length !== 1 ? 's' : ''} gesamt</p>
        </div>
        <button className="btn btn-primary" onClick={oeffneNeu}>
          <span>+</span> Neues Szenario
        </button>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}

      {szenarien.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <p style={{ color: 'var(--gray-400)' }}>Noch keine Szenarien vorhanden.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {szenarien.map(sz => {
            const kat = KATEGORIEN.find(k => k.value === sz.kategorie)
            return (
              <div key={sz.id} className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px', opacity: sz.aktiv ? 1 : 0.55 }}>
                <span style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>{kat?.icon ?? '📋'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-700)' }}>{sz.titel}</span>
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, background: 'var(--gray-100)', color: 'var(--gray-500)' }}>{kat?.label}</span>
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, background: 'var(--gray-100)', color: 'var(--gray-500)' }}>{sz.schwierigkeitsgrad}</span>
                    {!sz.aktiv && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, background: '#FFF1F2', color: '#BE123C' }}>Inaktiv</span>}
                  </div>
                  {sz.beschreibung && (
                    <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 4, lineHeight: 1.4 }}>{sz.beschreibung}</div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                    Angelegt: {format(new Date(sz.erstellt_am), 'dd.MM.yyyy', { locale: de })}
                    {sz.erstellt_von && ` von ${sz.erstellt_von.vorname} ${sz.erstellt_von.nachname}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => toggleAktiv(sz)} title={sz.aktiv ? 'Deaktivieren' : 'Aktivieren'}>
                    {sz.aktiv ? '⏸' : '▶'}
                  </button>
                  <button className="btn btn-sm btn-secondary" onClick={() => oeffneEdit(sz)} title="Bearbeiten">✏️</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleLoeschen(sz.id, sz.titel)} title="Löschen">✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h3>{editId ? 'Szenario bearbeiten' : 'Neues Szenario anlegen'}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSpeichern}>
              <div className="form-group">
                <label>Titel *</label>
                <input
                  value={form.titel}
                  onChange={e => setForm(f => ({ ...f, titel: e.target.value }))}
                  placeholder="z.B. Verkehrsunfall mit eingeklemmter Person"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Kategorie</label>
                  <select value={form.kategorie} onChange={e => setForm(f => ({ ...f, kategorie: e.target.value }))}>
                    {KATEGORIEN.map(k => <option key={k.value} value={k.value}>{k.icon} {k.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Schwierigkeit</label>
                  <select value={form.schwierigkeitsgrad} onChange={e => setForm(f => ({ ...f, schwierigkeitsgrad: e.target.value }))}>
                    {SCHWIERIGKEITEN.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Alarmierungsmeldung *</label>
                <textarea
                  value={form.anfangs_meldung}
                  onChange={e => setForm(f => ({ ...f, anfangs_meldung: e.target.value }))}
                  placeholder="ALARMIERUNG: Beschreibung des Einsatzes, Ort, bekannte Lage, alarmierte Kräfte…"
                  rows={4}
                  required
                />
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                  Diese Meldung wird dem Kamerad zu Beginn präsentiert. Möglichst realistisch formulieren.
                </div>
              </div>

              <div className="form-group">
                <label>Interne Beschreibung (optional)</label>
                <textarea
                  value={form.beschreibung}
                  onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))}
                  placeholder="Lernziele, Schwerpunkte, Hinweise für Ausbilder…"
                  rows={2}
                />
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                  Nur für Ausbilder sichtbar, nicht für den übenden Kamerad.
                </div>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.aktiv} onChange={e => setForm(f => ({ ...f, aktiv: e.target.checked }))} />
                  Szenario aktiv (für Kameraden sichtbar)
                </label>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Abbrechen</button>
                <button type="submit" className="btn btn-primary" disabled={speichern}>
                  {speichern ? 'Speichern…' : 'Speichern'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
