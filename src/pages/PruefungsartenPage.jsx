import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const STARTWERTE = ['Sichtpruefung Monatlich', 'Sichtpruefung Jaehrlich', 'Kurzpruefung']

export default function PruefungsartenPage() {
  const [arten, setArten] = useState([])
  const [loading, setLoading] = useState(true)
  const [neuerName, setNeuerName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { laden() }, [])

  async function laden() {
    setLoading(true)
    const { data } = await supabase.from('pruefungsarten').select('*').order('reihenfolge').order('name')
    if (data && data.length === 0) await startwerteBefuellen()
    else setArten(data ?? [])
    setLoading(false)
  }

  async function startwerteBefuellen() {
    const rows = STARTWERTE.map((name, i) => ({ name, reihenfolge: i }))
    const { data } = await supabase.from('pruefungsarten').insert(rows).select()
    setArten(data ?? [])
  }

  async function hinzufuegen(e) {
    e.preventDefault()
    const name = neuerName.trim()
    if (!name) return
    setSaving(true)
    setError('')
    const { data, error: err } = await supabase.from('pruefungsarten').insert({ name, reihenfolge: arten.length }).select().single()
    if (err) { setError('Fehler: ' + err.message); setSaving(false); return }
    setArten(prev => [...prev, data])
    setNeuerName('')
    setSaving(false)
  }

  async function loeschen(id) {
    if (!confirm('Pruefungsart loeschen?')) return
    await supabase.from('pruefungsarten').delete().eq('id', id)
    setArten(prev => prev.filter(a => a.id !== id))
  }

  async function reihenfolgeAendern(id, richtung) {
    const idx = arten.findIndex(a => a.id === id)
    const neu = [...arten]
    const tausch = richtung === 'hoch' ? idx - 1 : idx + 1
    if (tausch < 0 || tausch >= neu.length) return
    ;[neu[idx], neu[tausch]] = [neu[tausch], neu[idx]]
    setArten(neu)
    await Promise.all(
      neu.map((a, i) => supabase.from('pruefungsarten').update({ reihenfolge: i }).eq('id', a.id))
    )
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Pruefungsarten</h1>
      <p style={{ color: 'var(--gray-400)', fontSize: 14, marginBottom: 24 }}>
        Hier legst du die Kategorien fest, die Geraetewarte bei der Pruefung auswaehlen koennen.
      </p>

      {loading ? (
        <div className="loading-page"><div className="spinner" /></div>
      ) : (
        <>
          <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
            {arten.length === 0 ? (
              <div style={{ padding: '20px 16px', color: 'var(--gray-400)', fontSize: 14, textAlign: 'center' }}>
                Noch keine Pruefungsarten angelegt.
              </div>
            ) : arten.map((a, i) => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 16px',
                borderBottom: i < arten.length - 1 ? '1px solid var(--gray-100)' : 'none',
              }}>
                <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{a.name}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => reihenfolgeAendern(a.id, 'hoch')} disabled={i === 0}
                    className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                  <button onClick={() => reihenfolgeAendern(a.id, 'runter')} disabled={i === arten.length - 1}
                    className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', opacity: i === arten.length - 1 ? 0.3 : 1 }}>↓</button>
                  <button onClick={() => loeschen(a.id)} className="btn btn-ghost btn-sm"
                    style={{ padding: '4px 8px', color: 'var(--red)' }}>✕</button>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={hinzufuegen} style={{ display: 'flex', gap: 10 }}>
            <input
              className="form-control"
              value={neuerName}
              onChange={e => setNeuerName(e.target.value)}
              placeholder="Neue Pruefungsart..."
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-primary" disabled={saving || !neuerName.trim()}>
              {saving ? '...' : 'Hinzufuegen'}
            </button>
          </form>
          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>{error}</div>}
        </>
      )}
    </div>
  )
}
