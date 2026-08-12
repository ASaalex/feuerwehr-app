import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import AvatarPicker from '../components/AvatarPicker'

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
    strasse: profile?.strasse ?? '',
    plz: profile?.plz ?? '',
    ort: profile?.ort ?? '',
    iban: profile?.iban ?? '',
    bic: profile?.bic ?? '',
    bankname: profile?.bankname ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgTyp, setMsgTyp] = useState('success')
  const [pwForm, setPwForm] = useState({ neu: '', neu2: '' })
  const [pwMsg, setPwMsg] = useState('')
  const [pwMsgTyp, setPwMsgTyp] = useState('success')
  const [avatarModal, setAvatarModal] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarMsg, setAvatarMsg] = useState('')

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
      strasse: form.strasse || null,
      plz: form.plz || null,
      ort: form.ort || null,
      iban: form.iban || null,
      bic: form.bic || null,
      bankname: form.bankname || null,
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

  async function handleFotoUpload(e) {
    const datei = e.target.files[0]
    e.target.value = ''
    if (!datei) return
    setAvatarUploading(true)
    setAvatarMsg('')

    const ext = datei.name.split('.').pop()
    const pfad = `${profile.id}/avatar.${ext}`
    const { error: uploadError } = await supabase.storage.from('avatare').upload(pfad, datei, { upsert: true })
    if (uploadError) {
      setAvatarMsg('Fehler beim Hochladen: ' + uploadError.message)
      setAvatarUploading(false)
      return
    }

    const { data: pub } = supabase.storage.from('avatare').getPublicUrl(pfad)
    const url = `${pub.publicUrl}?t=${Date.now()}`
    const { error } = await supabase.from('profiles').update({ avatar_url: url, avatar_key: null }).eq('id', profile.id)
    if (error) {
      setAvatarMsg('Fehler beim Speichern: ' + error.message)
    } else {
      await refreshProfile()
      setAvatarModal(false)
    }
    setAvatarUploading(false)
  }

  async function handleAvatarWahl(key) {
    setAvatarUploading(true)
    setAvatarMsg('')
    const { error } = await supabase.from('profiles').update({ avatar_key: key, avatar_url: null }).eq('id', profile.id)
    if (error) {
      setAvatarMsg('Fehler beim Speichern: ' + error.message)
    } else {
      await refreshProfile()
      setAvatarModal(false)
    }
    setAvatarUploading(false)
  }

  return (
    <div style={{ maxWidth: 620 }}>
      <div className="page-header">
        <h1>Mein Profil</h1>
      </div>

      {/* Profilkopf */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => { setAvatarMsg(''); setAvatarModal(true) }}
          title="Profilbild aendern"
          style={{ position: 'relative', border: 'none', background: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}
        >
          <Avatar url={profile?.avatar_url} avatarKey={profile?.avatar_key} name={`${form.vorname} ${form.nachname}`} size={60} />
          <div style={{
            position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: '50%',
            background: 'var(--gray-700)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, border: '2px solid white',
          }}>✎</div>
        </button>
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
            <label>Strasse und Hausnummer (optional)</label>
            <input value={form.strasse} onChange={set('strasse')} placeholder="z.B. Musterstrasse 1" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>PLZ</label>
              <input value={form.plz} onChange={set('plz')} placeholder="99428" maxLength={5} />
            </div>
            <div className="form-group">
              <label>Ort</label>
              <input value={form.ort} onChange={set('ort')} placeholder="Grammetal" />
            </div>
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

      {/* IBAN und BIC - nur fuer den Nutzer selbst */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Bankverbindung</h3>
        <div style={{ background: '#EBF5FB', border: '1px solid #AED6F1', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#1A5276', lineHeight: 1.6 }}>
            <strong>Freiwillige Angabe.</strong> IBAN und BIC werden ausschliesslich zur automatischen
            Befuellung des Auslagenerstattungsformulars verwendet. Diese Daten sind
            nur fuer dich sichtbar — kein anderer Nutzer, kein Administrator kann sie einsehen.
          </div>
        </div>
        <div className="form-group">
          <label>Name und Sitz der Bank</label>
          <input
            value={form.bankname}
            onChange={set('bankname')}
            placeholder="z.B. Volksbank Weimar eG"
          />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>IBAN</label>
            <input
              value={form.iban}
              onChange={e => setForm(f => ({ ...f, iban: e.target.value.toUpperCase().replace(/\s/g, '') }))}
              placeholder="DE00000000000000000000"
              maxLength={22}
              style={{ fontFamily: 'var(--mono)', letterSpacing: 1 }}
            />
          </div>
          <div className="form-group">
            <label>BIC</label>
            <input
              value={form.bic}
              onChange={e => setForm(f => ({ ...f, bic: e.target.value.toUpperCase() }))}
              placeholder="XXXXXXXX"
              maxLength={11}
              style={{ fontFamily: 'var(--mono)', letterSpacing: 1 }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Speichern...' : 'Bankdaten speichern'}
          </button>
        </div>
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
            <button type="submit" className="btn btn-primary">
              Passwort aendern
            </button>
          </div>
        </form>
      </div>

      {avatarModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setAvatarModal(false)}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3>Profilbild</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setAvatarModal(false)}>✕</button>
            </div>

            {avatarMsg && <div className="alert alert-error" style={{ marginBottom: 12 }}>{avatarMsg}</div>}

            <label className="btn btn-secondary" style={{ cursor: avatarUploading ? 'not-allowed' : 'pointer', width: '100%', justifyContent: 'center', boxSizing: 'border-box', marginBottom: 20 }}>
              {avatarUploading ? 'Wird gespeichert...' : '↑ Eigenes Foto hochladen'}
              <input type="file" accept="image/*" onChange={handleFotoUpload} disabled={avatarUploading} style={{ display: 'none' }} />
            </label>

            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Oder Avatar waehlen
            </div>
            <AvatarPicker value={profile?.avatar_key} onChange={handleAvatarWahl} />
          </div>
        </div>
      )}
    </div>
  )
}
