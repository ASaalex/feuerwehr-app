import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const ALLE_ITEMS = [
  { to: '/kameraden', label: 'Kameraden', desc: 'Kameraden verwalten und freischalten', icon: '👥', color: '#E6F1FB', nurGbm: false },
  { to: '/nutzer-anlegen', label: 'Nutzer anlegen', desc: 'Neue Kameraden direkt anlegen', icon: '➕', color: '#D5F5E3', nurGbm: false },
  { to: '/wachen', label: 'Wachen', desc: 'Ortsfeuerwehren verwalten', icon: '🏠', color: '#FADBD8', nurGbm: true },
  { to: '/lehrgaenge', label: 'Lehrgaenge', desc: 'Lehrgaenge anlegen und verwalten', icon: '🎓', color: '#EEEDFE', nurGbm: true },
  { to: '/einstellungen', label: 'Einstellungen', desc: 'SMTP-Zugangsdaten & Mail-Drucker', icon: '⚙️', color: '#F0F0F0', nurGbm: true },
  { to: '/datenschutz', label: 'Datenschutz', desc: 'Datenschutzvereinbarung', icon: '🔒', color: '#FAEEDA', nurGbm: false },
]

export default function AdminPage() {
  const { profile } = useAuth()
  const isGemeinde = profile?.rolle === 'gemeindebrandmeister'
  const ADMIN_ITEMS = ALLE_ITEMS.filter(i => !i.nurGbm || isGemeinde)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Administration</h1>
          <p style={{ marginTop: 4 }}>Verwaltungsbereich</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {ADMIN_ITEMS.map(item => (
          <Link key={item.to} to={item.to} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '16px 18px', borderRadius: 12,
            background: item.color, textDecoration: 'none',
            border: '1.5px solid transparent',
            transition: 'all 150ms',
          }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            <span style={{ fontSize: 28, flexShrink: 0 }}>{item.icon}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--gray-800)', marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{item.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
