import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import KameradenPage from './pages/KameradenPage'
import DokumentePage from './pages/DokumentePage'
import PruefungenPage from './pages/PruefungenPage'
import AufgabenPage from './pages/AufgabenPage'
import ProfilPage from './pages/ProfilPage'
import NutzerAnlegenPage from './pages/NutzerAnlegenPage'
import WachenPage from './pages/WachenPage'
import LehrgaengePage from './pages/LehrgaengePage'
import AusbildungPage from './pages/AusbildungPage'
import AusbildungChatPage from './pages/AusbildungChatPage'
import SzenarienAdminPage from './pages/SzenarienAdminPage'
import RegelwerkeAdminPage from './pages/RegelwerkeAdminPage'
import AdminPage from './pages/AdminPage'
import DatenschutzPage from './pages/DatenschutzPage'
import DatenschutzPublicPage from './pages/DatenschutzPublicPage'
import ImpressumPage from './pages/ImpressumPage'
import EinstellungenPage from './pages/EinstellungenPage'
import EinsatzberichtPage from './pages/EinsatzberichtPage'
import EinsatzberichtFormular from './pages/EinsatzberichtFormular'
import VersammlungenPage from './pages/VersammlungenPage'
import GeraetewartPage from './pages/GeraetewartPage'
import PruefungsartenPage from './pages/PruefungsartenPage'
import LehrgangAdminPage from './pages/LehrgangAdminPage'
import LehrgangUebersichtPage from './pages/LehrgangUebersichtPage'
import LehrgangLernPage from './pages/LehrgangLernPage'
import './index.css'

function GbmRoute({ children }) {
  const { profile, loading } = useAuth()
  if (loading) return <div className="loading-page"><div className="spinner"></div></div>
  if (profile?.rolle !== 'gemeindebrandmeister') return <Navigate to="/" replace />
  return children
}

function AufgabenRoute({ children }) {
  const { aufgabenAktiv, loading } = useAuth()
  if (loading) return <div className="loading-page"><div className="spinner"></div></div>
  if (!aufgabenAktiv) return <Navigate to="/" replace />
  return children
}

function GeraetewartRoute({ children }) {
  const { profile, loading } = useAuth()
  if (loading) return <div className="loading-page"><div className="spinner"></div></div>
  if (!profile?.geraetewart) return <Navigate to="/" replace />
  return children
}

function EinsatzberichtRoute({ children }) {
  const { profile, loading } = useAuth()
  if (loading) return <div className="loading-page"><div className="spinner"></div></div>
  const erlaubt = ['wehrleiter', 'gemeindebrandmeister', 'tablet']
  if (!erlaubt.includes(profile?.rolle)) return <Navigate to="/" replace />
  return children
}

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, profile, loading, signOut } = useAuth()

  if (loading) return (
    <div className="loading-page">
      <div className="spinner"></div>
      <span>Laden...</span>
    </div>
  )

  if (!user) return <Navigate to="/login" replace />

  if (profile?.status === 'ausstehend') return (
    <div className="loading-page">
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <h2 style={{ marginBottom: 12 }}>Zugang ausstehend</h2>
        <p>Dein Account wurde angelegt. Der Wehrleiter muss deinen Zugang noch freischalten.</p>
        <p style={{ marginTop: 16, fontSize: 13 }}>Du wirst per E-Mail benachrichtigt.</p>
        <button
          onClick={() => signOut()}
          style={{ marginTop: 24, padding: '10px 24px', borderRadius: 8, border: '1px solid #ccc', background: 'white', cursor: 'pointer', fontSize: 14, color: '#555' }}
        >
          Abmelden
        </button>
      </div>
    </div>
  )

  if (adminOnly && profile?.rolle !== 'wehrleiter' && profile?.rolle !== 'gemeindebrandmeister') {
    return <Navigate to="/" replace />
  }

  return children
}

function AppRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/registrieren" element={user ? <Navigate to="/" replace /> : <RegisterPage />} />
      <Route path="/impressum" element={<ImpressumPage />} />
      <Route path="/datenschutz-public" element={<DatenschutzPublicPage />} />

      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="kameraden" element={<ProtectedRoute adminOnly><KameradenPage /></ProtectedRoute>} />
        <Route path="nutzer-anlegen" element={<ProtectedRoute adminOnly><NutzerAnlegenPage /></ProtectedRoute>} />
        <Route path="wachen" element={<GbmRoute><WachenPage /></GbmRoute>} />
        <Route path="lehrgaenge" element={<GbmRoute><LehrgaengePage /></GbmRoute>} />
        <Route path="einstellungen" element={<GbmRoute><EinstellungenPage /></GbmRoute>} />
        <Route path="admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
        <Route path="datenschutz" element={<ProtectedRoute><DatenschutzPage /></ProtectedRoute>} />
        <Route path="dokumente" element={<DokumentePage />} />
        <Route path="versammlungen" element={<ProtectedRoute><VersammlungenPage /></ProtectedRoute>} />
        <Route path="ausbildung" element={<ProtectedRoute><AusbildungPage /></ProtectedRoute>} />
        <Route path="ausbildung/chat" element={<ProtectedRoute><AusbildungChatPage /></ProtectedRoute>} />
        <Route path="ausbildung/lehrgang" element={<ProtectedRoute><LehrgangUebersichtPage /></ProtectedRoute>} />
        <Route path="ausbildung/lehrgang/:id" element={<ProtectedRoute><LehrgangLernPage /></ProtectedRoute>} />
        <Route path="szenarien" element={<ProtectedRoute adminOnly><SzenarienAdminPage /></ProtectedRoute>} />
        <Route path="regelwerke" element={<ProtectedRoute adminOnly><RegelwerkeAdminPage /></ProtectedRoute>} />
        <Route path="lehrgang-admin" element={<ProtectedRoute adminOnly><LehrgangAdminPage /></ProtectedRoute>} />
        <Route path="pruefungen" element={<PruefungenPage />} />
        <Route path="aufgaben" element={
          <AufgabenRoute><AufgabenPage /></AufgabenRoute>
        } />
        <Route path="profil" element={<ProfilPage />} />
        <Route path="einsatzbericht" element={<EinsatzberichtRoute><EinsatzberichtPage /></EinsatzberichtRoute>} />
        <Route path="einsatzbericht/:id" element={<EinsatzberichtRoute><EinsatzberichtFormular /></EinsatzberichtRoute>} />
        <Route path="geraetewart" element={<GeraetewartRoute><GeraetewartPage /></GeraetewartRoute>} />
        <Route path="pruefungsarten" element={<GbmRoute><PruefungsartenPage /></GbmRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
