import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useState } from 'react'

const NAV = [
  { to: '/', icon: '▦', label: 'Dashboard', exact: true },
  { to: '/pacientes', icon: '👤', label: 'Pacientes' },
  { to: '/agenda', icon: '📅', label: 'Agenda' },
  { to: '/caja', icon: '💵', label: 'Caja' },
  { to: '/insumos', icon: '📦', label: 'Insumos' },
  { to: '/configuracion', icon: '⚙️', label: 'Configuración' },
]

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/pacientes': 'Pacientes',
  '/agenda': 'Agenda',
  '/caja': 'Caja',
  '/insumos': 'Insumos',
  '/configuracion': 'Configuración',
}

export default function Layout() {
  const { user, configuracion, logout } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const title = PAGE_TITLES[location.pathname]
    ?? (location.pathname.startsWith('/pacientes/') ? 'Ficha del Paciente' : 'DentalSys')

  return (
    <div className="layout">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 99 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-logo">
          <span className="logo-icon">🦷</span>
          <div>
            <div className="logo-text">DentalSys</div>
            <div className="logo-sub">GESTIÓN ODONTOLÓGICA</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Menú</div>
          {NAV.map(({ to, icon, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="icon">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-consultorio">
            <div className="sc-name">{configuracion?.nombre_consultorio ?? 'Consultorio'}</div>
            <div className="sc-user">{user?.email}</div>
          </div>
          <button className="btn-logout" onClick={logout}>
            <span>↩</span> Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="btn btn-ghost btn-sm sidebar-toggle"
              onClick={() => setSidebarOpen(true)}
              aria-label="Menú"
            >☰</button>
            <span className="topbar-title">{title}</span>
          </div>
          <div className="topbar-right">
            <span className="text-sm text-muted">
              {configuracion?.nombre_profesional ?? user?.nombre ?? ''}
            </span>
          </div>
        </header>

        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
