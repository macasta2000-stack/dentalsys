import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { toast } from './contexts/ToastContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PacientesPage from './pages/PacientesPage'
import PacienteDetailPage from './pages/PacienteDetailPage'
import AgendaPage from './pages/AgendaPage'
import CajaPage from './pages/CajaPage'
import ConfigPage from './pages/ConfigPage'
import InsumosPage from './pages/InsumosPage'
import ReportesPage from './pages/ReportesPage'
import ImportPage from './pages/ImportPage'
import CRMPage from './pages/CRMPage'
import AdminPage from './pages/AdminPage'
import SuscripcionPage from './pages/SuscripcionPage'
import NotFoundPage from './pages/NotFoundPage'
import OnboardingPage from './pages/OnboardingPage'
import PerfilPage from './pages/PerfilPage'
import GiftcardsPage from './pages/GiftcardsPage'
import GastosPage from './pages/GastosPage'
import BookingPage from './pages/BookingPage'
import PWAInstallPrompt from './components/PWAInstallPrompt'
import OfflineIndicator from './components/OfflineIndicator'
import { ErrorBoundary } from './components/ErrorBoundary'
import { startSyncManager } from './lib/syncManager'
import { api } from './lib/api'

function PrivateRoute({ children }) {
  const { user, loading, configuracion } = useAuth()
  const location = useLocation()
  if (loading) return (
    <div className="app-loader">
      <div className="app-loader-icon">🏥</div>
      <p>Clingest</p>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (configuracion && configuracion.onboarding_completado === 0 && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }
  return children
}

// Ruta exclusiva para superadmin
function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="app-loader">
      <div className="app-loader-icon">🏥</div>
      <p>Clingest</p>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (user.rol !== 'superadmin') {
    toast('No tenés acceso a esta sección', 'error')
    return <Navigate to="/" replace />
  }
  return children
}

// Ruta solo para dueños/admin (no colaboradores básicos)
const OWNER_ROLES = new Set(['tenant', 'superadmin', 'admin'])
function OwnerRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="app-loader">
      <div className="app-loader-icon">🏥</div>
      <p>Clingest</p>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (!OWNER_ROLES.has(user.rol)) {
    toast('No tenés acceso a esta sección', 'error')
    return <Navigate to="/" replace />
  }
  return children
}

// Ruta para caja: owners + recepcionista
const CAJA_ROLES = new Set(['tenant', 'superadmin', 'admin', 'recepcionista'])
function CajaRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="app-loader">
      <div className="app-loader-icon">🏥</div>
      <p>Clingest</p>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (!CAJA_ROLES.has(user.rol)) {
    toast('No tenés acceso a esta sección', 'error')
    return <Navigate to="/" replace />
  }
  return children
}

export default function App() {
  const { user, loading } = useAuth()

  // Start the offline sync engine once on mount
  useEffect(() => {
    startSyncManager(api)
  }, [])

  // Prevent drag-close: if mousedown started inside the modal content and the
  // pointer was released on the overlay, the browser fires a synthetic click on
  // the overlay (nearest common ancestor). We block that click by tracking
  // whether mousedown itself landed on the overlay.
  // stopPropagation() in capture phase prevents React's #root handler from
  // ever seeing the event — stopImmediatePropagation() was wrong because it
  // only blocked other window-level listeners, not React's #root listener.
  useEffect(() => {
    let _mdOnOverlay = false
    const onMD = (e) => { _mdOnOverlay = !!e.target.classList?.contains('modal-overlay') }
    const onCK = (e) => {
      if (e.target.classList?.contains('modal-overlay') && !_mdOnOverlay) {
        e.stopPropagation()
      }
    }
    window.addEventListener('mousedown', onMD, true)
    window.addEventListener('click', onCK, true)
    return () => {
      window.removeEventListener('mousedown', onMD, true)
      window.removeEventListener('click', onCK, true)
    }
  }, [])

  if (loading) return (
    <div className="app-loader">
      <div className="app-loader-icon">🏥</div>
      <p>Clingest</p>
    </div>
  )

  return (
    <>
      <OfflineIndicator />
      <ErrorBoundary>
        <Routes>
          <Route path="/onboarding" element={<PrivateRoute><OnboardingPage /></PrivateRoute>} />
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<DashboardPage />} />
            <Route path="pacientes" element={<PacientesPage />} />
            <Route path="pacientes/:id" element={<PacienteDetailPage />} />
            <Route path="agenda" element={<AgendaPage />} />
            <Route path="caja" element={<CajaRoute><CajaPage /></CajaRoute>} />
            <Route path="insumos" element={<OwnerRoute><InsumosPage /></OwnerRoute>} />
            <Route path="crm" element={<OwnerRoute><CRMPage /></OwnerRoute>} />
            <Route path="reportes" element={<OwnerRoute><ReportesPage /></OwnerRoute>} />
            <Route path="importar" element={<OwnerRoute><ImportPage /></OwnerRoute>} />
            <Route path="configuracion" element={<OwnerRoute><ConfigPage /></OwnerRoute>} />
            <Route path="suscripcion" element={<OwnerRoute><SuscripcionPage /></OwnerRoute>} />
            <Route path="admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
            <Route path="perfil" element={<PrivateRoute><PerfilPage /></PrivateRoute>} />
            <Route path="giftcards" element={<PrivateRoute><GiftcardsPage /></PrivateRoute>} />
            <Route path="gastos" element={<OwnerRoute><GastosPage /></OwnerRoute>} />
          <Route path="dashboard" element={<Navigate to="/" replace />} />
          <Route path="importar-exportar" element={<Navigate to="/importar" replace />} />
          </Route>
          {/* Booking publico — sin auth */}
          <Route path="book/:slug" element={<BookingPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </ErrorBoundary>
      <PWAInstallPrompt />
    </>
  )
}
