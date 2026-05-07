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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--gray-800)' }}>

      {/* Logo oben */}
      <div style={{ padding: '40px 24px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 56, height: 56, background: 'var(--red)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
            <path d="M12 2C12 2 7 8 7 13C7 15.76 9.24 18 12 18C14.76 18 17 15.76 17 13C17 8 12 2 12 2Z"/>
            <path d="M12 10C12 10 9 13 9 15C9 16.66 10.34 18 12 18C13.66 18 15 16.66 15 15C15 13 12 10 12 10Z" fill="rgba(255,255,255,0.5)"/>
          </svg>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'white' }}>Feuerwehr</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Organisationstool</div>
        </div>
      </div>

      {/* Login Card */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '0 16px 32px' }}>
        <div style={{
          width: '100%', maxWidth: 400,
          background: 'white', borderRadius: 16,
          padding: '28px 24px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}>
          <h2 style={{ marginBottom: 6, fontSize: 20 }}>Anmelden</h2>
          <p style={{ marginBottom: 24, color: 'var(--gray-400)', fontSize: 14 }}>
            Gib deinen Nutzernamen und Passwort ein
          </p>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Nutzername</label>
              <input
                value={nutzername}
                onChange={e => setNutzername(e.target.value)}
                placeholder="Nutzername"
                required autoFocus autoComplete="username"
                style={{ fontSize: 16 }}
              />
            </div>
            <div className="form-group">
              <label>Passwort</label>
              <input
                type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Passwort"
                required autoComplete="current-password"
                style={{ fontSize: 16 }}
              />
            </div>
            <button type="submit" className="btn btn-primary btn-lg"
              style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={loading}>
              {loading
                ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></span>&nbsp;Laden...</>
                : 'Anmelden'}
            </button>
          </form>

          <div style={{ marginTop: 20, padding: '14px 16px', background: 'var(--gray-50)', borderRadius: 10, border: '1px solid var(--gray-100)' }}>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 2 }}>Startpasswort</div>
            <div style={{ fontSize: 13, color: 'var(--gray-600)' }}>
              <code style={{ fontFamily: 'var(--mono)', background: 'var(--gray-100)', padding: '1px 6px', borderRadius: 4 }}>Feuerwehr123</code>
              &nbsp;— bitte nach erstem Login im Profil aendern
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
