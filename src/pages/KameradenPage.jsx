import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

const ROLLEN = ['gemeindebrandmeister', 'wehrleiter', 'gruppenfuehrer', 'ausbilder', 'kamerad', 'tablet']
const ROLLEN_LABEL = {
  gemeindebrandmeister: 'Gemeindebrandmeister',
  wehrleiter: 'Wehrleiter',
  gruppenfuehrer: 'Gruppenfuehrer',
  ausbilder: 'Ausbilder',
  kamerad: 'Kamerad',
  tablet: 'Fahrzeug-Tablet',
}
const FS_OPTIONEN = ['B', 'BE', 'C1', 'C', 'C1E', 'CE', 'D1', 'D', 'D1E', 'DE', 'T', 'L']

const RECHTE_MATRIX = [
  { label: 'Dashboard',                      kamerad: true,  ausbilder: true,  gruppenfuehrer: true,  wehrleiter: true,             gemeindebrandmeister: true  },
  { label: 'Dokumente lesen',                kamerad: true,  ausbilder: true,  gruppenfuehrer: true,  wehrleiter: true,             gemeindebrandmeister: true  },
  { label: 'Dokumente hochladen',            kamerad: false, ausbilder: true,  gruppenfuehrer: false, wehrleiter: true,             gemeindebrandmeister: true  },
  { label: 'Pruefungen ablegen',             kamerad: true,  ausbilder: true,  gruppenfuehrer: true,  wehrleiter: true,             gemeindebrandmeister: true  },
  { label: 'Pruefungen erstellen',           kamerad: false, ausbilder: true,  gruppenfuehrer: false, wehrleiter: 'eigene Wache',   gemeindebrandmeister: true  },
  { label: 'Pruefungen auswerten',           kamerad: false, ausbilder: true,  gruppenfuehrer: false, wehrleiter: 'eigene Wache',   gemeindebrandmeister: true  },
  { label: 'Aufgaben sehen (eigene)',        kamerad: true,  ausbilder: true,  gruppenfuehrer: true,  wehrleiter: true,             gemeindebrandmeister: true  },
  { label: 'Aufgaben erstellen',             kamerad: false, ausbilder: false, gruppenfuehrer: true,  wehrleiter: 'eigene Wache',   gemeindebrandmeister: true  },
  { label: 'Kameraden verwalten',            kamerad: false, ausbilder: false, gruppenfuehrer: false, wehrleiter: 'eigene Wache',   gemeindebrandmeister: true  },
  { label: 'Administration',                 kamerad: false, ausbilder: false, gruppenfuehrer: false, wehrleiter: 'eigene Wache',   gemeindebrandmeister: true  },
]

function RechteZelle({ value }) {
  if (value === true) return <span style={{ color: '#1E8449', fontSize: 16 }}>✓</span>
  if (value === false) return <span style={{ color: 'var(--gray-300)', fontSize: 16 }}>—</span>
  return <span style={{ fontSize: 11, color: '#185FA5', background: '#E6F1FB', padding: '2px 6px', borderRadius: 10 }}>{value}</span>
}

export default function KameradenPage() {
  const { profile: myProfile } = useAuth()
  const [kameraden, setKameraden] = useState([])
  const [wehren, setWehren] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ status: 'alle', suche: '', wehr: 'alle' })
  const [editModal, setEditModal] = useState(null)
  const [editTab, setEditTab] = useState('profil')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [aufladeEuro, setAufladeEuro] = useState('')
  const [aufladeLoading, setAufladeLoading] = useState(false)
  const [kiTransaktionen, setKiTransaktionen] = useState([])
  const [kiTransLoading, setKiTransLoading] = useState(false)

  const isGemeinde = myProfile?.rolle === 'gemeindebrandmeister'
  const isWehrleiter = myProfile?.rolle === 'wehrleiter'
  const [alleLehrgaenge, setAlleLehrgaenge] = useState([])

  useEffect(() => { fetchKameraden(); fetchWehren(); fetchLehrgaenge() }, [])

  async function fetchLehrgaenge() {
    const { data } = await supabase.from('lehrgaenge').select('id,name,kuerzel').order('name')
    setAlleLehrgaenge(data ?? [])
  }

  async function fetchWehren() {
    const { data } = await supabase.from('wehren').select('id,name').order('name')
    setWehren(data ?? [])
  }

  const [tablets, setTablets] = useState([])

  async function fetchKameraden() {
    let query = supabase.from('profiles').select('*, wehr:wehren(id,name), kamerad_lehrgaenge(lehrgang_id), kamerad_wehren(wehr_id,ist_hauptwache,wehr:wehren(id,name))').neq('rolle', 'tablet').order('nachname')
    if (isWehrleiter) query = query.eq('wehr_id', myProfile.wehr_id)
    const { data } = await query
    setKameraden(data ?? [])

    // Tablet-Nutzer separat laden
    let tQuery = supabase.from('profiles').select('id, vorname, nachname, nutzername, status, wehr:wehren(id,name)').eq('rolle', 'tablet').order('nachname')
    if (isWehrleiter) tQuery = tQuery.eq('wehr_id', myProfile.wehr_id)
    const { data: tData } = await tQuery
    setTablets(tData ?? [])

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
      wehr_id: editModal.wehr_id || null,
    }).eq('id', editModal.id)

    // Lehrgaenge aktualisieren
    await supabase.from('kamerad_lehrgaenge').delete().eq('kamerad_id', editModal.id)
    if (editModal.lehrgaenge?.length > 0) {
      await supabase.from('kamerad_lehrgaenge').insert(
        editModal.lehrgaenge.map(lid => ({ kamerad_id: editModal.id, lehrgang_id: lid }))
      )
    }

    // Weitere Wachen aktualisieren
    await supabase.from('kamerad_wehren').delete().eq('kamerad_id', editModal.id)
    if (editModal.weitereWehren?.length > 0) {
      await supabase.from('kamerad_wehren').insert(
        editModal.weitereWehren.map((wid, i) => ({
          kamerad_id: editModal.id,
          wehr_id: wid,
          ist_hauptwache: wid === editModal.wehr_id,
        }))
      )
    }
    if (!error) {
      await fetchKameraden()
      setEditModal(null)
      setMsg('Gespeichert!')
      setTimeout(() => setMsg(''), 3000)
    } else {
      console.error('Speicherfehler:', error)
      setMsg('Fehler: ' + error.message)
      setTimeout(() => setMsg(''), 5000)
    }
    setSaving(false)
  }

  async function ladeKiTransaktionen(kameradId) {
    setKiTransLoading(true)
    const { data } = await supabase
      .from('ki_transaktionen')
      .select('*')
      .eq('kamerad_id', kameradId)
      .order('erstellt_am', { ascending: false })
      .limit(20)
    setKiTransaktionen(data ?? [])
    setKiTransLoading(false)
  }

  async function aufladenKI() {
    const euro = parseFloat(aufladeEuro.replace(',', '.'))
    if (isNaN(euro) || euro <= 0) return
    setAufladeLoading(true)
    const cent = Math.round(euro * 100)
    const neuesGuthaben = (editModal.ki_guthaben_cent ?? 0) + cent

    const { error } = await supabase
      .from('profiles')
      .update({ ki_guthaben_cent: neuesGuthaben })
      .eq('id', editModal.id)

    if (!error) {
      await supabase.from('ki_transaktionen').insert({
        kamerad_id: editModal.id,
        betrag_cent: cent,
        typ: 'aufladung',
        beschreibung: `Manuelle Aufladung durch ${myProfile.vorname} ${myProfile.nachname}`,
        erstellt_von: myProfile.id,
      })
      setEditModal(m => ({ ...m, ki_guthaben_cent: neuesGuthaben }))
      setAufladeEuro('')
      await ladeKiTransaktionen(editModal.id)
      await fetchKameraden()
      setMsg(`${euro.toFixed(2).replace('.', ',')} € aufgeladen ✓`)
      setTimeout(() => setMsg(''), 3000)
    }
    setAufladeLoading(false)
  }

  async function guthabenZuruecksetzen() {
    if (!confirm('Guthaben wirklich auf 0 zurücksetzen?')) return
    await supabase.from('profiles').update({ ki_guthaben_cent: 0 }).eq('id', editModal.id)
    await supabase.from('ki_transaktionen').insert({
      kamerad_id: editModal.id,
      betrag_cent: -(editModal.ki_guthaben_cent ?? 0),
      typ: 'abbuchung',
      beschreibung: `Manuelles Zurücksetzen durch ${myProfile.vorname} ${myProfile.nachname}`,
      erstellt_von: myProfile.id,
    })
    setEditModal(m => ({ ...m, ki_guthaben_cent: 0 }))
    await ladeKiTransaktionen(editModal.id)
    await fetchKameraden()
  }

  async function statusAendern(id, status) {
    await supabase.from('profiles').update({ status }).eq('id', id)
    await fetchKameraden()
  }

  async function handleLoeschen(k) {
    if (!confirm(`Kamerad ${k.vorname} ${k.nachname} wirklich loeschen? Diese Aktion kann nicht rueckgaengig gemacht werden.`)) return
    // Profil loeschen (Auth-User bleibt, kann sich nicht mehr einloggen da kein Profil)
    await supabase.from('profiles').delete().eq('id', k.id)
    await fetchKameraden()
  }

  const gefiltert = kameraden.filter(k => {
    if (filter.status !== 'alle' && k.status !== filter.status) return false
    if (filter.wehr !== 'alle' && k.wehr_id !== filter.wehr) return false
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
        {msg && <div className="alert alert-success" style={{ margin: 0, padding: '8px 14px' }}>{msg}</div>}
      </div>

      {ausstehend > 0 && (
        <div className="alert alert-info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{ausstehend} Kamerad{ausstehend > 1 ? 'en warten' : ' wartet'} auf Freischaltung</span>
          <button className="btn btn-sm btn-secondary" onClick={() => setFilter(f => ({ ...f, status: 'ausstehend' }))}>Anzeigen</button>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20, padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input placeholder="Suche nach Name oder E-Mail..." value={filter.suche} onChange={e => setFilter(f => ({ ...f, suche: e.target.value }))} style={{ maxWidth: 280 }} />
          <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))} style={{ maxWidth: 160 }}>
            <option value="alle">Alle Status</option>
            <option value="aktiv">Aktiv</option>
            <option value="ausstehend">Ausstehend</option>
            <option value="inaktiv">Inaktiv</option>
          </select>
          {isGemeinde && (
            <select value={filter.wehr} onChange={e => setFilter(f => ({ ...f, wehr: e.target.value }))} style={{ maxWidth: 220 }}>
              <option value="alle">Alle Wehren</option>
              {wehren.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                {isGemeinde && <th>Wache</th>}

                <th className="col-hide-mobile">Rolle</th>
                <th className="col-hide-mobile">Kontakt</th>
                <th className="col-hide-mobile">Atemschutz</th>
                <th>Status</th>

                <th></th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 32 }}>Keine Kameraden gefunden</td></tr>
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
                  {isGemeinde && <td style={{ fontSize: 13, color: 'var(--gray-500)' }}>{k.wehr?.name ?? '—'}</td>}

                  <td className="col-hide-mobile"><span className="badge badge-blue" style={{ fontSize: 11 }}>{ROLLEN_LABEL[k.rolle] ?? k.rolle}</span></td>
                  <td className="col-hide-mobile">
                    <div style={{ fontSize: 13 }}>{k.email}</div>
                    {k.telefon && <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{k.telefon}</div>}
                  </td>
                  <td className="col-hide-mobile">{k.atemschutz ? <span className="badge badge-green">Ja</span> : <span className="badge badge-gray">Nein</span>}</td>
                  <td><span className={`badge badge-${statusColor(k.status)}`}>{statusLabel(k.status)}</span></td>

                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      {k.status === 'ausstehend' && (
                        <button className="btn btn-sm col-hide-mobile" style={{ background: '#D5F5E3', color: '#1E8449', border: 'none' }} onClick={() => statusAendern(k.id, 'aktiv')}>
                          Freischalten
                        </button>
                      )}
                      {k.status === 'aktiv' && (
                        <button className="btn btn-sm btn-secondary col-hide-mobile" onClick={() => statusAendern(k.id, 'inaktiv')}
                          title="Zugang deaktivieren">
                          Deaktivieren
                        </button>
                      )}
                      {k.status === 'inaktiv' && (
                        <button className="btn btn-sm col-hide-mobile" style={{ background: '#D5F5E3', color: '#1E8449', border: 'none' }} onClick={() => statusAendern(k.id, 'aktiv')}>
                          Aktivieren
                        </button>
                      )}
                      <button className="btn btn-sm btn-secondary" onClick={() => { setEditModal({ ...k, fuehrerschein: k.fuehrerschein ?? [], wehr_id: k.wehr_id ?? '', lehrgaenge: (k.kamerad_lehrgaenge ?? []).map(x => x.lehrgang_id), weitereWehren: (k.kamerad_wehren ?? []).map(x => x.wehr_id) }); setEditTab('profil') }}>
                        Bearbeiten
                      </button>
                      <button className="btn btn-sm btn-danger col-hide-mobile" onClick={() => handleLoeschen(k)}>
                        Loeschen
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fahrzeug-Tablets */}
      {tablets.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            <h3 style={{ margin: 0, fontSize: 15 }}>Fahrzeug-Tablets</h3>
            <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>– nicht in Kameradenzählung</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tablets.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--gray-50)', borderRadius: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{t.nutzername}</div>
                  {t.wehr && <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{t.wehr.name}</div>}
                </div>
                <span className={`badge badge-${statusColor(t.status)}`}>{statusLabel(t.status)}</span>
                {t.status === 'ausstehend' && (
                  <button className="btn btn-sm" style={{ background: '#D5F5E3', color: '#1E8449', border: 'none' }}
                    onClick={() => statusAendern(t.id, 'aktiv')}>
                    Freischalten
                  </button>
                )}
                {t.status === 'aktiv' && (
                  <button className="btn btn-sm btn-secondary"
                    onClick={() => statusAendern(t.id, 'inaktiv')}>
                    Deaktivieren
                  </button>
                )}
                {t.status === 'inaktiv' && (
                  <button className="btn btn-sm" style={{ background: '#D5F5E3', color: '#1E8449', border: 'none' }}
                    onClick={() => statusAendern(t.id, 'aktiv')}>
                    Aktivieren
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {editModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setEditModal(null)}>
          <div className="modal" style={{ maxWidth: 620 }}>
            <div className="modal-header">
              <h3>{editModal.vorname} {editModal.nachname}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditModal(null)}>x</button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--gray-100)', marginBottom: 20 }}>
              {[
                { key: 'profil', label: 'Profil' },
                { key: 'rolle', label: 'Rolle & Rechte' },
                { key: 'ki_guthaben', label: '💳 KI-Guthaben' },
              ].map(tab => (
                <button key={tab.key} onClick={() => {
                  setEditTab(tab.key)
                  if (tab.key === 'ki_guthaben') ladeKiTransaktionen(editModal.id)
                }} style={{
                  padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 14, fontWeight: editTab === tab.key ? 500 : 400,
                  color: editTab === tab.key ? 'var(--red)' : 'var(--gray-400)',
                  borderBottom: editTab === tab.key ? '2px solid var(--red)' : '2px solid transparent',
                  marginBottom: -1,
                }}>{tab.label}</button>
              ))}
            </div>

            {editTab === 'profil' && (
              <div>
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
                <div className="form-group">
                  <label>Hauptwache</label>
                  <select value={editModal.wehr_id} onChange={e => setEditModal(m => ({ ...m, wehr_id: e.target.value }))}>
                    <option value="">— Keine Wache</option>
                    {wehren.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Weitere Wachen (Mehrfachmitgliedschaft)</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                    {wehren.map(w => {
                      const istHauptwache = w.id === editModal.wehr_id
                      const aktiv = (editModal.weitereWehren ?? []).includes(w.id) || istHauptwache
                      return (
                        <label key={w.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                          borderRadius: 8, cursor: istHauptwache ? 'default' : 'pointer',
                          border: `1px solid ${aktiv ? 'var(--red)' : 'var(--gray-200)'}`,
                          background: aktiv ? 'var(--red-pale)' : 'white',
                          opacity: istHauptwache ? 0.7 : 1,
                        }}>
                          <input type="checkbox"
                            checked={aktiv}
                            disabled={istHauptwache}
                            onChange={() => {
                              if (istHauptwache) return
                              const list = editModal.weitereWehren ?? []
                              const hatSchon = list.includes(w.id)
                              setEditModal(m => ({ ...m, weitereWehren: hatSchon ? list.filter(x => x !== w.id) : [...list, w.id] }))
                            }}
                            style={{ width: 'auto' }} />
                          <span style={{ fontSize: 14, color: 'var(--gray-700)' }}>{w.name}</span>
                          {istHauptwache && <span style={{ fontSize: 11, color: 'var(--gray-400)', marginLeft: 'auto' }}>Hauptwache</span>}
                        </label>
                      )
                    })}
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
                    <label>Status</label>
                    <select value={editModal.status} onChange={e => setEditModal(m => ({ ...m, status: e.target.value }))}>
                      <option value="ausstehend">Ausstehend</option>
                      <option value="aktiv">Aktiv</option>
                      <option value="inaktiv">Inaktiv</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Fuehrerscheinklassen</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {FS_OPTIONEN.map(fs => (
                      <button key={fs} type="button" onClick={() => {
                        const list = editModal.fuehrerschein ?? []
                        setEditModal(m => ({ ...m, fuehrerschein: list.includes(fs) ? list.filter(x => x !== fs) : [...list, fs] }))
                      }} style={{
                        padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: '1px solid', cursor: 'pointer',
                        background: editModal.fuehrerschein?.includes(fs) ? 'var(--red)' : 'var(--white)',
                        color: editModal.fuehrerschein?.includes(fs) ? 'white' : 'var(--gray-500)',
                        borderColor: editModal.fuehrerschein?.includes(fs) ? 'var(--red)' : 'var(--gray-200)',
                      }}>{fs}</button>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={editModal.atemschutz} onChange={e => setEditModal(m => ({ ...m, atemschutz: e.target.checked }))} style={{ width: 'auto' }} />
                    Atemschutztraeger
                  </label>
                </div>

                <div className="form-group">
                  <label>Lehrgaenge</label>
                  {alleLehrgaenge.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                      Noch keine Lehrgaenge angelegt. Zuerst unter Administration anlegen.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {alleLehrgaenge.map(l => {
                        const hat = (editModal.lehrgaenge ?? []).includes(l.id)
                        return (
                          <button key={l.id} type="button" onClick={() => {
                            const list = editModal.lehrgaenge ?? []
                            setEditModal(m => ({
                              ...m,
                              lehrgaenge: hat
                                ? list.filter(x => x !== l.id)
                                : [...list, l.id]
                            }))
                          }} style={{
                            padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                            border: '1px solid', cursor: 'pointer', transition: 'all 150ms',
                            background: hat ? '#3C3489' : 'var(--white)',
                            color: hat ? 'white' : 'var(--gray-500)',
                            borderColor: hat ? '#3C3489' : 'var(--gray-200)',
                          }}>
                            {l.kuerzel ? `${l.kuerzel}` : ''}{l.kuerzel && ' – '}{l.name}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {editTab === 'rolle' && (
              <div>
                <div className="form-group" style={{ marginBottom: 24 }}>
                  <label>Rolle zuweisen</label>
                  {editModal.id === myProfile?.id ? (
                    <div style={{ padding: '9px 12px', background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)', fontSize: 14, color: 'var(--gray-500)', maxWidth: 280 }}>
                      {ROLLEN_LABEL[editModal.rolle]}
                      <div style={{ fontSize: 12, marginTop: 4, color: 'var(--gray-400)' }}>Eigene Rolle kann nicht geaendert werden.</div>
                    </div>
                  ) : (
                    <select value={editModal.rolle} onChange={e => setEditModal(m => ({ ...m, rolle: e.target.value }))} style={{ maxWidth: 280 }}>
                      {(isGemeinde ? ROLLEN : ROLLEN.filter(r => ['wehrleiter','ausbilder','kamerad'].includes(r))).map(r => <option key={r} value={r}>{ROLLEN_LABEL[r]}</option>)}
                    </select>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 6 }}>
                    Die Rolle bestimmt automatisch alle Zugriffsrechte des Kameraden.
                  </div>
                </div>

                {/* Rechte-Tabelle */}
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-600)', marginBottom: 10 }}>
                  Rechteubersicht fur gewaehlte Rolle: <span style={{ color: 'var(--red)' }}>{ROLLEN_LABEL[editModal.rolle]}</span>
                </div>
                <div style={{ border: '1px solid var(--gray-100)', borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--gray-50)' }}>
                        <th style={{ textAlign: 'left', padding: '8px 14px', fontWeight: 500, color: 'var(--gray-400)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--gray-100)' }}>Modul / Funktion</th>
                        {ROLLEN.map(r => (
                          <th key={r} style={{
                            textAlign: 'center', padding: '8px 10px', fontSize: 11, fontWeight: r === editModal.rolle ? 600 : 400,
                            color: r === editModal.rolle ? 'var(--red)' : 'var(--gray-400)',
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                            borderBottom: '1px solid var(--gray-100)',
                            background: r === editModal.rolle ? 'var(--red-pale)' : 'transparent',
                          }}>
                            {r === 'gemeindebrandmeister' ? 'GBM' : r === 'wehrleiter' ? 'WL' : r === 'gruppenfuehrer' ? 'GF' : r === 'ausbilder' ? 'Ausb.' : 'Kam.'}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {RECHTE_MATRIX.map((zeile, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'white' : 'var(--gray-50)' }}>
                          <td style={{ padding: '9px 14px', color: 'var(--gray-600)', borderBottom: '1px solid var(--gray-100)' }}>{zeile.label}</td>
                          {ROLLEN.map(r => (
                            <td key={r} style={{
                              textAlign: 'center', padding: '9px 10px',
                              borderBottom: '1px solid var(--gray-100)',
                              background: r === editModal.rolle ? 'rgba(192,57,43,0.04)' : 'transparent',
                            }}>
                              <RechteZelle value={zeile[r]} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {editTab === 'ki_guthaben' && (
              <div>
                {/* Aktuelles Guthaben */}
                <div style={{
                  padding: '20px 24px', borderRadius: 12, marginBottom: 24, textAlign: 'center',
                  background: (editModal.ki_guthaben_cent ?? 0) <= 0 ? '#FFF1F2' : (editModal.ki_guthaben_cent ?? 0) < 20 ? '#FFF8E1' : '#F0FDF4',
                  border: `1.5px solid ${(editModal.ki_guthaben_cent ?? 0) <= 0 ? '#FECDD3' : (editModal.ki_guthaben_cent ?? 0) < 20 ? '#FDE68A' : '#BBF7D0'}`,
                }}>
                  <div style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 4 }}>Aktuelles KI-Guthaben</div>
                  <div style={{
                    fontSize: 32, fontWeight: 700,
                    color: (editModal.ki_guthaben_cent ?? 0) <= 0 ? '#BE123C' : (editModal.ki_guthaben_cent ?? 0) < 20 ? '#B45309' : '#15803D',
                  }}>
                    {((editModal.ki_guthaben_cent ?? 0) / 100).toFixed(2).replace('.', ',')} €
                  </div>
                  {(editModal.ki_guthaben_cent ?? 0) <= 0 && (
                    <div style={{ fontSize: 12, color: '#BE123C', marginTop: 4 }}>Keine Simulationen möglich</div>
                  )}
                  {(editModal.ki_guthaben_cent ?? 0) > 0 && (editModal.ki_guthaben_cent ?? 0) < 20 && (
                    <div style={{ fontSize: 12, color: '#B45309', marginTop: 4 }}>Guthaben fast aufgebraucht</div>
                  )}
                </div>

                {/* Aufladen */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-600)', marginBottom: 10 }}>Guthaben aufladen</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Schnellbeträge */}
                    {[1, 2, 5, 10].map(euro => (
                      <button key={euro} type="button"
                        onClick={() => setAufladeEuro(String(euro))}
                        style={{
                          padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500,
                          border: '1px solid', cursor: 'pointer', transition: 'all 150ms',
                          background: aufladeEuro === String(euro) ? 'var(--red)' : 'var(--white)',
                          color: aufladeEuro === String(euro) ? 'white' : 'var(--gray-500)',
                          borderColor: aufladeEuro === String(euro) ? 'var(--red)' : 'var(--gray-200)',
                        }}>
                        {euro} €
                      </button>
                    ))}
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Eigener Betrag"
                      value={aufladeEuro}
                      onChange={e => setAufladeEuro(e.target.value)}
                      style={{ width: 130, fontSize: 13 }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>€</span>
                    <button className="btn btn-primary btn-sm"
                      onClick={aufladenKI}
                      disabled={!aufladeEuro || parseFloat(aufladeEuro) <= 0 || aufladeLoading}
                      style={{ minWidth: 90 }}>
                      {aufladeLoading ? 'Lädt...' : '+ Aufladen'}
                    </button>
                  </div>
                </div>

                {/* Zurücksetzen */}
                {(editModal.ki_guthaben_cent ?? 0) > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <button type="button" className="btn btn-sm btn-secondary"
                      onClick={guthabenZuruecksetzen}
                      style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                      Guthaben auf 0 zurücksetzen
                    </button>
                  </div>
                )}

                {/* Transaktions-Verlauf */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-600)', marginBottom: 10 }}>
                    Letzte Transaktionen
                  </div>
                  {kiTransLoading ? (
                    <div style={{ textAlign: 'center', padding: 20 }}><div className="spinner" style={{ margin: '0 auto' }}></div></div>
                  ) : kiTransaktionen.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--gray-400)', padding: '12px 0' }}>Noch keine Transaktionen.</div>
                  ) : (
                    <div style={{ border: '1px solid var(--gray-100)', borderRadius: 8, overflow: 'hidden' }}>
                      {kiTransaktionen.map((tx, i) => (
                        <div key={tx.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                          borderBottom: i < kiTransaktionen.length - 1 ? '1px solid var(--gray-100)' : 'none',
                          background: i % 2 === 0 ? 'white' : 'var(--gray-50)',
                        }}>
                          <span style={{ fontSize: 16, flexShrink: 0 }}>
                            {tx.typ === 'aufladung' ? '⬆️' : '⬇️'}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: 'var(--gray-600)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {tx.beschreibung ?? (tx.typ === 'aufladung' ? 'Aufladung' : 'KI-Nutzung')}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                              {format(new Date(tx.erstellt_am), 'dd.MM.yyyy HH:mm', { locale: de })}
                            </div>
                          </div>
                          <span style={{
                            fontSize: 13, fontWeight: 600, flexShrink: 0,
                            color: tx.betrag_cent > 0 ? '#15803D' : '#BE123C',
                          }}>
                            {tx.betrag_cent > 0 ? '+' : ''}{(tx.betrag_cent / 100).toFixed(2).replace('.', ',')} €
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--gray-100)' }}>
              <button className="btn btn-secondary" onClick={() => setEditModal(null)}>Abbrechen</button>
              {editTab !== 'ki_guthaben' && (
                <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
                  {saving ? 'Speichern...' : 'Speichern'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function statusColor(s) { return s === 'aktiv' ? 'green' : s === 'ausstehend' ? 'amber' : 'gray' }
function statusLabel(s) { return s === 'aktiv' ? 'Aktiv' : s === 'ausstehend' ? 'Ausstehend' : 'Inaktiv' }
