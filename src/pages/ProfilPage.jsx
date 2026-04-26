import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const FS_OPTIONEN = ['B', 'BE', 'C1', 'C', 'C1E', 'CE', 'D1', 'D', 'D1E', 'DE', 'T', 'L']
const ROLLEN_LABEL = {
  gemeindebrandmeister: 'Gemeindebrandmeister',
  wehrleiter: 'Wehrleiter',
  gruppenfuehrer: 'Gruppenfuehrer',
  ausbilder: 'Ausbilder',
  kamerad: 'Kamerad'
}

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
  const [msgTyp, setMsgTyp] = useState('success')
  const [pwForm, setPwForm] = useState({ neu: '', neu2: '' })
  const [pwMsg, setPwMsg] = useState('')
  const [pwMsgTyp, setPwMsgTyp] = useState('success')

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  function toggleFs(fs) {
    const list = form.fuehrerschein ?? []
    setForm(f => ({
      ...f,
      fuehrerschein: list.includes(fs) ? list.filter(x => x !== fs) : [...list, fs]
    }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setMsg('')

    const updateData = {
      vorname: form.vorname,
      nachname: form.nachname,
      telefon: form.telefon || null,
      geburtsdatum: form.geburtsdatum || null,
      eintrittsdatum: form.eintrittsdatum || null,
      fuehrerschein: form.fuehrerschein,
      atemschutz: form.atemschutz,
    }

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', profile.id)

    if (!error) {
      await refreshProfile()
      setMsg('Profil erfolgreich gespeichert!')
      setMsgTyp('success')
      setTimeout(() => setMsg(''), 4000)
    } else {
      setMsg('Fehler beim Speichern: ' + error.message)
      setMsgTyp('error')
    }
    setSaving(false)
  }

  async function handlePwChange(e) {
    e.preventDefault()
    setPwMsg('')
    if (pwForm.neu !== pwForm.neu2) {
      setPwMsg('Passwoerter stimmen nicht ueberein.')
      setPwMsgTyp('error')
      return
    }
    if (pwForm.neu.length < 6) {
      setPwMsg('Mindestens 6 Zeichen erforderlich.')
      setPwMsgTyp('error')
      return
    }
    const { error } = await supabase.auth.updateUser({ password: pwForm.neu })
    if (error) {
      setPwMsg('Fehler: ' + error.message)
      setPwMsgTyp('error')
    } else {
      setPwMsg('Passwort erfolgreich geaendert!')
      setPwMsgTyp('success')
      setPwForm({ neu: '', neu2: '' })
    }
    setTimeout(() => setPwMsg(''), 4000)
  }

  const initials = `${form.vorname?.[0] ?? ''}${form.nachname?.[0] ?? ''}`.toUpperCase() || '?'

  return (
    <div style={{ maxWidth: 620 }}>
      <div className="page-header">
        <h1>Mein Profil</h1>
      </div>

      {/* Profilkopf */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
        <div style={{
          width: 60, height: 60, borderRadius: '50%',
          background: 'var(--red)', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 600, flexShrink: 0
        }}>
          {initials}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 18, color: 'var(--gray-800)' }}>
            {form.vorname} {form.nachname}
          </div>
          <div style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 2 }}>
            {ROLLEN_LABEL[profile?.rolle]} · {profile?.email}
          </div>
          {profile?.nutzername && (
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2, fontFamily: 'var(--mono)' }}>
              @{profile.nutzername}
            </div>
          )}
          <span className={`badge badge-${profile?.status === 'aktiv' ? 'green' : 'amber'}`} style={{ marginTop: 8 }}>
            {profile?.status === 'aktiv' ? 'Aktiv' : 'Ausstehend'}
          </span>
        </div>
      </div>

      {/* Persoenliche Daten */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 16 }}>Persoenliche Daten</h3>

        {msg && (
          <div className={`alert alert-${msgTyp === 'success' ? 'success' : 'error'}`}>
            {msg}
          </div>
        )}

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
              <label>Telefon (optional)</label>
              <input
                value={form.telefon}
                onChange={set('telefon')}
                placeholder="z.B. 0151 12345678"
              />
            </div>
            <div className="form-group">
              <label>Geburtsdatum (optional)</label>
              <input type="date" value={form.geburtsdatum} onChange={set('geburtsdatum')} />
            </div>
          </div>

          <div className="form-group">
            <label>Eintrittsdatum (optional)</label>
            <input
              type="date"
              value={form.eintrittsdatum}
              onChange={set('eintrittsdatum')}
              style={{ maxWidth: 200 }}
            />
          </div>

          <div className="form-group">
            <label>Fuehrerscheinklassen</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {FS_OPTIONEN.map(fs => (
                <button
                  key={fs}
                  type="button"
                  onClick={() => toggleFs(fs)}
                  style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 13, fontWeight: 500,
                    border: '1px solid',
                    background: form.fuehrerschein?.includes(fs) ? 'var(--red)' : 'var(--white)',
                    color: form.fuehrerschein?.includes(fs) ? 'white' : 'var(--gray-500)',
                    borderColor: form.fuehrerschein?.includes(fs) ? 'var(--red)' : 'var(--gray-200)',
                    cursor: 'pointer',
                    transition: 'all 150ms',
                  }}
                >
                  {fs}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.atemschutz}
                onChange={e => setForm(f => ({ ...f, atemschutz: e.target.checked }))}
                style={{ width: 'auto', height: 18, cursor: 'pointer' }}
              />
              <span>Atemschutztraeger</span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Wird gespeichert...' : 'Aenderungen speichern'}
            </button>
          </div>
        </form>
      </div>

      {/* Passwort aendern */}
      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Passwort aendern</h3>

        {pwMsg && (
          <div className={`alert alert-${pwMsgTyp === 'success' ? 'success' : 'error'}`}>
            {pwMsg}
          </div>
        )}

        <form onSubmit={handlePwChange}>
          <div className="form-group">
            <label>Neues Passwort</label>
            <input
              type="password"
              value={pwForm.neu}
              onChange={e => setPwForm(f => ({ ...f, neu: e.target.value }))}
              placeholder="Mindestens 6 Zeichen"
              required
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label>Passwort bestaetigen</label>
            <input
              type="password"
              value={pwForm.neu2}
              onChange={e => setPwForm(f => ({ ...f, neu2: e.target.value }))}
              placeholder="Passwort wiederholen"
              required
              autoComplete="new-password"
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-secondary">
              Passwort aendern
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
