import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function EinstellungenPage() {
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [showPass, setShowPass] = useState(false)

  useEffect(() => { fetchEinstellungen() }, [])

  async function fetchEinstellungen() {
    const { data } = await supabase.from('system_einstellungen').select('schluessel, wert')
    const map = Object.fromEntries((data ?? []).map(e => [e.schluessel, e.wert]))
    setSmtpUser(map.smtp_user ?? '')
    setSmtpPass(map.smtp_pass ?? '')
    setLoading(false)
  }

  async function handleSpeichern(e) {
    e.preventDefault()
    setSaving(true)
    const updates = [
      { schluessel: 'smtp_user', wert: smtpUser },
      { schluessel: 'smtp_pass', wert: smtpPass },
    ]
    for (const u of updates) {
      await supabase
        .from('system_einstellungen')
        .upsert({ schluessel: u.schluessel, wert: u.wert, geaendert_am: new Date().toISOString() })
    }
    setMsg('Einstellungen gespeichert!')
    setTimeout(() => setMsg(''), 3000)
    setSaving(false)
  }

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Einstellungen</h1>
          <p style={{ marginTop: 4 }}>Systemeinstellungen verwalten</p>
        </div>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}

      <div className="card" style={{ maxWidth: 560 }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Mail-Drucker (Gmail)</h3>
        <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 16, lineHeight: 1.5 }}>
          Dokumente werden per E-Mail an die Drucker-Adresse der jeweiligen Wache gesendet.
        </p>

        {/* Gmail Hinweis */}
        <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, color: '#3730A3', marginBottom: 6 }}>Gmail App-Passwort einrichten</div>
          <ol style={{ paddingLeft: 18, color: '#4338CA', margin: 0 }}>
            <li>Gmail-Konto anlegen (z.B. <em>feuerwehr.grammetal@gmail.com</em>)</li>
            <li>Im Google-Konto: <strong>Sicherheit → 2-Faktor-Authentifizierung</strong> aktivieren</li>
            <li>Dann: <strong>Sicherheit → App-Passwörter</strong> → neues App-Passwort erstellen</li>
            <li>Den 16-stelligen Code hier als Passwort eintragen</li>
          </ol>
        </div>

        <form onSubmit={handleSpeichern}>
          <div className="form-group">
            <label>Gmail-Adresse</label>
            <input
              type="email"
              value={smtpUser}
              onChange={e => setSmtpUser(e.target.value)}
              placeholder="feuerwehr.grammetal@gmail.com"
              required
            />
          </div>
          <div className="form-group">
            <label>App-Passwort</label>
            <div style={{ position: 'relative', display: 'flex' }}>
              <input
                type={showPass ? 'text' : 'password'}
                value={smtpPass}
                onChange={e => setSmtpPass(e.target.value)}
                placeholder="xxxx xxxx xxxx xxxx"
                required
                style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 13, paddingRight: 80 }}
              />
              <button
                type="button"
                onClick={() => setShowPass(s => !s)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: 12, padding: 4 }}
              >
                {showPass ? 'Verbergen' : 'Zeigen'}
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
              Kein normales Gmail-Passwort — nur das 16-stellige App-Passwort aus den Google-Kontoeinstellungen.
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Speichern...' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
