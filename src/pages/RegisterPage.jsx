import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function RegisterPage() {
  const [form, setForm] = useState({ vorname: '', nachname: '', email: '', password: '', password2: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const { signUp } = useAuth()

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (form.password !== form.password2) return setError('Passwörter stimmen nicht überein.')
    if (form.password.length < 6) return setError('Passwort muss mindestens 6 Zeichen haben.')

    setLoading(true)
    const { error } = await signUp(form.email, form.password)
    if (error) {
      setError('Registrierung fehlgeschlagen: ' + error.message)
      setLoading(false)
      return
    }

    // Update profile with name
    // Profile is auto-created via trigger; we update name after short wait
    setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('profiles').update({
          vorname: form.vorname,
          nachname: form.nachname,
        }).eq('id', user.id)
      }
    }, 1000)

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gray-50)' }}>
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 40 }}>
          <div style={{ width: 56, height: 56, background: '#D5F5E3', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1E8449" strokeWidth="2"><polyline points="20,6 9,17 4,12"/></svg>
          </div>
          <h2 style={{ marginBottom: 12 }}>Registrierung erfolgreich!</h2>
          <p style={{ color: 'var(--gray-500)', lineHeight: 1.7 }}>
            Dein Konto wurde angelegt. Der Wehrleiter muss deinen Zugang noch freischalten. Du wirst benachrichtigt sobald dein Konto aktiv ist.
          </p>
          <Link to="/login" className="btn btn-primary" style={{ marginTop: 24, display: 'inline-flex' }}>
            Zur Anmeldung
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gray-50)', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, background: 'var(--red)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 2C12 2 7 8 7 13C7 15.76 9.24 18 12 18C14.76 18 17 15.76 17 13C17 8 12 2 12 2Z"/></svg>
            </div>
            <span style={{ fontWeight: 600, fontSize: 16 }}>Feuerwehr Organisationstool</span>
          </div>
          <h2>Konto erstellen</h2>
          <p style={{ color: 'var(--gray-400)', fontSize: 14, marginTop: 6 }}>
            Dein Konto wird nach der Registrierung vom Wehrleiter freigeschaltet.
          </p>
        </div>

        <div className="card">
          {error && <div className="alert alert-error">{error}</div>}

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
            <div className="form-group">
              <label>E-Mail-Adresse</label>
              <input type="email" value={form.email} onChange={set('email')} placeholder="max@feuerwehr.de" required />
            </div>
            <div className="form-group">
              <label>Passwort</label>
              <input type="password" value={form.password} onChange={set('password')} placeholder="Mindestens 6 Zeichen" required />
            </div>
            <div className="form-group">
              <label>Passwort bestätigen</label>
              <input type="password" value={form.password2} onChange={set('password2')} placeholder="••••••••" required />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} disabled={loading}>
              {loading ? 'Registrieren...' : 'Konto erstellen'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14, color: 'var(--gray-400)' }}>
          Bereits ein Konto? <Link to="/login">Anmelden</Link>
        </p>
      </div>
    </div>
  )
}
