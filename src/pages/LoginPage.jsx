import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const [nutzername, setNutzername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const email = nutzername.toLowerCase().trim() + '@feuerwehr.intern'
    const { error } = await signIn(email, password)
    if (error) {
      setError('Nutzername oder Passwort falsch.')
      setLoading(false)
    } else {
      navigate('/')
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--gray-50)' }}>
      <div style={{
        width: 420, flexShrink: 0, background: 'var(--gray-800)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '48px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
          <div style={{ width: 40, height: 40, background: 'var(--red)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 2C12 2 7 8 7 13C7 15.76 9.24 18 12 18C14.76 18 17 15.76 17 13C17 8 12 2 12 2Z"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'white' }}>Feuerwehr</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Organisationstool</div>
          </div>
        </div>
        <h1 style={{ color: 'white', fontSize: 28, marginBottom: 12 }}>Willkommen</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, lineHeight: 1.6 }}>
          Melde dich mit deinem Nutzernamen an. Dein Nutzername wurde dir vom Wehrleiter mitgeteilt.
        </p>
        <div style={{ marginTop: 48, padding: '20px', background: 'rgba(255,255,255,0.06)', borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Startpasswort</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Feuerwehr123 — bitte nach erstem Login im Profil aendern</div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <h2 style={{ marginBottom: 8 }}>Anmelden</h2>
          <p style={{ marginBottom: 32, color: 'var(--gray-400)', fontSize: 14 }}>Gib deinen Nutzernamen und dein Passwort ein</p>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Nutzername</label>
              <input
                value={nutzername}
                onChange={e => setNutzername(e.target.value)}
                placeholder="z.B. noasaalfeld"
                required autoFocus autoComplete="username"
              />
            </div>
            <div className="form-group">
              <label>Passwort</label>
              <input
                type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Passwort" required autoComplete="current-password"
              />
            </div>
            <button type="submit" className="btn btn-primary btn-lg"
              style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={loading}>
              {loading
                ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></span> Laden...</>
                : 'Anmelden'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
