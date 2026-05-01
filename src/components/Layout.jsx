import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV = [
  { to: '/', label: 'Dashboard', exact: true, icon: IconDashboard },
  { to: '/dokumente', label: 'Dokumente', icon: IconDokumente },
  { to: '/pruefungen', label: 'Pruefungen', icon: IconPruefungen },
  { to: '/aufgaben', label: 'Aufgaben', icon: IconAufgaben },
]

const NAV_ADMIN = [
  { to: '/kameraden', label: 'Kameraden', icon: IconKameraden },
  { to: '/nutzer-anlegen', label: 'Nutzer anlegen', icon: IconNutzerAnlegen },
  { to: '/wachen', label: 'Wachen', icon: IconWachen },
  { to: '/lehrgaenge', label: 'Lehrgaenge', icon: IconLehrgang },
]

export default function Layout() {
  const { profile, signOut, isAdmin } = useAuth()
  const navigate = useNavigate()
  const showAdmin = profile?.rolle === 'wehrleiter' || profile?.rolle === 'gemeindebrandmeister'
  const { aufgabenAktiv } = useAuth()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const initials = profile
    ? `${profile.vorname?.[0] ?? ''}${profile.nachname?.[0] ?? ''}`.toUpperCase() || '?'
    : '?'

  const allNav = [...NAV.filter(n => n.to !== '/aufgaben' || aufgabenAktiv), ...(showAdmin ? NAV_ADMIN : [])]

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Desktop Sidebar */}
      <aside className="sidebar-desktop" style={{
        width: 220, background: 'var(--gray-800)',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        position: 'sticky', top: 0, height: '100vh',
      }}>
        {/* Logo */}
        <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'var(--red)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FlammenIcon />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'white', lineHeight: 1.2 }}>Feuerwehr</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.2 }}>Organisationstool</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '8px 10px 4px' }}>Menu</div>
          {NAV.filter(n => n.to !== '/aufgaben' || aufgabenAktiv).map(item => (
            <NavLink key={item.to} to={item.to} end={item.exact}
              style={({ isActive }) => navStyle(isActive)}>
              <item.icon />{item.label}
            </NavLink>
          ))}

          {showAdmin && (
            <>
              <div style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '16px 10px 4px' }}>Administration</div>
              {NAV_ADMIN.map(item => (
                <NavLink key={item.to} to={item.to} style={({ isActive }) => navStyle(isActive)}>
                  <item.icon />{item.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* User */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <NavLink to="/datenschutz" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px', borderRadius: 6, textDecoration: 'none', marginBottom: 2 }}>
            <svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.35)' strokeWidth='2'><path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'/></svg>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Datenschutz</span>
          </NavLink>
          <NavLink to="/profil" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 6, textDecoration: 'none', marginBottom: 4 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--red)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{initials}</div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile?.vorname} {profile?.nachname}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{rolleLabel(profile?.rolle)}</div>
            </div>
          </NavLink>
          <button onClick={handleSignOut} style={{
            width: '100%', padding: '8px 10px', borderRadius: 6,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
          >
            <IconAbmelden /> Abmelden
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="mobile-header" style={{
        display: 'none', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        background: 'var(--gray-800)', padding: '12px 16px',
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, background: 'var(--red)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FlammenIcon />
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>Feuerwehr</span>
        </div>
        <NavLink to="/profil" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--red)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>{initials}</div>
        </NavLink>
      </div>

      {/* Main Content */}
      <main className="main-content" style={{ flex: 1, padding: '32px 36px', maxWidth: '100%', overflowX: 'hidden' }}>
        <Outlet />
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="mobile-bottom-nav" style={{
        display: 'none', position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: 'var(--gray-800)', borderTop: '1px solid rgba(255,255,255,0.08)',
        padding: '6px 0 env(safe-area-inset-bottom)',
        flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
      }}>
        {NAV.map(item => (
          <NavLink key={item.to} to={item.to} end={item.exact}
            style={({ isActive }) => ({
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '5px 8px', borderRadius: 8, textDecoration: 'none', minWidth: 44, flex: 1,
              color: isActive ? 'white' : 'rgba(255,255,255,0.45)',
              background: isActive ? 'rgba(192,57,43,0.3)' : 'transparent',
            })}>
            <item.icon />
            <span style={{ fontSize: 9, fontWeight: 500 }}>{item.label}</span>
          </NavLink>
        ))}
        {showAdmin && (
          <NavLink to="/admin"
            style={({ isActive }) => ({
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '5px 8px', borderRadius: 8, textDecoration: 'none', minWidth: 44, flex: 1,
              color: isActive ? 'white' : 'rgba(255,255,255,0.45)',
              background: isActive ? 'rgba(192,57,43,0.3)' : 'transparent',
            })}>
            <IconKameraden />
            <span style={{ fontSize: 9, fontWeight: 500 }}>Admin</span>
          </NavLink>
        )}
        <button onClick={handleSignOut} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          padding: '5px 8px', background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.45)', minWidth: 44, flex: 1,
        }}>
          <IconAbmelden />
          <span style={{ fontSize: 9, fontWeight: 500 }}>Logout</span>
        </button>
      </nav>

      <style>{`
        @media (max-width: 768px) {
          .sidebar-desktop { display: none !important; }
          .mobile-header { display: flex !important; }
          .mobile-bottom-nav { display: flex !important; }
          .main-content {
            padding: 72px 12px 84px !important;
            min-width: 0;
            width: 100%;
            box-sizing: border-box;
          }
        }
        @media (max-width: 360px) {
          .mobile-header { padding: 10px 12px !important; }
          .main-content { padding: 68px 10px 80px !important; }
        }
      `}</style>
    </div>
  )
}

function navStyle(isActive) {
  return {
    display: 'flex', alignItems: 'center', gap: 9,
    padding: '9px 10px', borderRadius: 6, marginBottom: 2,
    fontSize: 14, fontWeight: isActive ? 500 : 400, textDecoration: 'none',
    background: isActive ? 'rgba(192,57,43,0.25)' : 'transparent',
    color: isActive ? 'white' : 'rgba(255,255,255,0.55)',
    transition: 'all 150ms',
  }
}

function rolleLabel(rolle) {
  const map = { gemeindebrandmeister: 'Gemeindebrandmeister', wehrleiter: 'Wehrleiter', gruppenfuehrer: 'Gruppenfuehrer', ausbilder: 'Ausbilder', kamerad: 'Kamerad' }
  return map[rolle] ?? rolle
}

function FlammenIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2C12 2 7 8 7 13C7 15.76 9.24 18 12 18C14.76 18 17 15.76 17 13C17 8 12 2 12 2Z" fill="white" opacity="0.9"/><path d="M12 10C12 10 9 13 9 15C9 16.66 10.34 18 12 18C13.66 18 15 16.66 15 15C15 13 12 10 12 10Z" fill="rgba(255,255,255,0.5)"/></svg>
}
function IconDashboard() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> }
function IconDokumente() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> }
function IconPruefungen() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> }
function IconAufgaben() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> }
function IconKameraden() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> }
function IconLehrgang() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
}
function IconWachen() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
}
function IconNutzerAnlegen() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg> }
function IconAbmelden() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> }
