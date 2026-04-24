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
  const [wehren, setWehren] = useState([])
  const [loading, setLoading] = useState(true)
  const [neueAufgabe, setNeueAufgabe] = useState(false)
  const [filterStatus, setFilterStatus] = useState('alle')
  const [ansicht, setAnsicht] = useState('meine')
  const [detailAufgabe, setDetailAufgabe] = useState(null)
  const [form, setForm] = useState({
    titel: '', beschreibung: '', zuweisung_typ: 'person',
    zugewiesen_an: '', zugewiesen_an_wehr: '',
    faellig_am: '', prioritaet: 'mittel'
  })
  const [saving, setSaving] = useState(false)

  const kannErstellen = isAdmin || isGruppenfuehrer

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const { data, error } = await supabase
      .from('aufgaben')
      .select('*, zugewiesen_an:profiles!aufgaben_zugewiesen_an_fkey(id,vorname,nachname), zugewiesen_an_wehr:wehren!aufgaben_zugewiesen_an_wehr_fkey(id,name), erstellt_von:profiles!aufgaben_erstellt_von_fkey(id,vorname,nachname)')
      .order('erstellt_am', { ascending: false })

    if (error) console.error('Aufgaben Fehler:', error)
    setAufgaben(data ?? [])

    if (kannErstellen) {
      let kQuery = supabase.from('profiles').select('id,vorname,nachname,wehr_id').eq('status', 'aktiv').order('nachname')
      if (!isAdmin) kQuery = kQuery.eq('wehr_id', profile.wehr_id)
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
    await supabase.from('aufgaben').insert({
      titel: form.titel,
      beschreibung: form.beschreibung || null,
      zugewiesen_an: form.zuweisung_typ === 'person' && form.zugewiesen_an ? form.zugewiesen_an : null,
      zugewiesen_an_wehr: form.zuweisung_typ === 'wache' && form.zugewiesen_an_wehr ? form.zugewiesen_an_wehr : null,
      faellig_am: form.faellig_am || null,
      prioritaet: form.prioritaet,
      erstellt_von: profile.id,
      wehr_id: profile.wehr_id,
    })
    setForm({ titel: '', beschreibung: '', zuweisung_typ: 'person', zugewiesen_an: '', zugewiesen_an_wehr: '', faellig_am: '', prioritaet: 'mittel' })
    setNeueAufgabe(false)
    await fetchData()
    setSaving(false)
  }

  async function statusAendern(id, status) {
    await supabase.from('aufgaben').update({ status }).eq('id', id)
    setAufgaben(a => a.map(x => x.id === id ? { ...x, status } : x))
    if (detailAufgabe?.id === id) setDetailAufgabe(d => ({ ...d, status }))
  }

  async function loeschen(id) {
    if (!confirm('Aufgabe wirklich loeschen?')) return
    await supabase.from('aufgaben').delete().eq('id', id)
    setAufgaben(a => a.filter(x => x.id !== id))
    if (detailAufgabe?.id === id) setDetailAufgabe(null)
  }

  const istUeberfaellig = (a) =>
    a.faellig_am && isPast(new Date(a.faellig_am)) &&
    !isToday(new Date(a.faellig_am)) && a.status !== 'erledigt'

  // Strikte Filterung: Kamerad sieht NUR seine eigenen + Wachen-Aufgaben
  const gefiltertNachBerechtigung = aufgaben.filter(a => {
    if (kannErstellen) return true // Admin/Gruppenführer sehen alle
    // Normale Kameraden: nur direkt zugewiesen ODER an ihre Wache
    const istMeine = a.zugewiesen_an?.id === profile?.id
    const istMeineWache = profile?.wehr_id && a.zugewiesen_an_wehr?.id === profile?.wehr_id
    const istErstellt = a.erstellt_von?.id === profile?.id
    return istMeine || istMeineWache || istErstellt
  })

  const gefiltert = gefiltertNachBerechtigung.filter(a => {
    if (filterStatus !== 'alle' && a.status !== filterStatus) return false
    if (ansicht === 'meine' && kannErstellen) {
      const istMeine = a.zugewiesen_an?.id === profile?.id
      const istMeineWache = profile?.wehr_id && a.zugewiesen_an_wehr?.id === profile?.wehr_id
      const istErstellt = a.erstellt_von?.id === profile?.id
      return istMeine || istMeineWache || istErstellt
    }
    return true
  })

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Aufgaben</h1>
          <p style={{ marginTop: 4 }}>
            {gefiltert.filter(a => a.status !== 'erledigt').length} offen · {gefiltertNachBerechtigung.length} gesamt
          </p>
        </div>
        {kannErstellen && (
          <button className="btn btn-primary" onClick={() => setNeueAufgabe(true)}>+ Neue Aufgabe</button>
        )}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {kannErstellen && (
          <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--gray-100)', borderRadius: 8 }}>
            {[{ v: 'meine', l: 'Meine' }, { v: 'alle', l: 'Alle' }].map(({ v, l }) => (
              <button key={v} className={`btn btn-sm ${ansicht === v ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setAnsicht(v)}>{l}</button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--gray-100)', borderRadius: 8 }}>
          {['alle', ...STATUS_LIST].map(s => (
            <button key={s} className={`btn btn-sm ${filterStatus === s ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilterStatus(s)}>
              {s === 'alle' ? 'Alle Status' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
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
          {gefiltert.map(a => (
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
                    {istUeberfaellig(a) && <span className="badge badge-red" style={{ fontSize: 11 }}>Ueberfaellig</span>}
                    {a.zugewiesen_an_wehr && <span className="badge badge-blue" style={{ fontSize: 11 }}>Ganze Wache</span>}
                  </div>
                  {a.beschreibung && (
                    <p style={{ fontSize: 13, color: 'var(--gray-400)', lineHeight: 1.5, marginBottom: 6 }}>{a.beschreibung}</p>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {a.zugewiesen_an && <span>Person: {a.zugewiesen_an.vorname} {a.zugewiesen_an.nachname}</span>}
                    {a.zugewiesen_an_wehr && <span>Wache: {a.zugewiesen_an_wehr.name}</span>}
                    {a.faellig_am && <span>Faellig: {format(new Date(a.faellig_am), 'd. MMM', { locale: de })}</span>}
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
                    <button className="btn btn-sm btn-danger" onClick={() => loeschen(a.id)}>Loeschen</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal mit Kommentaren */}
      {detailAufgabe && (
        <AufgabeDetailModal
          aufgabe={detailAufgabe}
          profile={profile}
          isAdmin={isAdmin}
          kannErstellen={kannErstellen}
          onClose={() => setDetailAufgabe(null)}
          onStatusChange={statusAendern}
          onDelete={loeschen}
        />
      )}

      {/* Neue Aufgabe Modal */}
      {neueAufgabe && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setNeueAufgabe(false)}>
          <div className="modal" style={{ width: '100%', maxWidth: 500 }}>
            <div className="modal-header">
              <h3>Neue Aufgabe</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setNeueAufgabe(false)}>x</button>
            </div>
            <form onSubmit={handleErstellen}>
              <div className="form-group">
                <label>Titel</label>
                <input value={form.titel} onChange={e => setForm(f => ({ ...f, titel: e.target.value }))}
                  placeholder="Aufgabentitel" required />
              </div>
              <div className="form-group">
                <label>Beschreibung (optional)</label>
                <textarea value={form.beschreibung} onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))} rows={2} />
              </div>
              <div className="form-group">
                <label>Zuweisen an</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {[{ v: 'person', l: 'Person' }, { v: 'wache', l: 'Ganze Wache' }, { v: 'keine', l: 'Niemand' }].map(({ v, l }) => (
                    <button key={v} type="button"
                      className={`btn btn-sm ${form.zuweisung_typ === v ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setForm(f => ({ ...f, zuweisung_typ: v }))}>
                      {l}
                    </button>
                  ))}
                </div>
                {form.zuweisung_typ === 'person' && (
                  <select value={form.zugewiesen_an} onChange={e => setForm(f => ({ ...f, zugewiesen_an: e.target.value }))}>
                    <option value="">-- Person auswaehlen</option>
                    {kameraden.map(k => <option key={k.id} value={k.id}>{k.nachname}, {k.vorname}</option>)}
                  </select>
                )}
                {form.zuweisung_typ === 'wache' && (
                  <select value={form.zugewiesen_an_wehr} onChange={e => setForm(f => ({ ...f, zugewiesen_an_wehr: e.target.value }))}>
                    <option value="">-- Wache auswaehlen</option>
                    {wehren.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                )}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Prioritaet</label>
                  <select value={form.prioritaet} onChange={e => setForm(f => ({ ...f, prioritaet: e.target.value }))}>
                    <option value="niedrig">Niedrig</option>
                    <option value="mittel">Mittel</option>
                    <option value="hoch">Hoch</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Faellig am</label>
                  <input type="date" value={form.faellig_am} onChange={e => setForm(f => ({ ...f, faellig_am: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
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

function AufgabeDetailModal({ aufgabe, profile, isAdmin, kannErstellen, onClose, onStatusChange, onDelete }) {
  const [kommentare, setKommentare] = useState([])
  const [neuerKommentar, setNeuerKommentar] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchKommentare() }, [aufgabe.id])

  async function fetchKommentare() {
    const { data } = await supabase
      .from('aufgaben_kommentare')
      .select('*, autor:profiles(vorname,nachname,rolle)')
      .eq('aufgabe_id', aufgabe.id)
      .order('erstellt_am', { ascending: true })
    setKommentare(data ?? [])
    setLoading(false)
  }

  async function handleKommentar(e) {
    e.preventDefault()
    if (!neuerKommentar.trim()) return
    setSending(true)
    await supabase.from('aufgaben_kommentare').insert({
      aufgabe_id: aufgabe.id,
      autor_id: profile.id,
      text: neuerKommentar.trim(),
    })
    setNeuerKommentar('')
    await fetchKommentare()
    setSending(false)
  }

  const rollefarbe = (rolle) => {
    if (rolle === 'wehrleiter' || rolle === 'gemeindebrandmeister') return 'var(--red)'
    if (rolle === 'ausbilder') return '#1A5276'
    if (rolle === 'gruppenfuehrer') return '#1E8449'
    return 'var(--gray-500)'
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h3 style={{ fontSize: 16 }}>{aufgabe.titel}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>x</button>
        </div>

        {/* Aufgaben-Info */}
        <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
          {aufgabe.beschreibung && (
            <p style={{ fontSize: 14, color: 'var(--gray-600)', marginBottom: 10, lineHeight: 1.5 }}>{aufgabe.beschreibung}</p>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={aufgabe.status} onChange={e => onStatusChange(aufgabe.id, e.target.value)}
              style={{ width: 'auto', padding: '5px 8px', fontSize: 13 }}>
              {STATUS_LIST.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <span className={`badge badge-${PRIO_COLOR[aufgabe.prioritaet]}`}>{aufgabe.prioritaet}</span>
            {aufgabe.faellig_am && (
              <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                Faellig: {format(new Date(aufgabe.faellig_am), 'd. MMM yyyy', { locale: de })}
              </span>
            )}
            {aufgabe.zugewiesen_an && (
              <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                → {aufgabe.zugewiesen_an.vorname} {aufgabe.zugewiesen_an.nachname}
              </span>
            )}
            {aufgabe.zugewiesen_an_wehr && (
              <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                → Wache: {aufgabe.zugewiesen_an_wehr.name}
              </span>
            )}
          </div>
          {(isAdmin || aufgabe.erstellt_von?.id === profile?.id) && (
            <button className="btn btn-sm btn-danger" style={{ marginTop: 10 }}
              onClick={() => { onDelete(aufgabe.id); onClose() }}>
              Aufgabe loeschen
            </button>
          )}
        </div>

        {/* Kommentare */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-500)', marginBottom: 10 }}>
            Kommentare ({kommentare.length})
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 16 }}><div className="spinner"></div></div>
          ) : kommentare.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--gray-300)', fontSize: 13 }}>
              Noch keine Kommentare
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
              {kommentare.map(k => {
                const istMeiner = k.autor_id === profile.id
                return (
                  <div key={k.id} style={{
                    display: 'flex', gap: 10,
                    flexDirection: istMeiner ? 'row-reverse' : 'row',
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      background: istMeiner ? 'var(--red-light)' : 'var(--gray-100)',
                      color: istMeiner ? 'var(--red-dark)' : 'var(--gray-500)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 600,
                    }}>
                      {(k.autor?.vorname?.[0] ?? '') + (k.autor?.nachname?.[0] ?? '')}
                    </div>
                    <div style={{ flex: 1, maxWidth: '80%' }}>
                      <div style={{
                        fontSize: 11, color: 'var(--gray-400)', marginBottom: 3,
                        textAlign: istMeiner ? 'right' : 'left',
                        display: 'flex', gap: 6, justifyContent: istMeiner ? 'flex-end' : 'flex-start',
                        alignItems: 'center',
                      }}>
                        <span style={{ fontWeight: 500, color: rollefarbe(k.autor?.rolle) }}>
                          {k.autor?.vorname} {k.autor?.nachname}
                        </span>
                        <span>{format(new Date(k.erstellt_am), 'd. MMM HH:mm', { locale: de })}</span>
                      </div>
                      <div style={{
                        padding: '9px 12px', fontSize: 14, lineHeight: 1.5,
                        background: istMeiner ? 'var(--red-pale)' : 'var(--gray-100)',
                        color: 'var(--gray-700)',
                        borderRadius: istMeiner ? '10px 2px 10px 10px' : '2px 10px 10px 10px',
                      }}>
                        {k.text}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Neuer Kommentar */}
        <form onSubmit={handleKommentar} style={{ display: 'flex', gap: 8 }}>
          <input
            value={neuerKommentar}
            onChange={e => setNeuerKommentar(e.target.value)}
            placeholder="Antwort schreiben..."
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary" disabled={sending || !neuerKommentar.trim()} style={{ flexShrink: 0 }}>
            {sending ? '...' : 'Senden'}
          </button>
        </form>
      </div>
    </div>
  )
}
