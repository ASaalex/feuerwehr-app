import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const ROLLEN = ['wehrleiter', 'gruppenfuehrer', 'ausbilder', 'kamerad']
const ROLLEN_LABEL = {
  gemeindebrandmeister: 'Gemeindebrandmeister',
  wehrleiter: 'Wehrleiter',
  gruppenfuehrer: 'Gruppenfuehrer',
  ausbilder: 'Ausbilder',
  kamerad: 'Kamerad'
}
const STARTPASSWORT = 'Feuerwehr123'

function genNutzername(kuerzel, vorname, nachname) {
  const v = vorname.trim().toLowerCase().replace(/[^a-z]/g, '')
  const n = nachname.trim().toLowerCase().replace(/[^a-z]/g, '')
  const k = (kuerzel || 'fw').toLowerCase()
  return k + (v[0] || '') + n
}

export default function NutzerAnlegenPage() {
  const { profile: myProfile } = useAuth()
  const [wehren, setWehren] = useState([])
  const [angelegte, setAngelegte] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const isGemeinde = myProfile?.rolle === 'gemeindebrandmeister'

  const [form, setForm] = useState({
    vorname: '',
    nachname: '',
    nutzername: '',
    wehr_id: myProfile?.wehr_id ?? '',
    rolle: 'kamerad',
    telefon: '',
    geburtsdatum: '',
    eintrittsdatum: new Date().toISOString().slice(0, 10),
  })

  useEffect(() => {
    supabase.from('wehren').select('id,name,kuerzel').order('name').then(({ data }) => {
      setWehren(data ?? [])
      if (!isGemeinde && myProfile?.wehr_id) {
        setForm(f => ({ ...f, wehr_id: myProfile.wehr_id }))
      }
    })
  }, [])

  useEffect(() => {
    if (form.vorname || form.nachname) {
      const wehr = wehren.find(w => w.id === form.wehr_id)
      const vorschlag = genNutzername(wehr?.kuerzel || 'fw', form.vorname, form.nachname)
      setForm(f => ({ ...f, nutzername: vorschlag }))
    }
  }, [form.vorname, form.nachname, form.wehr_id, wehren])

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setMsg('')

    if (!form.nutzername) return setError('Nutzername ist erforderlich.')
    if (!form.wehr_id) return setError('Bitte eine Wache auswaehlen.')

    setLoading(true)

    const email = form.nutzername.toLowerCase().trim() + '@feuerwehr.intern'

    // Nutzer in Supabase Auth anlegen via Admin API
    const { data, error: authError } = await supabase.functions.invoke('create-user', {
      body: { email, password: STARTPASSWORT }
    }).catch(() => ({ data: null, error: { message: 'Funktion nicht verfuegbar' } }))

    // Fallback: direkt via REST mit service role (nur wenn Edge Function nicht verfuegbar)
    // Stattdessen: normaler signUp + sofort bestaetigen via SQL
    if (authError) {
      // Versuche normalen Signup
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: STARTPASSWORT,
        options: { emailRedirectTo: undefined }
      })

      if (signUpError) {
        setError('Fehler: ' + signUpError.message)
        setLoading(false)
        return
      }

      const userId = signUpData.user?.id
      if (userId) {
        // Profil aktualisieren
        await supabase.from('profiles').update({
          vorname: form.vorname,
          nachname: form.nachname,
          nutzername: form.nutzername.toLowerCase(),
          wehr_id: form.wehr_id,
          rolle: form.rolle,
          status: 'aktiv',
          telefon: form.telefon || null,
          geburtsdatum: form.geburtsdatum || null,
          eintrittsdatum: form.eintrittsdatum || null,
        }).eq('id', userId)

        setAngelegte(a => [...a, {
          nutzername: form.nutzername.toLowerCase(),
          name: form.vorname + ' ' + form.nachname,
          passwort: STARTPASSWORT,
          rolle: form.rolle,
        }])

        setMsg('Nutzer ' + form.nutzername + ' wurde angelegt!')
        setForm(f => ({
          vorname: '', nachname: '', nutzername: '',
          wehr_id: f.wehr_id, rolle: f.rolle,
          telefon: '', geburtsdatum: '',
          eintrittsdatum: new Date().toISOString().slice(0, 10),
        }))
      }
    }

    setLoading(false)
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <div className="page-header">
        <div>
          <h1>Nutzer anlegen</h1>
          <p style={{ marginTop: 4 }}>Kameraden direkt ohne Registrierung anlegen</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          <strong>Startpasswort:</strong> <code style={{ fontFamily: 'var(--mono)', background: 'rgba(0,0,0,0.06)', padding: '1px 6px', borderRadius: 4 }}>{STARTPASSWORT}</code>
          &nbsp;— Kamerad sollte es nach erstem Login aendern
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {msg && <div className="alert alert-success">{msg}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Vorname</label>
              <input value={form.vorname} onChange={set('vorname')} placeholder="Max" required />
            </div>
            <div className="form-group">
              <label>Nachname</label>
              <input value={form.nachname} onChange={set('nachname')} placeholder="Mustermann" required />
            </div>
          </div>

          {isGemeinde && (
            <div className="form-group">
              <label>Wache</label>
              <select value={form.wehr_id} onChange={set('wehr_id')} required>
                <option value="">— Bitte auswaehlen</option>
                {wehren.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          )}

          <div className="form-group">
            <label>Nutzername</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={form.nutzername}
                onChange={set('nutzername')}
                placeholder="z.B. noasaalfeld"
                required
                style={{ fontFamily: 'var(--mono)' }}
              />
              <button type="button" className="btn btn-secondary" style={{ flexShrink: 0 }}
                onClick={() => {
                  const wehr = wehren.find(w => w.id === form.wehr_id)
                  setForm(f => ({ ...f, nutzername: genNutzername(wehr?.kuerzel || 'fw', f.vorname, f.nachname) }))
                }}>
                Neu generieren
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
              Login: <code style={{ fontFamily: 'var(--mono)' }}>{form.nutzername || 'nutzername'}</code> mit Passwort <code style={{ fontFamily: 'var(--mono)' }}>{STARTPASSWORT}</code>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Rolle</label>
              <select value={form.rolle} onChange={set('rolle')}>
                {ROLLEN.map(r => <option key={r} value={r}>{ROLLEN_LABEL[r]}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Telefon (optional)</label>
              <input value={form.telefon} onChange={set('telefon')} placeholder="0151 12345678" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Geburtsdatum (optional)</label>
              <input type="date" value={form.geburtsdatum} onChange={set('geburtsdatum')} />
            </div>
            <div className="form-group">
              <label>Eintrittsdatum</label>
              <input type="date" value={form.eintrittsdatum} onChange={set('eintrittsdatum')} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
              {loading ? 'Anlegen...' : 'Nutzer anlegen'}
            </button>
          </div>
        </form>
      </div>

      {/* Angelegte Nutzer in dieser Sitzung */}
      {angelegte.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>In dieser Sitzung angelegt</h3>
          <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 12 }}>
            Bitte Zugangsdaten notieren und an Kameraden weitergeben.
          </p>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Nutzername</th>
                <th>Startpasswort</th>
                <th>Rolle</th>
              </tr>
            </thead>
            <tbody>
              {angelegte.map((n, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{n.name}</td>
                  <td><code style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{n.nutzername}</code></td>
                  <td><code style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{n.passwort}</code></td>
                  <td><span className="badge badge-blue">{ROLLEN_LABEL[n.rolle]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
