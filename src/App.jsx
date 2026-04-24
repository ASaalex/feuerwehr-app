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
import './index.css'

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, profile, loading } = useAuth()

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

      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="kameraden" element={<ProtectedRoute adminOnly><KameradenPage /></ProtectedRoute>} />
        <Route path="nutzer-anlegen" element={<ProtectedRoute adminOnly><NutzerAnlegenPage /></ProtectedRoute>} />
        <Route path="wachen" element={<ProtectedRoute adminOnly><WachenPage /></ProtectedRoute>} />
        <Route path="dokumente" element={<DokumentePage />} />
        <Route path="pruefungen" element={<PruefungenPage />} />
        <Route path="aufgaben" element={<AufgabenPage />} />
        <Route path="profil" element={<ProfilPage />} />
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
