import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

export default function PruefungenPage() {
  const { profile, isAusbilder, isAdmin } = useAuth()
  const [pruefungen, setPruefungen] = useState([])
  const [ergebnisse, setErgebnisse] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('liste') // liste | erstellen | ablegen | auswertung
  const [selected, setSelected] = useState(null)
  const [msg, setMsg] = useState('')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const [{ data: p }, { data: e }] = await Promise.all([
      supabase.from('pruefungen').select('*, erstellt_von:profiles(vorname,nachname)').order('erstellt_am', { ascending: false }),
      supabase.from('pruefungs_ergebnisse').select('*').eq('kamerad_id', profile.id),
    ])
    setPruefungen(p ?? [])
    setErgebnisse(e ?? [])
    setLoading(false)
  }

  function hatAbgelegt(id) { return ergebnisse.find(e => e.pruefung_id === id) }

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  if (view === 'erstellen') return <PruefungErstellen profile={profile} onBack={() => { setView('liste'); fetchData() }} />
  if (view === 'ablegen' && selected) return <PruefungAblegen pruefung={selected} profile={profile} onBack={() => { setView('liste'); fetchData() }} />
  if (view === 'auswertung' && selected) return <PruefungAuswertung pruefung={selected} onBack={() => setView('liste')} />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Prüfungen</h1>
          <p style={{ marginTop: 4 }}>{pruefungen.filter(p => p.aktiv).length} aktive Prüfungen</p>
        </div>
        {isAusbilder && (
          <button className="btn btn-primary" onClick={() => setView('erstellen')}>+ Neue Prüfung</button>
        )}
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}

      {pruefungen.length === 0 ? (
        <div className="empty-state card">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          <p>Noch keine Prüfungen vorhanden</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pruefungen.map(p => {
            const ergebnis = hatAbgelegt(p.id)
            return (
              <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontWeight: 500, fontSize: 15, color: 'var(--gray-700)' }}>{p.titel}</span>
                    {p.aktiv ? <span className="badge badge-green">Aktiv</span> : <span className="badge badge-gray">Inaktiv</span>}
                  </div>
                  {p.beschreibung && <p style={{ fontSize: 13, color: 'var(--gray-400)' }}>{p.beschreibung}</p>}
                  <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                    Erstellt von {p.erstellt_von?.vorname} {p.erstellt_von?.nachname} · {format(new Date(p.erstellt_am), 'd. MMM yyyy', { locale: de })} · Bestehen: {p.bestehens_prozent}%
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {ergebnis && (
                    <span className={`badge badge-${ergebnis.bestanden ? 'green' : 'red'}`} style={{ fontSize: 12 }}>
                      {ergebnis.bestanden ? `Bestanden ${Math.round(ergebnis.punkte_erreicht / ergebnis.punkte_gesamt * 100)}%` : 'Nicht bestanden'}
                    </span>
                  )}
                  {isAusbilder && (
                    <>
                      <button className="btn btn-sm btn-secondary" onClick={() => { setSelected(p); setView('auswertung') }}>Auswertung</button>
                      <AktivToggle pruefung={p} onToggle={fetchData} />
                    </>
                  )}
                  {p.aktiv && !ergebnis && (
                    <button className="btn btn-sm btn-primary" onClick={() => { setSelected(p); setView('ablegen') }}>
                      Prüfung ablegen
                    </button>
                  )}
                  {p.aktiv && ergebnis && (
                    <button className="btn btn-sm btn-secondary" onClick={() => { setSelected(p); setView('ablegen') }}>
                      Wiederholen
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AktivToggle({ pruefung, onToggle }) {
  async function toggle() {
    await supabase.from('pruefungen').update({ aktiv: !pruefung.aktiv }).eq('id', pruefung.id)
    onToggle()
  }
  return (
    <button className={`btn btn-sm ${pruefung.aktiv ? 'btn-secondary' : 'btn-primary'}`} onClick={toggle}>
      {pruefung.aktiv ? 'Deaktivieren' : 'Aktivieren'}
    </button>
  )
}

function PruefungErstellen({ profile, onBack }) {
  const [form, setForm] = useState({ titel: '', beschreibung: '', bestehens_prozent: 70 })
  const [fragen, setFragen] = useState([])
  const [saving, setSaving] = useState(false)

  function addFrage() {
    setFragen(f => [...f, { id: Date.now(), frage_text: '', typ: 'multiple_choice', antworten: [{ text: '', richtig: false }, { text: '', richtig: false }, { text: '', richtig: false }, { text: '', richtig: false }], punkte: 1, reihenfolge: f.length }])
  }

  function updateFrage(id, field, value) {
    setFragen(fs => fs.map(f => f.id === id ? { ...f, [field]: value } : f))
  }

  function updateAntwort(frageId, idx, field, value) {
    setFragen(fs => fs.map(f => {
      if (f.id !== frageId) return f
      const antworten = [...f.antworten]
      antworten[idx] = { ...antworten[idx], [field]: value }
      if (field === 'richtig' && value && f.typ !== 'multiple_choice') {
        antworten.forEach((a, i) => { if (i !== idx) antworten[i] = { ...a, richtig: false } })
      }
      return { ...f, antworten }
    }))
  }

  function removeFrage(id) { setFragen(fs => fs.filter(f => f.id !== id)) }

  async function handleSave() {
    if (!form.titel || fragen.length === 0) return alert('Titel und mindestens eine Frage erforderlich')
    setSaving(true)
    const { data: pruefung } = await supabase.from('pruefungen').insert({ ...form, erstellt_von: profile.id, aktiv: false }).select().single()
    if (pruefung) {
      await supabase.from('fragen').insert(fragen.map(({ id, ...f }) => ({ ...f, pruefung_id: pruefung.id })))
    }
    setSaving(false)
    onBack()
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurück</button>
          <h1>Neue Prüfung erstellen</h1>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Speichern...' : 'Prüfung speichern'}</button>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 16 }}>Grunddaten</h3>
        <div className="form-group">
          <label>Titel der Prüfung</label>
          <input value={form.titel} onChange={e => setForm(f => ({ ...f, titel: e.target.value }))} placeholder="z.B. Atemschutzgeräteträger Grundausbildung" />
        </div>
        <div className="form-group">
          <label>Beschreibung (optional)</label>
          <textarea value={form.beschreibung} onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))} rows={2} />
        </div>
        <div className="form-group">
          <label>Bestehensgrenze (%)</label>
          <input type="number" min="1" max="100" value={form.bestehens_prozent} onChange={e => setForm(f => ({ ...f, bestehens_prozent: parseInt(e.target.value) }))} style={{ maxWidth: 100 }} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3>Fragen ({fragen.length})</h3>
        <button className="btn btn-secondary btn-sm" onClick={addFrage}>+ Frage hinzufügen</button>
      </div>

      {fragen.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 32 }}>
          <p>Noch keine Fragen. Klicke auf "Frage hinzufügen".</p>
        </div>
      )}

      {fragen.map((frage, fi) => (
        <div key={frage.id} className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-400)' }}>Frage {fi + 1}</span>
            <select value={frage.typ} onChange={e => updateFrage(frage.id, 'typ', e.target.value)} style={{ maxWidth: 180 }}>
              <option value="multiple_choice">Multiple Choice</option>
              <option value="wahr_falsch">Wahr / Falsch</option>
            </select>
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', color: 'var(--red)' }} onClick={() => removeFrage(frage.id)}>Entfernen</button>
          </div>
          <div className="form-group">
            <label>Fragetext</label>
            <input value={frage.frage_text} onChange={e => updateFrage(frage.id, 'frage_text', e.target.value)} placeholder="Fragetext eingeben..." />
          </div>
          <label style={{ marginBottom: 8 }}>Antworten (richtige markieren)</label>
          {(frage.typ === 'wahr_falsch' ? [{ text: 'Wahr', richtig: true }, { text: 'Falsch', richtig: false }] : frage.antworten).map((a, ai) => (
            <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <input type={frage.typ === 'wahr_falsch' ? 'radio' : 'checkbox'} checked={frage.antworten[ai]?.richtig ?? false}
                onChange={e => updateAntwort(frage.id, ai, 'richtig', e.target.checked)}
                style={{ width: 'auto', flexShrink: 0 }} name={`frage-${frage.id}`} />
              {frage.typ === 'wahr_falsch'
                ? <span style={{ fontSize: 14 }}>{a.text}</span>
                : <input value={frage.antworten[ai]?.text ?? ''} onChange={e => updateAntwort(frage.id, ai, 'text', e.target.value)} placeholder={`Antwort ${ai + 1}`} />
              }
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function PruefungAblegen({ pruefung, profile, onBack }) {
  const [fragen, setFragen] = useState([])
  const [antworten, setAntworten] = useState({})
  const [loading, setLoading] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [ergebnis, setErgebnis] = useState(null)

  useEffect(() => {
    supabase.from('fragen').select('*').eq('pruefung_id', pruefung.id).order('reihenfolge').then(({ data }) => {
      setFragen(data ?? [])
      setLoading(false)
    })
  }, [])

  function setAntwort(frageId, value) {
    setAntworten(a => ({ ...a, [frageId]: value }))
  }

  async function handleAbgabe() {
    let richtig = 0, gesamt = 0
    fragen.forEach(f => {
      gesamt += f.punkte
      const auswahl = antworten[f.id]
      if (!auswahl) return
      if (f.typ === 'wahr_falsch' || f.typ === 'multiple_choice') {
        const richtigeAntworten = f.antworten.filter(a => a.richtig).map(a => a.text)
        if (Array.isArray(auswahl) ? richtigeAntworten.every(r => auswahl.includes(r)) && auswahl.length === richtigeAntworten.length
          : richtigeAntworten.includes(auswahl)) richtig += f.punkte
      }
    })
    const bestanden = gesamt > 0 && (richtig / gesamt * 100) >= pruefung.bestehens_prozent
    const res = { punkte_erreicht: richtig, punkte_gesamt: gesamt, bestanden, prozent: gesamt > 0 ? Math.round(richtig / gesamt * 100) : 0 }
    await supabase.from('pruefungs_ergebnisse').upsert({ kamerad_id: profile.id, pruefung_id: pruefung.id, punkte_erreicht: richtig, punkte_gesamt: gesamt, bestanden, antworten_detail: antworten })
    setErgebnis(res)
    setSubmitted(true)
  }

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  if (submitted && ergebnis) return (
    <div>
      <div className="page-header">
        <h1>Ergebnis</h1>
        <button className="btn btn-secondary" onClick={onBack}>Zurück zur Übersicht</button>
      </div>
      <div className="card" style={{ textAlign: 'center', padding: 48 }}>
        <div style={{ fontSize: 64, fontWeight: 700, color: ergebnis.bestanden ? '#1E8449' : 'var(--red)', marginBottom: 12 }}>
          {ergebnis.prozent}%
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 8, color: 'var(--gray-800)' }}>
          {ergebnis.bestanden ? 'Bestanden!' : 'Nicht bestanden'}
        </div>
        <div style={{ color: 'var(--gray-400)' }}>
          {ergebnis.punkte_erreicht} von {ergebnis.punkte_gesamt} Punkten · Bestehensgrenze: {pruefung.bestehens_prozent}%
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurück</button>
          <h1>{pruefung.titel}</h1>
        </div>
        <button className="btn btn-primary" onClick={handleAbgabe}>Abgeben</button>
      </div>

      {fragen.map((f, fi) => (
        <div key={f.id} className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 14, color: 'var(--gray-700)' }}>
            <span style={{ color: 'var(--gray-400)', marginRight: 8 }}>{fi + 1}.</span>{f.frage_text}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {f.antworten.map((a, ai) => (
              <label key={ai} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--gray-200)', cursor: 'pointer', fontSize: 14 }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--red)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--gray-200)'}
              >
                <input type="radio" name={`f-${f.id}`} value={a.text}
                  checked={antworten[f.id] === a.text}
                  onChange={() => setAntwort(f.id, a.text)}
                  style={{ width: 'auto' }} />
                {a.text}
              </label>
            ))}
          </div>
        </div>
      ))}

      <div style={{ textAlign: 'right', marginTop: 16 }}>
        <button className="btn btn-primary btn-lg" onClick={handleAbgabe}>Prüfung abgeben</button>
      </div>
    </div>
  )
}

function PruefungAuswertung({ pruefung, onBack }) {
  const [ergebnisse, setErgebnisse] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('pruefungs_ergebnisse')
      .select('*, kamerad:profiles(vorname,nachname)')
      .eq('pruefung_id', pruefung.id)
      .order('abgelegt_am', { ascending: false })
      .then(({ data }) => { setErgebnisse(data ?? []); setLoading(false) })
  }, [])

  const bestanden = ergebnisse.filter(e => e.bestanden).length
  const durchschnitt = ergebnisse.length ? Math.round(ergebnisse.reduce((s, e) => s + (e.punkte_gesamt > 0 ? e.punkte_erreicht / e.punkte_gesamt * 100 : 0), 0) / ergebnisse.length) : 0

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurück</button>
          <h1>Auswertung: {pruefung.titel}</h1>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card"><div className="stat-label">Teilnehmer</div><div className="stat-value">{ergebnisse.length}</div></div>
        <div className="stat-card accent"><div className="stat-label">Bestanden</div><div className="stat-value">{bestanden}</div></div>
        <div className="stat-card"><div className="stat-label">Nicht bestanden</div><div className="stat-value">{ergebnisse.length - bestanden}</div></div>
        <div className="stat-card"><div className="stat-label">Ø Ergebnis</div><div className="stat-value">{durchschnitt}%</div></div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Kamerad</th>
              <th>Ergebnis</th>
              <th>Punkte</th>
              <th>Abgelegt am</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {ergebnisse.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 24 }}>Noch keine Ergebnisse</td></tr>
            ) : ergebnisse.map(e => (
              <tr key={e.id}>
                <td style={{ fontWeight: 500 }}>{e.kamerad?.vorname} {e.kamerad?.nachname}</td>
                <td>{e.punkte_gesamt > 0 ? Math.round(e.punkte_erreicht / e.punkte_gesamt * 100) : 0}%</td>
                <td>{e.punkte_erreicht} / {e.punkte_gesamt}</td>
                <td style={{ fontSize: 13 }}>{format(new Date(e.abgelegt_am), 'd. MMM yyyy HH:mm', { locale: de })}</td>
                <td><span className={`badge badge-${e.bestanden ? 'green' : 'red'}`}>{e.bestanden ? 'Bestanden' : 'Nicht bestanden'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
