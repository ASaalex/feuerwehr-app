import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const FS_OPTIONEN = ['B', 'BE', 'C1', 'C', 'C1E', 'CE', 'D1', 'D', 'D1E', 'DE', 'T', 'L']
const ROLLEN_LABEL = { gemeindebrandmeister: 'Gemeindebrandmeister', wehrleiter: 'Wehrleiter', gruppenfuehrer: 'Gruppenführer', ausbilder: 'Ausbilder', kamerad: 'Kamerad' }

export default function ProfilPage() {
  const { profile, refreshProfile } = useAuth()
  const [form, setForm] = useState({
    vorname: profile?.vorname ?? '',
    nachname: profile?.nachname ?? '',
    telefon: profile?.telefon ?? '',
    geburtsdatum: profile?.geburtsdatum ?? '',
    eintrittsdatum: profile?.eintrittsdatum ?? '',
    fuehrerschein: profile?.fuehrerschein ?? [],
    atemschutz: profile?.atemschutz ?? false,
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [pwForm, setPwForm] = useState({ neu: '', neu2: '' })
  const [pwMsg, setPwMsg] = useState('')

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })) }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('profiles').update(form).eq('id', profile.id)
    if (!error) {
      await refreshProfile()
      setMsg('Profil gespeichert!')
      setTimeout(() => setMsg(''), 3000)
    }
    setSaving(false)
  }

  async function handlePwChange(e) {
    e.preventDefault()
    if (pwForm.neu !== pwForm.neu2) return setPwMsg('Passwörter stimmen nicht überein.')
    if (pwForm.neu.length < 6) return setPwMsg('Mindestens 6 Zeichen.')
    const { error } = await supabase.auth.updateUser({ password: pwForm.neu })
    if (error) setPwMsg('Fehler: ' + error.message)
    else { setPwMsg('Passwort geändert!'); setPwForm({ neu: '', neu2: '' }) }
    setTimeout(() => setPwMsg(''), 4000)
  }

  const initials = `${form.vorname?.[0] ?? ''}${form.nachname?.[0] ?? ''}`.toUpperCase() || '?'

  return (
    <div style={{ maxWidth: 620 }}>
      <div className="page-header">
        <h1>Mein Profil</h1>
      </div>

      {/* Avatar */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--red)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 600, flexShrink: 0 }}>
          {initials}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 18, color: 'var(--gray-800)' }}>{form.vorname} {form.nachname}</div>
          <div style={{ fontSize: 14, color: 'var(--gray-400)', marginTop: 2 }}>{ROLLEN_LABEL[profile?.rolle]} · {profile?.email}</div>
          <span className={`badge badge-${profile?.status === 'aktiv' ? 'green' : 'amber'}`} style={{ marginTop: 6 }}>
            {profile?.status === 'aktiv' ? 'Aktiv' : 'Ausstehend'}
          </span>
        </div>
      </div>

      {/* Profildaten */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 16 }}>Persönliche Daten</h3>
        {msg && <div className="alert alert-success">{msg}</div>}
        <form onSubmit={handleSave}>
          <div className="form-row">
            <div className="form-group">
              <label>Vorname</label>
              <input value={form.vorname} onChange={set('vorname')} required />
            </div>
            <div className="form-group">
              <label>Nachname</label>
              <input value={form.nachname} onChange={set('nachname')} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Telefon</label>
              <input value={form.telefon} onChange={set('telefon')} placeholder="z.B. 0151 12345678" />
            </div>
            <div className="form-group">
              <label>Geburtsdatum</label>
              <input type="date" value={form.geburtsdatum} onChange={set('geburtsdatum')} />
            </div>
          </div>
          <div className="form-group">
            <label>Eintrittsdatum</label>
            <input type="date" value={form.eintrittsdatum} onChange={set('eintrittsdatum')} style={{ maxWidth: 200 }} />
          </div>
          <div className="form-group">
            <label>Führerscheinklassen</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {FS_OPTIONEN.map(fs => (
                <button key={fs} type="button"
                  style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 500,
                    border: '1px solid',
                    background: form.fuehrerschein?.includes(fs) ? 'var(--red)' : 'var(--white)',
                    color: form.fuehrerschein?.includes(fs) ? 'white' : 'var(--gray-500)',
                    borderColor: form.fuehrerschein?.includes(fs) ? 'var(--red)' : 'var(--gray-200)',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    const list = form.fuehrerschein ?? []
                    setForm(f => ({ ...f, fuehrerschein: list.includes(fs) ? list.filter(x => x !== fs) : [...list, fs] }))
                  }}>
                  {fs}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.atemschutz} onChange={e => setForm(f => ({ ...f, atemschutz: e.target.checked }))} style={{ width: 'auto' }} />
              Atemschutzträger
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Speichern...' : 'Änderungen speichern'}
            </button>
          </div>
        </form>
      </div>

      {/* Passwort */}
      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Passwort ändern</h3>
        {pwMsg && <div className={`alert ${pwMsg.includes('Fehler') || pwMsg.includes('nicht') ? 'alert-error' : 'alert-success'}`}>{pwMsg}</div>}
        <form onSubmit={handlePwChange}>
          <div className="form-group">
            <label>Neues Passwort</label>
            <input type="password" value={pwForm.neu} onChange={e => setPwForm(f => ({ ...f, neu: e.target.value }))} placeholder="Mindestens 6 Zeichen" required />
          </div>
          <div className="form-group">
            <label>Passwort bestätigen</label>
            <input type="password" value={pwForm.neu2} onChange={e => setPwForm(f => ({ ...f, neu2: e.target.value }))} placeholder="••••••••" required />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-secondary">Passwort ändern</button>
          </div>
        </form>
      </div>
    </div>
  )
}
