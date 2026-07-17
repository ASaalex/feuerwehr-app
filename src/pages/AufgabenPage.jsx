import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format, isPast, isToday } from 'date-fns'
import { de } from 'date-fns/locale'

const STATUS_LIST = ['offen', 'in_arbeit', 'erledigt']
const STATUS_LABEL = { offen: 'Offen', in_arbeit: 'In Arbeit', erledigt: 'Erledigt' }
const STATUS_COLOR = { offen: 'amber', in_arbeit: 'blue', erledigt: 'green' }
const PRIO_COLOR = { niedrig: 'gray', mittel: 'amber', hoch: 'red' }

const WIEDERHOLUNG_LABEL = {
  monatlich: '🔁 Monatlich',
  quartal: '🔁 Quartalsweise',
  'halbjährlich': '🔁 Halbjährlich',
  jährlich: '🔁 Jährlich',
}

function naechsteFaelligkeit(faelligAm, typ) {
  const d = new Date(faelligAm)
  if (typ === 'monatlich') d.setMonth(d.getMonth() + 1)
  else if (typ === 'quartal') d.setMonth(d.getMonth() + 3)
  else if (typ === 'halbjährlich') d.setMonth(d.getMonth() + 6)
  else if (typ === 'jährlich') d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().split('T')[0]
}

export default function AufgabenPage() {
  const { profile, isAdmin, isGruppenfuehrer } = useAuth()
  const [aufgaben, setAufgaben] = useState([])
  const [kameraden, setKameraden] = useState([])
  const [wehren, setWehren] = useState([])
  const [loading, setLoading] = useState(true)
  const [neueAufgabe, setNeueAufgabe] = useState(false)
  const [zeigeErledigt, setZeigeErledigt] = useState(false)
  const [ansicht, setAnsicht] = useState('meine')
  const [detailAufgabe, setDetailAufgabe] = useState(null)
  const [form, setForm] = useState({
    titel: '', beschreibung: '', zuweisung_typ: 'personen',
    ausgewaehlte_personen: [],
    zugewiesen_an_wehr: '',
    faellig_am: '', prioritaet: 'mittel',
    wiederholung: '',
    taeglich_erinnern: true,
    checkpunkte: [],
  })
  const [saving, setSaving] = useState(false)

  const kannErstellen = isAdmin || isGruppenfuehrer

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const { data, error } = await supabase
      .from('aufgaben')
      .select(`
        *,
        zugewiesen_an:profiles!aufgaben_zugewiesen_an_fkey(id,vorname,nachname),
        zugewiesen_an_wehr:wehren!aufgaben_zugewiesen_an_wehr_fkey(id,name),
        erstellt_von:profiles!aufgaben_erstellt_von_fkey(id,vorname,nachname),
        aufgaben_zuweisungen(user_id, profiles(id,vorname,nachname))
      `)
      .order('erstellt_am', { ascending: false })

    if (error) console.error('Aufgaben Fehler:', error)
    setAufgaben(data ?? [])

    if (kannErstellen) {
      let kQuery = supabase.from('profiles').select('id,vorname,nachname,wehr_id').eq('status', 'aktiv').order('nachname')
      if (profile?.rolle !== 'gemeindebrandmeister') kQuery = kQuery.eq('wehr_id', profile.wehr_id)
      const { data: k } = await kQuery
      setKameraden(k ?? [])

      const { data: w } = await supabase.from('wehren').select('id,name').order('name')
      setWehren(w ?? [])
    }

    setLoading(false)
  }

  async function handleErstellen(e) {
    e.preventDefault()
    setSaving(true)
    const { data: neu, error } = await supabase.from('aufgaben').insert({
      titel: form.titel,
      beschreibung: form.beschreibung || null,
      zugewiesen_an: null,
      zugewiesen_an_wehr: form.zuweisung_typ === 'wache' && form.zugewiesen_an_wehr ? form.zugewiesen_an_wehr : null,
      faellig_am: form.faellig_am || null,
      prioritaet: form.prioritaet,
      wiederholung: form.wiederholung || null,
      taeglich_erinnern: form.taeglich_erinnern,
      erstellt_von: profile.id,
      wehr_id: profile.wehr_id,
    }).select().single()

    if (!error && neu) {
      // Mehrfach-Zuweisungen
      if (form.zuweisung_typ === 'personen' && form.ausgewaehlte_personen.length > 0) {
        await supabase.from('aufgaben_zuweisungen').insert(
          form.ausgewaehlte_personen.map(uid => ({ aufgabe_id: neu.id, user_id: uid }))
        )
      }
      // Checkpunkte
      if (form.checkpunkte.length > 0) {
        await supabase.from('aufgaben_checkpunkte').insert(
          form.checkpunkte.map((cp, i) => ({
            aufgabe_id: neu.id,
            titel: cp.titel,
            mit_kommentar: cp.mit_kommentar,
            reihenfolge: i,
          }))
        )
      }
      // Push-Benachrichtigung an zugewiesene Personen / Wache (fire & forget)
      const pushBody = {
        title: '🔔 Neue Aufgabe',
        body: form.titel,
        url: '/aufgaben',
      }
      if (form.zuweisung_typ === 'personen' && form.ausgewaehlte_personen.length > 0) {
        supabase.functions.invoke('send-push-notification', {
          body: { ...pushBody, user_ids: form.ausgewaehlte_personen },
        })
      } else if (form.zuweisung_typ === 'wache' && form.zugewiesen_an_wehr) {
        supabase.functions.invoke('send-push-notification', {
          body: { ...pushBody, wehr_id: form.zugewiesen_an_wehr },
        })
      }
    }

    setForm({
      titel: '', beschreibung: '', zuweisung_typ: 'personen',
      ausgewaehlte_personen: [], zugewiesen_an_wehr: '',
      faellig_am: '', prioritaet: 'mittel', wiederholung: '', taeglich_erinnern: true, checkpunkte: [],
    })
    setNeueAufgabe(false)
    await fetchData()
    setSaving(false)
  }

  async function statusAendern(id, status) {
    const aufgabe = aufgaben.find(a => a.id === id)
    // Wiederkehrende Aufgabe: beim Erledigen Fälligkeit vorspringen und zurücksetzen
    if (status === 'erledigt' && aufgabe?.wiederholung && aufgabe?.faellig_am) {
      const neuFaellig = naechsteFaelligkeit(aufgabe.faellig_am, aufgabe.wiederholung)
      await supabase.from('aufgaben').update({
        status: 'offen',
        faellig_am: neuFaellig,
        letzte_erledigung: new Date().toISOString(),
      }).eq('id', id)
      // Checkpunkte-Status zurücksetzen
      const cpIds = (aufgabe._checkpunkte ?? []).map(c => c.id)
      if (cpIds.length) {
        await supabase.from('aufgaben_checkpunkt_status').delete().in('checkpunkt_id', cpIds)
      }
      await fetchData()
      return
    }
    await supabase.from('aufgaben').update({ status }).eq('id', id)
    setAufgaben(a => a.map(x => x.id === id ? { ...x, status } : x))
    if (detailAufgabe?.id === id) setDetailAufgabe(d => ({ ...d, status }))

    // Ersteller benachrichtigen wenn Aufgabe erledigt wird (und er nicht selbst geändert hat)
    if (status === 'erledigt' && aufgabe?.erstellt_von?.id && aufgabe.erstellt_von.id !== profile?.id) {
      supabase.functions.invoke('send-push-notification', {
        body: {
          user_ids: [aufgabe.erstellt_von.id],
          title: '✅ Aufgabe erledigt',
          body: aufgabe.titel,
          url: '/aufgaben',
        },
      })
    }
  }

  async function loeschen(id) {
    if (!confirm('Aufgabe wirklich löschen?')) return
    await supabase.from('aufgaben').delete().eq('id', id)
    setAufgaben(a => a.filter(x => x.id !== id))
    if (detailAufgabe?.id === id) setDetailAufgabe(null)
  }

  const istUeberfaellig = (a) =>
    a.faellig_am && isPast(new Date(a.faellig_am)) &&
    !isToday(new Date(a.faellig_am)) && a.status !== 'erledigt'

  const zugewiesenePersonen = (a) => a.aufgaben_zuweisungen?.map(z => z.profiles).filter(Boolean) ?? []

  const istMirZugewiesen = (a) => {
    if (a.zugewiesen_an?.id === profile?.id) return true
    if (profile?.wehr_id && a.zugewiesen_an_wehr?.id === profile?.wehr_id) return true
    if (zugewiesenePersonen(a).some(p => p.id === profile?.id)) return true
    return false
  }

  const gefiltertNachBerechtigung = aufgaben.filter(a => {
    if (kannErstellen) return true
    return istMirZugewiesen(a) || a.erstellt_von?.id === profile?.id
  })

  const gefiltert = gefiltertNachBerechtigung.filter(a => {
    if (!zeigeErledigt && a.status === 'erledigt') return false
    if (ansicht === 'meine' && kannErstellen) {
      return istMirZugewiesen(a) || a.erstellt_von?.id === profile?.id
    }
    return true
  })

  const togglePerson = (uid) => setForm(f => ({
    ...f,
    ausgewaehlte_personen: f.ausgewaehlte_personen.includes(uid)
      ? f.ausgewaehlte_personen.filter(x => x !== uid)
      : [...f.ausgewaehlte_personen, uid]
  }))

  const addCheckpunkt = () => setForm(f => ({ ...f, checkpunkte: [...f.checkpunkte, { titel: '', mit_kommentar: false }] }))
  const setCheckpunkt = (i, k, v) => setForm(f => {
    const cp = [...f.checkpunkte]
    cp[i] = { ...cp[i], [k]: v }
    return { ...f, checkpunkte: cp }
  })
  const removeCheckpunkt = (i) => setForm(f => ({ ...f, checkpunkte: f.checkpunkte.filter((_, j) => j !== i) }))

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Aufgaben</h1>
          <p style={{ marginTop: 4 }}>
            {gefiltertNachBerechtigung.filter(a => a.status !== 'erledigt').length} offen / in Arbeit
            {' · '}{gefiltertNachBerechtigung.filter(a => a.status === 'erledigt').length} erledigt
          </p>
        </div>
        {kannErstellen && (
          <button className="btn btn-primary" onClick={() => setNeueAufgabe(true)}>+ Neue Aufgabe</button>
        )}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        {kannErstellen && (
          <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--gray-100)', borderRadius: 8 }}>
            {[{ v: 'meine', l: 'Meine' }, { v: 'alle', l: 'Alle' }].map(({ v, l }) => (
              <button key={v} className={`btn btn-sm ${ansicht === v ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setAnsicht(v)}>{l}</button>
            ))}
          </div>
        )}
        <button
          className={`btn btn-sm ${zeigeErledigt ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setZeigeErledigt(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 14 }}>{zeigeErledigt ? '✓' : '○'}</span>
          Erledigte anzeigen
        </button>
      </div>

      {gefiltert.length === 0 ? (
        <div className="empty-state card">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          <p>Keine Aufgaben vorhanden</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {gefiltert.map(a => {
            const personen = zugewiesenePersonen(a)
            return (
              <div key={a.id} className="card" style={{
                borderLeft: `3px solid ${
                  istUeberfaellig(a) ? 'var(--red)' :
                  a.zugewiesen_an_wehr ? '#378ADD' : 'transparent'
                }`,
                padding: '14px 18px 14px 15px',
                cursor: 'pointer',
              }} onClick={() => setDetailAufgabe(a)}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 500, fontSize: 15, color: 'var(--gray-700)' }}>{a.titel}</span>
                      <span className={`badge badge-${PRIO_COLOR[a.prioritaet]}`} style={{ fontSize: 11 }}>{a.prioritaet}</span>
                      {istUeberfaellig(a) && <span className="badge badge-red" style={{ fontSize: 11 }}>Überfällig</span>}
                      {a.zugewiesen_an_wehr && <span className="badge badge-blue" style={{ fontSize: 11 }}>Ganze Wache</span>}
                      {a.wiederholung && <span style={{ fontSize: 11, color: '#6d28d9', background: '#ede9fe', borderRadius: 4, padding: '2px 6px' }}>{WIEDERHOLUNG_LABEL[a.wiederholung]}</span>}
                    </div>
                    {a.beschreibung && (
                      <p style={{ fontSize: 13, color: 'var(--gray-400)', lineHeight: 1.5, marginBottom: 6 }}>{a.beschreibung}</p>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--gray-400)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {a.zugewiesen_an && <span>→ {a.zugewiesen_an.vorname} {a.zugewiesen_an.nachname}</span>}
                      {personen.length > 0 && (
                        <span>→ {personen.map(p => `${p.vorname} ${p.nachname}`).join(', ')}</span>
                      )}
                      {a.zugewiesen_an_wehr && <span>Wache: {a.zugewiesen_an_wehr.name}</span>}
                      {a.faellig_am && <span>Fällig: {format(new Date(a.faellig_am), 'd. MMM', { locale: de })}</span>}
                      {a.erstellt_von && <span>von {a.erstellt_von.vorname} {a.erstellt_von.nachname}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, alignItems: 'flex-end' }} onClick={e => e.stopPropagation()}>
                    <span className={`badge badge-${STATUS_COLOR[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                    <select value={a.status} onChange={e => statusAendern(a.id, e.target.value)}
                      style={{ width: 'auto', padding: '5px 8px', fontSize: 12 }}>
                      {STATUS_LIST.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                    {(isAdmin || a.erstellt_von?.id === profile?.id) && (
                      <button className="btn btn-sm btn-danger" onClick={() => loeschen(a.id)}>Löschen</button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail Modal */}
      {detailAufgabe && (
        <AufgabeDetailModal
          aufgabe={detailAufgabe}
          profile={profile}
          isAdmin={isAdmin}
          kannErstellen={kannErstellen}
          onClose={() => setDetailAufgabe(null)}
          onStatusChange={statusAendern}
          onDelete={loeschen}
          onRefresh={() => fetchData().then(() => {
            // Update detailAufgabe with fresh data
          })}
        />
      )}

      {/* Neue Aufgabe Modal */}
      {neueAufgabe && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setNeueAufgabe(false)}>
          <div className="modal" style={{ width: '100%', maxWidth: 560 }}>
            <div className="modal-header">
              <h3>Neue Aufgabe</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setNeueAufgabe(false)}>✕</button>
            </div>
            <form onSubmit={handleErstellen} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Titel</label>
                <input value={form.titel} onChange={e => setForm(f => ({ ...f, titel: e.target.value }))}
                  placeholder="Aufgabentitel" required />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Beschreibung (optional)</label>
                <textarea value={form.beschreibung} onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))} rows={2} />
              </div>

              {/* Zuweisung */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Zuweisen an</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {[{ v: 'personen', l: '👥 Personen' }, { v: 'wache', l: '🚒 Ganze Wache' }, { v: 'keine', l: 'Niemand' }].map(({ v, l }) => (
                    <button key={v} type="button"
                      className={`btn btn-sm ${form.zuweisung_typ === v ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setForm(f => ({ ...f, zuweisung_typ: v }))}>
                      {l}
                    </button>
                  ))}
                </div>
                {form.zuweisung_typ === 'personen' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '8px 10px' }}>
                    {kameraden.map(k => (
                      <label key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                        <input type="checkbox" style={{ width: 'auto' }}
                          checked={form.ausgewaehlte_personen.includes(k.id)}
                          onChange={() => togglePerson(k.id)} />
                        {k.nachname}, {k.vorname}
                      </label>
                    ))}
                  </div>
                )}
                {form.zuweisung_typ === 'wache' && (
                  <select value={form.zugewiesen_an_wehr} onChange={e => setForm(f => ({ ...f, zugewiesen_an_wehr: e.target.value }))}>
                    <option value="">-- Wache auswählen</option>
                    {wehren.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                )}
                {form.zuweisung_typ === 'personen' && form.ausgewaehlte_personen.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 6 }}>
                    {form.ausgewaehlte_personen.length} Person(en) ausgewählt
                  </div>
                )}
              </div>

              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Priorität</label>
                  <select value={form.prioritaet} onChange={e => setForm(f => ({ ...f, prioritaet: e.target.value }))}>
                    <option value="niedrig">Niedrig</option>
                    <option value="mittel">Mittel</option>
                    <option value="hoch">Hoch</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Fällig am</label>
                  <input type="date" value={form.faellig_am} onChange={e => setForm(f => ({ ...f, faellig_am: e.target.value }))} />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Wiederholung</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[{ v: '', l: 'Keine' }, { v: 'monatlich', l: 'Monatlich' }, { v: 'quartal', l: 'Quartalsweise' }, { v: 'halbjährlich', l: 'Halbjährlich' }, { v: 'jährlich', l: 'Jährlich' }].map(({ v, l }) => (
                    <button key={v} type="button"
                      className={`btn btn-sm ${form.wiederholung === v ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setForm(f => ({ ...f, wiederholung: v }))}>
                      {v ? '🔁 ' : ''}{l}
                    </button>
                  ))}
                </div>
                {form.wiederholung && !form.faellig_am && (
                  <p style={{ fontSize: 12, color: '#d97706', marginTop: 6 }}>
                    ⚠ Bitte ein Fälligkeitsdatum setzen, damit die Wiederholung berechnet werden kann.
                  </p>
                )}
                {form.wiederholung && form.faellig_am && (
                  <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 6 }}>
                    Nächste Fälligkeit nach Erledigung: {naechsteFaelligkeit(form.faellig_am, form.wiederholung)}
                  </p>
                )}
              </div>

              {/* Tägliche Erinnerung */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', background: form.taeglich_erinnern ? '#eff6ff' : 'var(--gray-50)', borderRadius: 8, border: `1px solid ${form.taeglich_erinnern ? '#bfdbfe' : 'var(--gray-200)'}` }}>
                <input type="checkbox" style={{ width: 'auto', flexShrink: 0 }}
                  checked={form.taeglich_erinnern}
                  onChange={e => setForm(f => ({ ...f, taeglich_erinnern: e.target.checked }))} />
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>🔔 Tägliche Erinnerung (08:00 Uhr)</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 1 }}>
                    Zugewiesene Kameraden erhalten täglich eine Push-Mitteilung bis die Aufgabe erledigt ist.
                  </div>
                </div>
              </label>

              {/* Checkliste */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-600)' }}>
                    ☑ Checkliste (optional)
                  </label>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={addCheckpunkt}>
                    + Punkt hinzufügen
                  </button>
                </div>
                {form.checkpunkte.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {form.checkpunkte.map((cp, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          value={cp.titel}
                          onChange={e => setCheckpunkt(i, 'titel', e.target.value)}
                          placeholder={`Punkt ${i + 1} z. B. "Atemschutzgerät Slot 1"`}
                          style={{ flex: 1, minWidth: 0 }}
                        />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                          <input type="checkbox" style={{ width: 'auto' }}
                            checked={cp.mit_kommentar}
                            onChange={e => setCheckpunkt(i, 'mit_kommentar', e.target.checked)} />
                          Kommentar
                        </label>
                        <button type="button" onClick={() => removeCheckpunkt(i)}
                          style={{ background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setNeueAufgabe(false)}>Abbrechen</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Erstellen...' : 'Erstellen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function AufgabeDetailModal({ aufgabe, profile, isAdmin, kannErstellen, onClose, onStatusChange, onDelete, onRefresh }) {
  const [kommentare, setKommentare] = useState([])
  const [neuerKommentar, setNeuerKommentar] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [bildUrls, setBildUrls] = useState({}) // bild.id → signedUrl (für Kommentar-Bilder)
  const [uploadingBild, setUploadingBild] = useState(false)
  const [bildFehler, setBildFehler] = useState('')
  const [checkpunkte, setCheckpunkte] = useState([])
  const [checkStatus, setCheckStatus] = useState({})
  // Inline-Kommentar bei Checkpunkten: checkpunkt_id → string
  const [checkKommentare, setCheckKommentare] = useState({})
  const bildInputRef = useRef()
  const feedEndRef = useRef()

  useEffect(() => {
    fetchAlles()
  }, [aufgabe.id])

  async function fetchAlles() {
    setLoading(true)
    const [{ data: k }, { data: b }, { data: cp }] = await Promise.all([
      supabase.from('aufgaben_kommentare')
        .select('*, autor:profiles(vorname,nachname,rolle)')
        .eq('aufgabe_id', aufgabe.id).order('erstellt_am'),
      supabase.from('aufgaben_bilder')
        .select('*').eq('aufgabe_id', aufgabe.id).order('hochgeladen_am'),
      supabase.from('aufgaben_checkpunkte')
        .select('*').eq('aufgabe_id', aufgabe.id).order('reihenfolge'),
    ])
    setKommentare(k ?? [])

    const cpList = cp ?? []
    setCheckpunkte(cpList)
    if (cpList.length > 0) {
      const { data: statuses } = await supabase.from('aufgaben_checkpunkt_status')
        .select('*, user:profiles(vorname,nachname)')
        .in('checkpunkt_id', cpList.map(c => c.id))
      const map = {}
      ;(statuses ?? []).forEach(s => {
        if (!map[s.checkpunkt_id]) map[s.checkpunkt_id] = []
        map[s.checkpunkt_id].push(s)
      })
      setCheckStatus(map)
    }

    // Signierte URLs für Bilder im Feed
    if (b?.length) {
      const urls = {}
      await Promise.all(b.map(async (bild) => {
        const { data } = await supabase.storage.from('aufgaben').createSignedUrl(bild.storage_pfad, 3600)
        if (data?.signedUrl) urls[bild.id] = data.signedUrl
      }))
      setBildUrls(urls)
      // Bilder als Feed-Einträge in kommentare integrieren
      setKommentare(prev => {
        const feedBilder = (b ?? []).map(bi => ({ _typ: 'bild', ...bi, erstellt_am: bi.hochgeladen_am }))
        const alle = [...(k ?? []).map(x => ({ ...x, _typ: 'kommentar' })), ...feedBilder]
        alle.sort((a, b2) => new Date(a.erstellt_am) - new Date(b2.erstellt_am))
        return alle
      })
    } else {
      setKommentare((k ?? []).map(x => ({ ...x, _typ: 'kommentar' })))
    }

    setLoading(false)
  }

  async function reloadFeed() {
    const [{ data: k }, { data: b }] = await Promise.all([
      supabase.from('aufgaben_kommentare')
        .select('*, autor:profiles(vorname,nachname,rolle)')
        .eq('aufgabe_id', aufgabe.id).order('erstellt_am'),
      supabase.from('aufgaben_bilder')
        .select('*').eq('aufgabe_id', aufgabe.id).order('hochgeladen_am'),
    ])
    const urls = { ...bildUrls }
    await Promise.all((b ?? []).filter(bi => !urls[bi.id]).map(async (bi) => {
      const { data } = await supabase.storage.from('aufgaben').createSignedUrl(bi.storage_pfad, 3600)
      if (data?.signedUrl) urls[bi.id] = data.signedUrl
    }))
    setBildUrls(urls)
    const feedBilder = (b ?? []).map(bi => ({ _typ: 'bild', ...bi, erstellt_am: bi.hochgeladen_am }))
    const alle = [...(k ?? []).map(x => ({ ...x, _typ: 'kommentar' })), ...feedBilder]
    alle.sort((a, b2) => new Date(a.erstellt_am) - new Date(b2.erstellt_am))
    setKommentare(alle)
    setTimeout(() => feedEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  async function handleKommentar(e) {
    e.preventDefault()
    if (!neuerKommentar.trim()) return
    setSending(true)
    const text = neuerKommentar.trim()
    await supabase.from('aufgaben_kommentare').insert({
      aufgabe_id: aufgabe.id,
      autor_id: profile.id,
      text,
    })
    setNeuerKommentar('')
    await reloadFeed()
    setSending(false)

    // Alle Beteiligten außer dem Kommentator benachrichtigen
    const empfaenger = new Set()
    if (aufgabe.erstellt_von?.id) empfaenger.add(aufgabe.erstellt_von.id)
    ;(aufgabe.aufgaben_zuweisungen ?? []).forEach(z => empfaenger.add(z.user_id))
    empfaenger.delete(profile.id)
    if (empfaenger.size > 0) {
      supabase.functions.invoke('send-push-notification', {
        body: {
          user_ids: [...empfaenger],
          title: `💬 ${aufgabe.titel}`,
          body: `${profile.vorname} ${profile.nachname}: ${text.length > 60 ? text.slice(0, 57) + '…' : text}`,
          url: '/aufgaben',
        },
      })
    }
  }

  async function handleBildUpload(e) {
    const datei = e.target.files?.[0]
    if (!datei) return
    setBildFehler('')
    if (datei.size > 10 * 1024 * 1024) {
      setBildFehler('Bild darf max. 10 MB groß sein.')
      if (bildInputRef.current) bildInputRef.current.value = ''
      return
    }
    setUploadingBild(true)
    const pfad = `${aufgabe.id}/${Date.now()}-${datei.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error: upErr } = await supabase.storage.from('aufgaben').upload(pfad, datei, { contentType: datei.type })
    if (upErr) {
      setBildFehler(`Upload fehlgeschlagen: ${upErr.message} — Bitte prüfe ob der Bucket "aufgaben" in Supabase Storage angelegt ist.`)
      setUploadingBild(false)
      if (bildInputRef.current) bildInputRef.current.value = ''
      return
    }
    const { error: dbErr } = await supabase.from('aufgaben_bilder').insert({
      aufgabe_id: aufgabe.id, storage_pfad: pfad,
      dateiname: datei.name, hochgeladen_von: profile.id,
    })
    if (dbErr) {
      setBildFehler(`Datenbank-Fehler: ${dbErr.message}`)
      setUploadingBild(false)
      if (bildInputRef.current) bildInputRef.current.value = ''
      return
    }
    await reloadFeed()
    setUploadingBild(false)
    if (bildInputRef.current) bildInputRef.current.value = ''

    // Alle Beteiligten über neues Bild informieren
    const empfaenger = new Set()
    if (aufgabe.erstellt_von?.id) empfaenger.add(aufgabe.erstellt_von.id)
    ;(aufgabe.aufgaben_zuweisungen ?? []).forEach(z => empfaenger.add(z.user_id))
    empfaenger.delete(profile.id)
    if (empfaenger.size > 0) {
      supabase.functions.invoke('send-push-notification', {
        body: {
          user_ids: [...empfaenger],
          title: `📷 ${aufgabe.titel}`,
          body: `${profile.vorname} ${profile.nachname} hat ein Bild hochgeladen`,
          url: '/aufgaben',
        },
      })
    }
  }

  async function bildLoeschen(bildId, storagePfad) {
    await supabase.storage.from('aufgaben').remove([storagePfad])
    await supabase.from('aufgaben_bilder').delete().eq('id', bildId)
    await reloadFeed()
  }

  async function checkpunktToggle(cp) {
    const meinStatus = (checkStatus[cp.id] ?? []).find(s => s.user_id === profile.id)
    const neuerWert = !meinStatus?.erledigt
    const kommentar = checkKommentare[cp.id]?.trim() || null
    if (meinStatus) {
      await supabase.from('aufgaben_checkpunkt_status').update({
        erledigt: neuerWert,
        kommentar: neuerWert ? kommentar : null,
        erledigt_am: neuerWert ? new Date().toISOString() : null,
      }).eq('id', meinStatus.id)
    } else {
      await supabase.from('aufgaben_checkpunkt_status').insert({
        checkpunkt_id: cp.id, user_id: profile.id,
        erledigt: neuerWert, kommentar: neuerWert ? kommentar : null,
        erledigt_am: neuerWert ? new Date().toISOString() : null,
      })
    }
    const { data: fresh } = await supabase.from('aufgaben_checkpunkt_status')
      .select('*, user:profiles(vorname,nachname)').eq('checkpunkt_id', cp.id)
    setCheckStatus(prev => ({ ...prev, [cp.id]: fresh ?? [] }))

    // Nur beim Abhaken (nicht beim Rückgängig) benachrichtigen
    if (neuerWert) {
      const empfaenger = new Set()
      if (aufgabe.erstellt_von?.id) empfaenger.add(aufgabe.erstellt_von.id)
      ;(aufgabe.aufgaben_zuweisungen ?? []).forEach(z => empfaenger.add(z.user_id))
      empfaenger.delete(profile.id)
      if (empfaenger.size > 0) {
        supabase.functions.invoke('send-push-notification', {
          body: {
            user_ids: [...empfaenger],
            title: `☑ ${aufgabe.titel}`,
            body: `${profile.vorname} ${profile.nachname}: "${cp.titel}" abgehakt`,
            url: '/aufgaben',
          },
        })
      }
    }
  }

  const rollefarbe = (rolle) => {
    if (rolle === 'wehrleiter' || rolle === 'gemeindebrandmeister') return 'var(--red)'
    if (rolle === 'ausbilder') return '#1A5276'
    if (rolle === 'gruppenfuehrer') return '#1E8449'
    return 'var(--gray-500)'
  }

  const zugewiesenePersonen = aufgabe.aufgaben_zuweisungen?.map(z => z.profiles).filter(Boolean) ?? []
  const checkFortschritt = checkpunkte.filter(cp => (checkStatus[cp.id] ?? []).some(s => s.erledigt)).length

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{
        maxWidth: 600, width: '100%', display: 'flex', flexDirection: 'column',
        maxHeight: '92vh', padding: 0, overflow: 'hidden',
      }}>
        {/* Sticky Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--gray-100)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 6 }}>{aufgabe.titel}</h3>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={aufgabe.status} onChange={e => onStatusChange(aufgabe.id, e.target.value)}
                  style={{ width: 'auto', padding: '3px 6px', fontSize: 12 }}>
                  {STATUS_LIST.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
                <span className={`badge badge-${PRIO_COLOR[aufgabe.prioritaet]}`} style={{ fontSize: 11 }}>{aufgabe.prioritaet}</span>
                {aufgabe.faellig_am && (
                  <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                    📅 {format(new Date(aufgabe.faellig_am), 'd. MMM yyyy', { locale: de })}
                  </span>
                )}
                {aufgabe.wiederholung && (
                  <span style={{ fontSize: 11, color: '#6d28d9', background: '#ede9fe', borderRadius: 4, padding: '2px 6px' }}>
                    {WIEDERHOLUNG_LABEL[aufgabe.wiederholung]}
                  </span>
                )}
                {aufgabe.letzte_erledigung && (
                  <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                    Zuletzt erledigt: {format(new Date(aufgabe.letzte_erledigung), 'd. MMM yyyy', { locale: de })}
                  </span>
                )}
              </div>
              {(aufgabe.zugewiesen_an || zugewiesenePersonen.length > 0 || aufgabe.zugewiesen_an_wehr) && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--gray-400)' }}>
                  → {[
                    aufgabe.zugewiesen_an ? `${aufgabe.zugewiesen_an.vorname} ${aufgabe.zugewiesen_an.nachname}` : null,
                    ...zugewiesenePersonen.map(p => `${p.vorname} ${p.nachname}`),
                    aufgabe.zugewiesen_an_wehr ? `Wache: ${aufgabe.zugewiesen_an_wehr.name}` : null,
                  ].filter(Boolean).join(', ')}
                </div>
              )}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ flexShrink: 0 }}>✕</button>
          </div>
        </div>

        {/* Scrollbarer Hauptbereich */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner"></div></div>
          ) : (
            <>
              {/* Beschreibung */}
              {aufgabe.beschreibung && (
                <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.6, background: 'var(--gray-50)', borderRadius: 8, padding: '10px 14px' }}>
                  {aufgabe.beschreibung}
                </p>
              )}

              {/* Checkliste */}
              {checkpunkte.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Checkliste
                    </span>
                    <span style={{ fontSize: 12, color: checkFortschritt === checkpunkte.length ? '#15803d' : 'var(--gray-400)' }}>
                      {checkFortschritt}/{checkpunkte.length} erledigt
                    </span>
                  </div>
                  {/* Fortschrittsbalken */}
                  <div style={{ height: 4, background: 'var(--gray-100)', borderRadius: 4, marginBottom: 10, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: '#22c55e', borderRadius: 4, width: `${checkpunkte.length ? (checkFortschritt / checkpunkte.length) * 100 : 0}%`, transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {checkpunkte.map(cp => {
                      const statuses = checkStatus[cp.id] ?? []
                      const meinStatus = statuses.find(s => s.user_id === profile.id)
                      const erledigt = !!meinStatus?.erledigt
                      const erledigtVon = statuses.filter(s => s.erledigt)
                      const kommentarZeigen = cp.mit_kommentar && !erledigt
                      return (
                        <div key={cp.id} style={{
                          background: erledigt ? '#f0fdf4' : 'var(--gray-50)',
                          border: `1px solid ${erledigt ? '#bbf7d0' : 'var(--gray-100)'}`,
                          borderRadius: 8, padding: '10px 12px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input type="checkbox" style={{ width: 'auto', flexShrink: 0, accentColor: '#22c55e' }}
                              checked={erledigt}
                              onChange={() => checkpunktToggle(cp)} />
                            <span style={{
                              flex: 1, fontSize: 14, fontWeight: 500,
                              color: erledigt ? '#15803d' : 'var(--gray-700)',
                              textDecoration: erledigt ? 'line-through' : 'none',
                            }}>{cp.titel}</span>
                          </div>
                          {/* Optionales Kommentarfeld (nur sichtbar wenn nicht abgehakt und mit_kommentar) */}
                          {kommentarZeigen && (
                            <input
                              value={checkKommentare[cp.id] ?? ''}
                              onChange={e => setCheckKommentare(prev => ({ ...prev, [cp.id]: e.target.value }))}
                              placeholder="Kommentar (optional)…"
                              style={{ marginTop: 8, width: '100%', fontSize: 13 }}
                            />
                          )}
                          {/* Eigener Kommentar nach dem Abhaken */}
                          {erledigt && meinStatus?.kommentar && (
                            <div style={{ marginTop: 6, fontSize: 12, color: '#15803d', background: '#dcfce7', borderRadius: 4, padding: '4px 8px' }}>
                              Dein Kommentar: {meinStatus.kommentar}
                            </div>
                          )}
                          {/* Wer hat abgehakt */}
                          {erledigtVon.length > 0 && (
                            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {erledigtVon.map(s => (
                                <span key={s.id} style={{ fontSize: 11, color: '#15803d', background: '#dcfce7', borderRadius: 4, padding: '2px 6px' }}>
                                  ✓ {s.user?.vorname} {s.user?.nachname}
                                  {s.erledigt_am && ` · ${format(new Date(s.erledigt_am), 'd. MMM HH:mm', { locale: de })}`}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Trennlinie zur Aktivität */}
              <div style={{ borderTop: '1px solid var(--gray-100)', paddingTop: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Verlauf
                </span>
              </div>

              {/* Feed: Kommentare + Bilder chronologisch */}
              {kommentare.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '8px 0', color: 'var(--gray-300)', fontSize: 13 }}>
                  Noch keine Einträge — schreib den ersten Kommentar oder lade ein Foto hoch.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {kommentare.map(eintrag => {
                    if (eintrag._typ === 'bild') {
                      const url = bildUrls[eintrag.id]
                      const istMeins = eintrag.hochgeladen_von === profile.id
                      return (
                        <div key={`bild-${eintrag.id}`} style={{ display: 'flex', flexDirection: 'column', alignItems: istMeins ? 'flex-end' : 'flex-start' }}>
                          <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 4 }}>
                            {format(new Date(eintrag.erstellt_am), 'd. MMM HH:mm', { locale: de })}
                          </div>
                          <div style={{ maxWidth: '75%', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--gray-100)', background: 'var(--gray-50)' }}>
                            {url ? (
                              <a href={url} target="_blank" rel="noreferrer">
                                <img src={url} alt={eintrag.dateiname}
                                  style={{ width: '100%', maxWidth: 300, display: 'block', objectFit: 'cover' }} />
                              </a>
                            ) : (
                              <div style={{ width: 200, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <div className="spinner" style={{ width: 20, height: 20 }} />
                              </div>
                            )}
                          </div>
                          {(isAdmin || istMeins) && (
                            <button onClick={() => bildLoeschen(eintrag.id, eintrag.storage_pfad)}
                              style={{ marginTop: 4, fontSize: 11, color: 'var(--gray-400)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                              Bild löschen
                            </button>
                          )}
                        </div>
                      )
                    }
                    // Normaler Kommentar
                    const istMeiner = eintrag.autor_id === profile.id
                    return (
                      <div key={`k-${eintrag.id}`} style={{ display: 'flex', gap: 8, flexDirection: istMeiner ? 'row-reverse' : 'row' }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                          background: istMeiner ? 'var(--red-light)' : 'var(--gray-100)',
                          color: istMeiner ? 'var(--red-dark)' : 'var(--gray-500)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 600,
                        }}>
                          {(eintrag.autor?.vorname?.[0] ?? '') + (eintrag.autor?.nachname?.[0] ?? '')}
                        </div>
                        <div style={{ maxWidth: '78%' }}>
                          <div style={{
                            fontSize: 11, color: 'var(--gray-400)', marginBottom: 3,
                            display: 'flex', gap: 6, alignItems: 'center',
                            justifyContent: istMeiner ? 'flex-end' : 'flex-start',
                          }}>
                            <span style={{ fontWeight: 500, color: rollefarbe(eintrag.autor?.rolle) }}>
                              {eintrag.autor?.vorname} {eintrag.autor?.nachname}
                            </span>
                            <span>{format(new Date(eintrag.erstellt_am), 'd. MMM HH:mm', { locale: de })}</span>
                          </div>
                          <div style={{
                            padding: '8px 12px', fontSize: 14, lineHeight: 1.5,
                            background: istMeiner ? 'var(--red-pale)' : 'var(--gray-100)',
                            color: 'var(--gray-700)',
                            borderRadius: istMeiner ? '10px 2px 10px 10px' : '2px 10px 10px 10px',
                          }}>
                            {eintrag.text}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={feedEndRef} />
                </div>
              )}

              {/* Löschen-Button */}
              {(isAdmin || aufgabe.erstellt_von?.id === profile?.id) && (
                <div style={{ borderTop: '1px solid var(--gray-100)', paddingTop: 12 }}>
                  <button className="btn btn-sm btn-danger"
                    onClick={() => { onDelete(aufgabe.id); onClose() }}>
                    Aufgabe löschen
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Sticky Eingabebereich */}
        <div style={{ borderTop: '1px solid var(--gray-100)', padding: '12px 16px', flexShrink: 0, background: 'white' }}>
          {bildFehler && (
            <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--red)', background: '#fef2f2', borderRadius: 6, padding: '6px 10px' }}>
              {bildFehler}
            </div>
          )}
          <form onSubmit={handleKommentar} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <input
              type="file" ref={bildInputRef} accept="image/*"
              style={{ display: 'none' }}
              onChange={handleBildUpload}
            />
            <button type="button"
              onClick={() => { setBildFehler(''); bildInputRef.current?.click() }}
              disabled={uploadingBild}
              title="Bild hochladen"
              style={{
                flexShrink: 0, width: 38, height: 38, border: '1px solid var(--gray-200)',
                borderRadius: 8, background: 'var(--gray-50)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
              }}>
              {uploadingBild ? <span className="spinner" style={{ width: 16, height: 16 }} /> : '📷'}
            </button>
            <input
              value={neuerKommentar}
              onChange={e => setNeuerKommentar(e.target.value)}
              placeholder="Antwort schreiben…"
              style={{ flex: 1, minWidth: 0 }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleKommentar(e) } }}
            />
            <button type="submit" className="btn btn-primary" disabled={sending || !neuerKommentar.trim()}
              style={{ flexShrink: 0, height: 38 }}>
              {sending ? '…' : 'Senden'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
