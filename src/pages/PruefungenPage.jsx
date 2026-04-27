import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

export default function PruefungenPage() {
  const { profile, isAusbilder, isAdmin } = useAuth()
  const isWehrleiter = profile?.rolle === 'wehrleiter'
  const [pruefungen, setPruefungen] = useState([])
  const [ergebnisse, setErgebnisse] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('liste')
  const [selected, setSelected] = useState(null)
  const [importFehler, setImportFehler] = useState('')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    let pruefQuery = supabase.from('pruefungen')
      .select('*, erstellt_von:profiles(vorname,nachname)')
      .order('erstellt_am', { ascending: false })
    if (isWehrleiter) pruefQuery = pruefQuery.eq('wehr_id', profile.wehr_id)
    const [{ data: p }, { data: e }] = await Promise.all([
      pruefQuery,
      supabase.from('pruefungs_ergebnisse').select('*').eq('kamerad_id', profile.id).order('abgelegt_am', { ascending: false }),
    ])
    // Filter: Kameraden sehen nur Pruefungen fuer ihre Wache
    const gefiltert = (p ?? []).filter(pr => {
      if (!pr.sichtbar_fuer_wehren) return true // null = alle
      if (!profile.wehr_id) return false
      return pr.sichtbar_fuer_wehren.includes(profile.wehr_id)
    })
    setPruefungen(isAusbilder ? (p ?? []) : gefiltert)
    setErgebnisse(e ?? [])
    setLoading(false)
  }

  function hatAbgelegt(id) {
    const alle = ergebnisse.filter(e => e.pruefung_id === id)
    if (alle.length === 0) return null
    // Neuestes zurueckgeben
    return alle.sort((a, b) => new Date(b.abgelegt_am) - new Date(a.abgelegt_am))[0]
  }

  function handleImport(e) {
    const datei = e.target.files[0]
    if (!datei) return
    setImportFehler('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target.result)
        if (!json.titel) throw new Error('Feld "titel" fehlt')
        if (!Array.isArray(json.fragen) || json.fragen.length === 0) throw new Error('Keine Fragen gefunden')
        json.fragen.forEach((f, i) => {
          if (!f.frage_text) throw new Error(`Frage ${i+1}: "frage_text" fehlt`)
          if (!f.typ) throw new Error(`Frage ${i+1}: "typ" fehlt`)
          if (!Array.isArray(f.antworten)) throw new Error(`Frage ${i+1}: "antworten" fehlt`)
        })
        setSelected({ _import: true, ...json })
        setView('erstellen')
      } catch (err) {
        setImportFehler('Ungueltige JSON-Datei: ' + err.message)
      }
    }
    reader.readAsText(datei)
    e.target.value = ''
  }

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>
  if (view === 'erstellen') return <PruefungErstellen profile={profile} importDaten={selected?._import ? selected : null} onBack={() => { setSelected(null); setView('liste'); fetchData() }} />
  if (view === 'bearbeiten' && selected) return <PruefungBearbeiten pruefung={selected} profile={profile} onBack={() => { setView('liste'); fetchData() }} />
  if (view === 'ablegen' && selected) return <PruefungAblegen pruefung={selected} profile={profile} onBack={() => { setView('liste'); fetchData() }} />
  if (view === 'auswertung' && selected) return <PruefungAuswertung pruefung={selected} onBack={() => setView('liste')} />
  if (view === 'ergebnis_detail' && selected) return <ErgebnisDetail pruefung={selected.pruefung} ergebnis={selected.ergebnis} onBack={() => setView('liste')} />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Pruefungen</h1>
          <p style={{ marginTop: 4 }}>{pruefungen.filter(p => p.aktiv).length} aktive Pruefungen</p>
        </div>
        {isAusbilder && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label className="btn btn-secondary" style={{ cursor: 'pointer', marginBottom: 0 }}>
              ↑ JSON importieren
              <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
            </label>
            <button className="btn btn-primary" onClick={() => { setSelected(null); setView('erstellen') }}>+ Neue Pruefung</button>
          </div>
        )}
      </div>

      {importFehler && <div className="alert alert-error" style={{ marginBottom: 16 }}>{importFehler}</div>}

      {pruefungen.length === 0 ? (
        <div className="empty-state card">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          <p>Noch keine Pruefungen vorhanden</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pruefungen.map(p => {
            const ergebnis = hatAbgelegt(p.id)
            return (
              <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 500, fontSize: 15, color: 'var(--gray-700)' }}>{p.titel}</span>
                    {p.aktiv ? <span className="badge badge-green">Aktiv</span> : <span className="badge badge-gray">Inaktiv</span>}
                    {p.sichtbar_fuer_wehren && <span className="badge badge-amber" style={{ fontSize: 11 }}>Bestimmte Wachen</span>}
                  </div>
                  {p.beschreibung && <p style={{ fontSize: 13, color: 'var(--gray-400)' }}>{p.beschreibung}</p>}
                  <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                    {p.erstellt_von?.vorname} {p.erstellt_von?.nachname} · {format(new Date(p.erstellt_am), 'd. MMM yyyy', { locale: de })} · Bestehen: {p.bestehens_prozent}%
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {ergebnis && (
                    <>
                      <span className={`badge badge-${ergebnis.bestanden ? 'green' : 'red'}`} style={{ fontSize: 11, alignSelf: 'center' }}>
                        {ergebnis.bestanden ? `Bestanden ${Math.round(ergebnis.punkte_erreicht / ergebnis.punkte_gesamt * 100)}%` : 'Nicht bestanden'}
                      </span>
                      <button className="btn btn-sm btn-secondary" onClick={() => { setSelected({ pruefung: p, ergebnis }); setView('ergebnis_detail') }}>
                        Auswertung ansehen
                      </button>
                    </>
                  )}
                  {isAusbilder && (
                    <>
                      <button className="btn btn-sm btn-secondary" onClick={() => { setSelected(p); setView('auswertung') }}>Auswertung</button>
                      <button className="btn btn-sm btn-secondary" onClick={() => { setSelected(p); setView('bearbeiten') }}>Bearbeiten</button>
                      <WachenToggle pruefung={p} onToggle={fetchData} />
                      <AktivToggle pruefung={p} onToggle={fetchData} />
                    </>
                  )}
                  {p.aktiv && (
                    <button className="btn btn-sm btn-primary" onClick={() => { setSelected(p); setView('ablegen') }}>
                      {ergebnis ? 'Wiederholen' : 'Ablegen'}
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

function WachenToggle({ pruefung, onToggle }) {
  const [modal, setModal] = useState(false)
  const [wehren, setWehren] = useState([])
  const [auswahl, setAuswahl] = useState(pruefung.sichtbar_fuer_wehren ?? null)
  const [modus, setModus] = useState(pruefung.sichtbar_fuer_wehren ? 'ausgewaehlte' : 'alle')
  const [saving, setSaving] = useState(false)

  async function oeffnen() {
    const { data } = await supabase.from('wehren').select('id,name').order('name')
    setWehren(data ?? [])
    setAuswahl(pruefung.sichtbar_fuer_wehren ?? [])
    setModus(pruefung.sichtbar_fuer_wehren ? 'ausgewaehlte' : 'alle')
    setModal(true)
  }

  function toggleWehr(id) {
    setAuswahl(a => (a ?? []).includes(id) ? (a ?? []).filter(x => x !== id) : [...(a ?? []), id])
  }

  async function handleSave() {
    setSaving(true)
    await supabase.from('pruefungen').update({
      sichtbar_fuer_wehren: modus === 'alle' ? null : (auswahl?.length > 0 ? auswahl : null)
    }).eq('id', pruefung.id)
    setModal(false)
    setSaving(false)
    onToggle()
  }

  return (
    <>
      <button className="btn btn-sm btn-secondary" onClick={oeffnen} title="Sichtbarkeit fuer Wachen einstellen">
        🏠 Wachen
      </button>
      {modal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>Sichtbarkeit: {pruefung.titel}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(false)}>x</button>
            </div>
            <div className="form-group">
              <label>Pruefung sichtbar fuer</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button type="button" className={`btn btn-sm ${modus === 'alle' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setModus('alle')}>Alle Wachen</button>
                <button type="button" className={`btn btn-sm ${modus === 'ausgewaehlte' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setModus('ausgewaehlte')}>Nur bestimmte</button>
              </div>
            </div>
            {modus === 'ausgewaehlte' && (
              <div className="form-group">
                <label>Wachen auswaehlen</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                  {wehren.map(w => {
                    const aktiv = (auswahl ?? []).includes(w.id)
                    return (
                      <label key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: `1px solid ${aktiv ? 'var(--red)' : 'var(--gray-200)'}`, cursor: 'pointer', background: aktiv ? 'var(--red-pale)' : 'white' }}>
                        <input type="checkbox" checked={aktiv} onChange={() => toggleWehr(w.id)} style={{ width: 'auto' }} />
                        <span style={{ fontWeight: aktiv ? 500 : 400, color: aktiv ? 'var(--red-dark)' : 'var(--gray-700)' }}>{w.name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Speichern...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ErgebnisDetail({ pruefung, ergebnis, onBack }) {
  const [fragen, setFragen] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('fragen').select('*').eq('pruefung_id', pruefung.id).order('reihenfolge').then(({ data }) => {
      setFragen(data ?? [])
      setLoading(false)
    })
  }, [])

  const antworten = ergebnis.antworten_detail ?? {}
  const prozent = ergebnis.punkte_gesamt > 0 ? Math.round(ergebnis.punkte_erreicht / ergebnis.punkte_gesamt * 100) : 0

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurueck</button>
          <h1>Ergebnis: {pruefung.titel}</h1>
        </div>
      </div>

      {/* Ergebnis-Banner */}
      <div className="card" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20, background: ergebnis.bestanden ? '#EAFAF1' : 'var(--red-pale)', border: `1px solid ${ergebnis.bestanden ? '#A9DFBF' : 'var(--red-light)'}` }}>
        <div style={{ fontSize: 48, fontWeight: 700, color: ergebnis.bestanden ? '#1E8449' : 'var(--red)', flexShrink: 0 }}>{prozent}%</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 18, color: ergebnis.bestanden ? '#1E8449' : 'var(--red-dark)' }}>
            {ergebnis.bestanden ? 'Bestanden' : 'Nicht bestanden'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 4 }}>
            {ergebnis.punkte_erreicht} von {ergebnis.punkte_gesamt} Punkten · Bestehensgrenze: {pruefung.bestehens_prozent}%
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
            Abgelegt am {format(new Date(ergebnis.abgelegt_am), 'd. MMMM yyyy HH:mm', { locale: de })}
          </div>
        </div>
      </div>

      {/* Fragen Durchsicht */}
      <h3 style={{ marginBottom: 12 }}>Fragen und Antworten</h3>
      {fragen.map((f, fi) => {
        const meineAntwort = antworten[f.id]
        const richtigeAntworten = (f.antworten ?? []).filter(a => a.richtig).map(a => a.text)
        const istRichtig = meineAntwort && richtigeAntworten.includes(meineAntwort)
        const nichtBeantwortet = !meineAntwort

        return (
          <div key={f.id} className="card" style={{
            marginBottom: 10,
            borderLeft: `3px solid ${nichtBeantwortet ? 'var(--gray-300)' : istRichtig ? '#1E8449' : 'var(--red)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                background: nichtBeantwortet ? 'var(--gray-200)' : istRichtig ? '#D5F5E3' : 'var(--red-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
              }}>
                {nichtBeantwortet ? '?' : istRichtig ? '✓' : '✗'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 4 }}>Frage {fi + 1}</div>
                <div style={{ fontWeight: 500, color: 'var(--gray-700)', lineHeight: 1.4 }}>{f.frage_text}</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(f.antworten ?? []).map((a, ai) => {
                const istMeineAntwort = meineAntwort === a.text
                const istRichtigeAntwort = a.richtig
                let bg = 'var(--gray-50)', border = 'var(--gray-200)', textColor = 'var(--gray-600)'

                if (istRichtigeAntwort) { bg = '#EAFAF1'; border = '#A9DFBF'; textColor = '#1E8449' }
                if (istMeineAntwort && !istRichtigeAntwort) { bg = 'var(--red-pale)'; border = 'var(--red-light)'; textColor = 'var(--red-dark)' }

                return (
                  <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: `1px solid ${border}`, background: bg }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: textColor, flex: 1 }}>{a.text}</span>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {istRichtigeAntwort && <span style={{ fontSize: 11, color: '#1E8449', fontWeight: 600 }}>Richtig</span>}
                      {istMeineAntwort && <span style={{ fontSize: 11, color: istRichtigeAntwort ? '#1E8449' : 'var(--red)', fontWeight: 600 }}>
                        {istRichtigeAntwort ? '✓ Deine Antwort' : '✗ Deine Antwort'}
                      </span>}
                    </div>
                  </div>
                )
              })}
            </div>

            {nichtBeantwortet && (
              <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 8, fontStyle: 'italic' }}>Nicht beantwortet</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PruefungErstellen({ profile, onBack, importDaten }) {
  const [form, setForm] = useState({
    titel: importDaten?.titel ?? '',
    beschreibung: importDaten?.beschreibung ?? '',
    bestehens_prozent: importDaten?.bestehens_prozent ?? 70,
  })
  const [fragen, setFragen] = useState(
    importDaten?.fragen
      ? importDaten.fragen.map((f, i) => ({
          id: 'imp_' + i, frage_text: f.frage_text ?? '',
          typ: f.typ === 'mehrfachauswahl' ? 'multiple_choice' : (f.typ ?? 'multiple_choice'),
          antworten: f.antworten ?? [], punkte: f.punkte ?? 1, reihenfolge: i,
        }))
      : []
  )
  const [saving, setSaving] = useState(false)
  const istImport = !!importDaten

  function addFrage() {
    setFragen(f => [...f, {
      id: Date.now(), frage_text: '', typ: 'multiple_choice',
      antworten: [{ text: '', richtig: false }, { text: '', richtig: false }, { text: '', richtig: false }, { text: '', richtig: false }],
      punkte: 1, reihenfolge: f.length
    }])
  }

  function updateFrage(id, field, value) { setFragen(fs => fs.map(f => f.id === id ? { ...f, [field]: value } : f)) }
  function updateAntwort(frageId, idx, field, value) {
    setFragen(fs => fs.map(f => {
      if (f.id !== frageId) return f
      const antworten = [...f.antworten]
      antworten[idx] = { ...antworten[idx], [field]: value }
      return { ...f, antworten }
    }))
  }
  function removeFrage(id) { setFragen(fs => fs.filter(f => f.id !== id)) }

  async function handleSave() {
    if (!form.titel || fragen.length === 0) return alert('Titel und mindestens eine Frage erforderlich')
    setSaving(true)
    const { data: pruefung } = await supabase.from('pruefungen').insert({
      ...form, erstellt_von: profile.id, wehr_id: profile.wehr_id, aktiv: false
    }).select().single()
    if (pruefung) {
      await supabase.from('fragen').insert(fragen.map(({ id, ...f }, i) => ({ ...f, pruefung_id: pruefung.id, reihenfolge: i })))
    }
    setSaving(false)
    onBack()
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurueck</button>
          <h1>{istImport ? 'Pruefung importieren' : 'Neue Pruefung'}</h1>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Speichern...' : 'Pruefung speichern'}</button>
      </div>
      {istImport && <div className="alert alert-success" style={{ marginBottom: 16 }}>{fragen.length} Fragen aus JSON importiert</div>}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 16 }}>Grunddaten</h3>
        <div className="form-group">
          <label>Titel</label>
          <input value={form.titel} onChange={e => setForm(f => ({ ...f, titel: e.target.value }))} placeholder="z.B. Atemschutzgeraetetraeger" />
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
        <button className="btn btn-secondary btn-sm" onClick={addFrage}>+ Frage hinzufuegen</button>
      </div>
      {fragen.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 32 }}><p>Noch keine Fragen</p></div>}
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
          <label style={{ marginBottom: 8, display: 'block' }}>Antworten</label>
          {(frage.typ === 'wahr_falsch'
            ? [{ text: 'Wahr', richtig: frage.antworten[0]?.richtig ?? false }, { text: 'Falsch', richtig: frage.antworten[1]?.richtig ?? false }]
            : frage.antworten
          ).map((a, ai) => (
            <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <input type="radio" checked={a.richtig ?? false} onChange={e => updateAntwort(frage.id, ai, 'richtig', e.target.checked)} style={{ width: 'auto', flexShrink: 0 }} name={`frage-${frage.id}`} />
              {frage.typ === 'wahr_falsch' ? <span style={{ fontSize: 14 }}>{a.text}</span> : <input value={a.text ?? ''} onChange={e => updateAntwort(frage.id, ai, 'text', e.target.value)} placeholder={`Antwort ${ai + 1}`} />}
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
    supabase.from('fragen').select('*').eq('pruefung_id', pruefung.id).order('reihenfolge').then(({ data }) => { setFragen(data ?? []); setLoading(false) })
  }, [])

  async function handleAbgabe() {
    let richtig = 0, gesamt = 0
    fragen.forEach(f => {
      gesamt += f.punkte
      const auswahl = antworten[f.id]
      if (!auswahl) return
      const richtigeAntworten = f.antworten.filter(a => a.richtig).map(a => a.text)
      if (richtigeAntworten.includes(auswahl)) richtig += f.punkte
    })
    const bestanden = gesamt > 0 && (richtig / gesamt * 100) >= pruefung.bestehens_prozent
    const res = { punkte_erreicht: richtig, punkte_gesamt: gesamt, bestanden, prozent: gesamt > 0 ? Math.round(richtig / gesamt * 100) : 0, abgelegt_am: new Date().toISOString(), antworten_detail: antworten }
    // Versuch-Nummer ermitteln
    const { count: anzahlVersuche } = await supabase
      .from('pruefungs_ergebnisse')
      .select('*', { count: 'exact', head: true })
      .eq('kamerad_id', profile.id)
      .eq('pruefung_id', pruefung.id)

    await supabase.from('pruefungs_ergebnisse').insert({
      kamerad_id: profile.id,
      pruefung_id: pruefung.id,
      punkte_erreicht: richtig,
      punkte_gesamt: gesamt,
      bestanden,
      antworten_detail: antworten,
      versuch: (anzahlVersuche ?? 0) + 1,
    })
    setErgebnis(res)
    setSubmitted(true)
  }

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  if (submitted && ergebnis) return (
    <div>
      <div className="page-header">
        <h1>Ergebnis</h1>
        <button className="btn btn-secondary" onClick={onBack}>Zurueck zur Uebersicht</button>
      </div>
      <div className="card" style={{ textAlign: 'center', padding: 48, marginBottom: 20 }}>
        <div style={{ fontSize: 56, fontWeight: 700, color: ergebnis.bestanden ? '#1E8449' : 'var(--red)', marginBottom: 12 }}>{ergebnis.prozent}%</div>
        <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 8, color: 'var(--gray-800)' }}>{ergebnis.bestanden ? 'Bestanden!' : 'Nicht bestanden'}</div>
        <div style={{ color: 'var(--gray-400)' }}>{ergebnis.punkte_erreicht} von {ergebnis.punkte_gesamt} Punkten · Grenze: {pruefung.bestehens_prozent}%</div>
      </div>
      <ErgebnisDetail pruefung={pruefung} ergebnis={ergebnis} onBack={onBack} istNachAbgabe />
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurueck</button>
          <h1>{pruefung.titel}</h1>
        </div>
        <button className="btn btn-primary" onClick={handleAbgabe}>Abgeben</button>
      </div>
      {fragen.map((f, fi) => (
        <div key={f.id} className="card" style={{ marginBottom: 10, padding: '14px' }}>
          <div style={{ fontWeight: 500, marginBottom: 14, fontSize: 15, lineHeight: 1.4, color: 'var(--gray-700)' }}>
            <span style={{ color: 'var(--red)', marginRight: 6, fontSize: 12, fontWeight: 600 }}>{fi + 1}/{fragen.length}</span>{f.frage_text}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {f.antworten.map((a, ai) => {
              const isSelected = antworten[f.id] === a.text
              return (
                <label key={ai} onClick={() => setAntworten(x => ({ ...x, [f.id]: a.text }))} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 14,
                  border: `2px solid ${isSelected ? 'var(--red)' : 'var(--gray-200)'}`,
                  background: isSelected ? 'var(--red-pale)' : 'var(--white)', transition: 'all 150ms', userSelect: 'none',
                }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, border: `2px solid ${isSelected ? 'var(--red)' : 'var(--gray-300)'}`, background: isSelected ? 'var(--red)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isSelected && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20,6 9,17 4,12"/></svg>}
                  </div>
                  <span style={{ color: isSelected ? 'var(--red-dark)' : 'var(--gray-700)', fontWeight: isSelected ? 500 : 400 }}>{a.text}</span>
                  <input type="radio" name={`f-${f.id}`} value={a.text} checked={isSelected} onChange={() => {}} style={{ display: 'none' }} />
                </label>
              )
            })}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 16 }}>
        <button className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }} onClick={handleAbgabe}>Pruefung abgeben</button>
      </div>
    </div>
  )
}

function PruefungAuswertung({ pruefung, onBack }) {
  const [ergebnisse, setErgebnisse] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('pruefungs_ergebnisse').select('*, kamerad:profiles(vorname,nachname)').eq('pruefung_id', pruefung.id).order('abgelegt_am', { ascending: false }).then(({ data }) => { setErgebnisse(data ?? []); setLoading(false) })
  }, [])

  const bestanden = ergebnisse.filter(e => e.bestanden).length
  const durchschnitt = ergebnisse.length ? Math.round(ergebnisse.reduce((s, e) => s + (e.punkte_gesamt > 0 ? e.punkte_erreicht / e.punkte_gesamt * 100 : 0), 0) / ergebnisse.length) : 0

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurueck</button>
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
          <thead><tr><th>Kamerad</th><th>Versuch</th><th>Ergebnis</th><th>Punkte</th><th>Abgelegt am</th><th>Status</th></tr></thead>
          <tbody>
            {ergebnisse.length === 0
              ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 24 }}>Noch keine Ergebnisse</td></tr>
              : ergebnisse.map(e => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 500 }}>{e.kamerad?.vorname} {e.kamerad?.nachname}</td>
                  <td style={{ fontSize: 13, color: 'var(--gray-400)' }}>{e.versuch ?? 1}. Versuch</td>
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

function PruefungBearbeiten({ pruefung, profile, onBack }) {
  const [form, setForm] = useState({ titel: pruefung.titel, beschreibung: pruefung.beschreibung ?? '', bestehens_prozent: pruefung.bestehens_prozent })
  const [fragen, setFragen] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('fragen').select('*').eq('pruefung_id', pruefung.id).order('reihenfolge').then(({ data }) => { setFragen((data ?? []).map(f => ({ ...f, antworten: f.antworten ?? [] }))); setLoading(false) })
  }, [])

  function addFrage() { setFragen(f => [...f, { id: 'neu_' + Date.now(), pruefung_id: pruefung.id, frage_text: '', typ: 'multiple_choice', antworten: [{ text: '', richtig: false }, { text: '', richtig: false }, { text: '', richtig: false }, { text: '', richtig: false }], punkte: 1, reihenfolge: f.length }]) }
  function updateFrage(id, field, value) { setFragen(fs => fs.map(f => f.id === id ? { ...f, [field]: value } : f)) }
  function updateAntwort(frageId, idx, field, value) { setFragen(fs => fs.map(f => { if (f.id !== frageId) return f; const antworten = [...f.antworten]; antworten[idx] = { ...antworten[idx], [field]: value }; return { ...f, antworten } })) }
  function removeFrage(id) { setFragen(fs => fs.filter(f => f.id !== id)) }

  async function handleSave() {
    if (!form.titel) return alert('Titel erforderlich')
    setSaving(true)
    await supabase.from('pruefungen').update({ titel: form.titel, beschreibung: form.beschreibung || null, bestehens_prozent: form.bestehens_prozent }).eq('id', pruefung.id)
    await supabase.from('fragen').delete().eq('pruefung_id', pruefung.id)
    if (fragen.length > 0) await supabase.from('fragen').insert(fragen.map(({ id, isNeu, ...f }, i) => ({ ...f, pruefung_id: pruefung.id, reihenfolge: i })))
    setSaving(false)
    onBack()
  }

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurueck</button>
          <h1>Pruefung bearbeiten</h1>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Speichern...' : 'Speichern'}</button>
      </div>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 16 }}>Grunddaten</h3>
        <div className="form-group"><label>Titel</label><input value={form.titel} onChange={e => setForm(f => ({ ...f, titel: e.target.value }))} /></div>
        <div className="form-group"><label>Beschreibung</label><textarea value={form.beschreibung} onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))} rows={2} /></div>
        <div className="form-group"><label>Bestehensgrenze (%)</label><input type="number" min="1" max="100" value={form.bestehens_prozent} onChange={e => setForm(f => ({ ...f, bestehens_prozent: parseInt(e.target.value) }))} style={{ maxWidth: 100 }} /></div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3>Fragen ({fragen.length})</h3>
        <button className="btn btn-secondary btn-sm" onClick={addFrage}>+ Frage hinzufuegen</button>
      </div>
      {fragen.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 32 }}><p>Keine Fragen</p></div>}
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
          <div className="form-group"><label>Fragetext</label><input value={frage.frage_text} onChange={e => updateFrage(frage.id, 'frage_text', e.target.value)} placeholder="Fragetext..." /></div>
          <label style={{ marginBottom: 8, display: 'block' }}>Antworten</label>
          {frage.antworten.map((a, ai) => (
            <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <input type="radio" checked={a.richtig ?? false} onChange={e => updateAntwort(frage.id, ai, 'richtig', e.target.checked)} style={{ width: 'auto', flexShrink: 0 }} name={`frage-${frage.id}`} />
              {frage.typ === 'wahr_falsch' ? <span style={{ fontSize: 14 }}>{ai === 0 ? 'Wahr' : 'Falsch'}</span> : <input value={a.text ?? ''} onChange={e => updateAntwort(frage.id, ai, 'text', e.target.value)} placeholder={`Antwort ${ai + 1}`} />}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
