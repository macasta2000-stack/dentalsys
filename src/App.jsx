import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PacientesPage from './pages/PacientesPage'
import PacienteDetailPage from './pages/PacienteDetailPage'
import AgendaPage from './pages/AgendaPage'
import CajaPage from './pages/CajaPage'
import ConfigPage from './pages/ConfigPage'
import InsumosPage from './pages/InsumosPage'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="app-loader">
      <div className="loader-tooth">🦷</div>
      <p>DentalSys</p>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return (
    <div className="app-loader">
      <div className="loader-tooth">🦷</div>
      <p>DentalSys</p>
    </div>
  )

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="pacientes" element={<PacientesPage />} />
        <Route path="pacientes/:id" element={<PacienteDetailPage />} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="caja" element={<CajaPage />} />
        <Route path="insumos" element={<InsumosPage />} />
        <Route path="configuracion" element={<ConfigPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
