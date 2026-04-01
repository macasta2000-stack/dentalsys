import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { usePlanFeatures } from '../hooks/usePlanFeatures'
import { useRoleAccess } from '../hooks/useRoleAccess'
import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../lib/api'
import { format } from 'date-fns'
import TrialBanner from './TrialBanner'
import OfflineIndicator from './OfflineIndicator'
import { AICreditBadge } from './AIAssistant'
import { startSyncManager } from '../lib/syncManager'

// feature: requiere esa feature del plan | module: clave para permisos por rol
const NAV = [
  { to: '/', icon: '▦', label: 'Dashboard', exact: true, feature: null, module: null },
  { to: '/pacientes', icon: '👤', label: 'Pacientes', feature: null, module: 'pacientes' },
  { to: '/agenda', icon: '📅', label: 'Agenda', feature: null, module: 'agenda' },
  { to: '/caja', icon: '💵', label: 'Caja', feature: null, module: 'caja' },
  { to: '/crm', icon: '💬', label: 'CRM', feature: 'crm', module: 'crm' },
  { to: '/reportes', icon: '📊', label: 'Reportes', feature: null, module: 'reportes' },
  { to: '/importar', icon: '📥', label: 'Importar/Exportar', feature: 'exportar', module: 'exportar' },
  { to: '/gastos', icon: '💸', label: 'Gastos', feature: null, module: 'caja' },
  { to: '/insumos', icon: '📦', label: 'Insumos', feature: 'insumos', module: 'insumos' },
  { to: '/configuracion', icon: '⚙️', label: 'Configuración', feature: null, module: 'configuracion' },
  { to: '/giftcards', icon: '🎁', label: 'Giftcards', feature: null, module: 'caja' },
]

// Roles que son colaboradores (no dueños ni superadmin)
const COLAB_ROLES = new Set(['profesional', 'recepcionista', 'admin'])

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/pacientes': 'Pacientes',
  '/agenda': 'Agenda',
  '/caja': 'Caja',
  '/crm': 'CRM — Pacientes',
  '/reportes': 'Reportes',
  '/importar': 'Importar / Exportar',
  '/insumos': 'Insumos',
  '/configuracion': 'Configuración',
  '/suscripcion': 'Mi Suscripción',
  '/perfil': 'Mi Perfil',
}

const EMPTY_PAC = { nombre: '', apellido: '', telefono: '', obra_social: '' }

export default function Layout() {
  const { user, configuracion, logout } = useAuth()
  const { hasFeature, isTrial, isExpired } = usePlanFeatures()
  const { canAccess } = useRoleAccess()
  const addToast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // ── Búsqueda global (topbar) ──────────────────────────────────────
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showSearchDrop, setShowSearchDrop] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const searchRef = useRef(null)
  const searchTimerRef = useRef(null)

  // ── Búsqueda global Ctrl+K modal ─────────────────────────
  const [ctrlKOpen, setCtrlKOpen] = useState(false)
  const [ctrlKQ, setCtrlKQ] = useState('')
  const [ctrlKResults, setCtrlKResults] = useState([])
  const [ctrlKLoading, setCtrlKLoading] = useState(false)
  const [ctrlKSelectedIdx, setCtrlKSelectedIdx] = useState(0)
  const ctrlKInputRef = useRef(null)
  const ctrlKTimerRef = useRef(null)

  const openCtrlK = useCallback(() => {
    setCtrlKOpen(true)
    setCtrlKQ('')
    setCtrlKResults([])
    setCtrlKSelectedIdx(0)
    setTimeout(() => ctrlKInputRef.current?.focus(), 30)
  }, [])

  const closeCtrlK = useCallback(() => {
    setCtrlKOpen(false)
    setCtrlKQ('')
    setCtrlKResults([])
  }, [])

  function handleCtrlKChange(e) {
    const q = e.target.value
    setCtrlKQ(q)
    setCtrlKSelectedIdx(0)
    clearTimeout(ctrlKTimerRef.current)
    if (!q.trim()) { setCtrlKResults([]); return }
    ctrlKTimerRef.current = setTimeout(async () => {
      setCtrlKLoading(true)
      try {
        const pacientes = await api.pacientes.list(q).catch(() => [])
        setCtrlKResults((pacientes ?? []).slice(0, 8))
      } finally { setCtrlKLoading(false) }
    }, 300)
  }

  function selectCtrlKResult(pac) {
    closeCtrlK()
    navigate(`/pacientes/${pac.id}`)
  }

  function handleSearchChange(e) {
    const q = e.target.value
    setSearchQ(q)
    setShowSearchDrop(true)
    clearTimeout(searchTimerRef.current)
    if (!q.trim()) { setSearchResults([]); return }
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const pacientes = await api.pacientes.list(q).catch(() => [])
        setSearchResults((pacientes ?? []).slice(0, 8))
      } finally { setSearchLoading(false) }
    }, 250)
  }

  function selectSearchResult(pac) {
    setSearchQ('')
    setSearchResults([])
    setShowSearchDrop(false)
    navigate(`/pacientes/${pac.id}`)
  }

  // ── FAB ──────────────────────────────────────────────────
  const [fabOpen, setFabOpen] = useState(false)
  const [fabModal, setFabModal] = useState(null) // 'turno' | 'paciente' | 'pago'
  const [fabPacientes, setFabPacientes] = useState([])
  const [fabColaboradores, setFabColaboradores] = useState([])
  const [fabSearch, setFabSearch] = useState('')
  const [fabShowSug, setFabShowSug] = useState(false)
  const [fabPacId, setFabPacId] = useState('')
  const [fabPacNombre, setFabPacNombre] = useState('')
  const [fabTurnoForm, setFabTurnoForm] = useState({ fecha_hora: '', duracion_minutos: 60, motivo: '', profesional_id: '' })
  const [fabPacForm, setFabPacForm] = useState(EMPTY_PAC)
  const [fabPagoForm, setFabPagoForm] = useState({ monto: '', metodo_pago: 'efectivo', concepto: '' })
  const [fabSaving, setFabSaving] = useState(false)
  const [fabError, setFabError] = useState('')
  const [fabInlineCrear, setFabInlineCrear] = useState(false)
  const [fabNuevoPacForm, setFabNuevoPacForm] = useState({ nombre: '', apellido: '', telefono: '' })

  function openFabModal(tipo) {
    setFabModal(tipo)
    setFabOpen(false)
    setFabError('')
    setFabPacId('')
    setFabPacNombre('')
    setFabSearch('')
    setFabInlineCrear(false)
    setFabNuevoPacForm({ nombre: '', apellido: '', telefono: '' })
    if (tipo === 'turno') {
      const now = new Date(); now.setMinutes(0,0,0); now.setHours(now.getHours()+1)
      setFabTurnoForm({ fecha_hora: format(now, "yyyy-MM-dd'T'HH:mm"), duracion_minutos: 60, motivo: '', profesional_id: '' })
      api.pacientes.list().then(ps => setFabPacientes(ps ?? [])).catch(() => {})
      api.colaboradores.list().then(cs => setFabColaboradores((cs ?? []).filter(c => c.activo !== 0))).catch(() => {})
    }
    if (tipo === 'pago') {
      setFabPagoForm({ monto: '', metodo_pago: 'efectivo', concepto: '' })
      api.pacientes.list().then(ps => setFabPacientes(ps ?? [])).catch(() => {})
    }
    if (tipo === 'paciente') {
      setFabPacForm(EMPTY_PAC)
    }
  }

  async function handleFabTurno(e) {
    e.preventDefault()
    if (!fabPacId) { setFabError('Seleccioná un paciente'); return }
    if (!fabTurnoForm.fecha_hora) { setFabError('Ingresá la fecha y hora del turno'); return }
    setFabSaving(true); setFabError('')
    try {
      const turnoPayload = { ...fabTurnoForm, paciente_id: fabPacId, duracion_minutos: Number(fabTurnoForm.duracion_minutos) || 60 }
      if (!turnoPayload.profesional_id) delete turnoPayload.profesional_id
      await api.turnos.create(turnoPayload)
      setFabModal(null)
      addToast('Turno creado correctamente', 'success')
      navigate('/agenda')
    } catch (err) { setFabError(err.message || 'No se pudo crear el turno. Verificá los datos e intentá nuevamente.') }
    finally { setFabSaving(false) }
  }

  async function handleFabInlinePaciente(e) {
    e.preventDefault()
    if (!fabNuevoPacForm.nombre || !fabNuevoPacForm.apellido) { setFabError('Nombre y apellido son obligatorios'); return }
    setFabSaving(true); setFabError('')
    try {
      const p = await api.pacientes.create(fabNuevoPacForm)
      setFabPacId(p.id)
      setFabPacNombre(`${p.apellido}, ${p.nombre}`)
      setFabInlineCrear(false)
      setFabPacientes(ps => [...ps, p])
      addToast(`Paciente ${p.apellido}, ${p.nombre} creado`, 'success')
    } catch (err) { setFabError(err.message || 'No se pudo crear el paciente') }
    finally { setFabSaving(false) }
  }

  async function handleFabPaciente(e) {
    e.preventDefault()
    if (!fabPacForm.nombre || !fabPacForm.apellido) { setFabError('Nombre y apellido son obligatorios'); return }
    setFabSaving(true); setFabError('')
    try {
      const p = await api.pacientes.create(fabPacForm)
      setFabModal(null)
      addToast(`Paciente ${p.apellido}, ${p.nombre} creado`, 'success')
      navigate(`/pacientes/${p.id}`)
    } catch (err) { setFabError(err.message || 'No se pudo crear el paciente. Verificá nombre y apellido.') }
    finally { setFabSaving(false) }
  }

  async function handleFabPago(e) {
    e.preventDefault()
    if (!fabPacId) { setFabError('Seleccioná un paciente'); return }
    if (!fabPagoForm.monto || Number(fabPagoForm.monto) <= 0) { setFabError('Ingresá un monto válido mayor a cero'); return }
    setFabSaving(true); setFabError('')
    try {
      await api.pagos.create({ ...fabPagoForm, paciente_id: fabPacId, monto: Number(fabPagoForm.monto) })
      setFabModal(null)
      addToast('Pago registrado correctamente', 'success')
    } catch (err) { setFabError(err.message || 'No se pudo registrar el pago. Verificá que el monto sea mayor a cero.') }
    finally { setFabSaving(false) }
  }

  const fabSugerencias = fabPacientes.filter(p => {
    const q = fabSearch.toLowerCase()
    return p.nombre.toLowerCase().includes(q) || p.apellido.toLowerCase().includes(q) || (p.dni ?? '').includes(q)
  }).slice(0, 6)

  // ── Sync manager — start once on mount ────────────────────
  useEffect(() => {
    startSyncManager(api)
  }, [])

  // ── Atajos de teclado ─────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      // Ctrl+K abre el modal de búsqueda global siempre
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        openCtrlK()
        return
      }
      // ESC siempre cierra modales activos aunque el foco esté en un input
      if (e.key === 'Escape') {
        setFabModal(null); setFabOpen(false); setShowSearchDrop(false); closeCtrlK()
        document.activeElement?.blur()
        return
      }
      // Ignorar otros atajos si el foco está en un input/textarea/select
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openFabModal('turno') }
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); openFabModal('paciente') }
      if (e.key === 'f' || e.key === 'F' || e.key === '/' || e.key === 'b' || e.key === 'B') { e.preventDefault(); searchRef.current?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [openCtrlK, closeCtrlK])

  const title = PAGE_TITLES[location.pathname]
    ?? (location.pathname.startsWith('/pacientes/') ? 'Ficha del Paciente' : 'Clingest')

  return (
    <div className="layout" onClick={() => { fabOpen && setFabOpen(false); showSearchDrop && !searchQ && setShowSearchDrop(false) }}>
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 99 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-logo">
          <span className="logo-icon">🏥</span>
          <div>
            <div className="logo-text">Clingest</div>
            <div className="logo-sub">GESTIÓN MÉDICA</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Menú</div>
          {NAV.filter(({ module }) => canAccess(module)).map(({ to, icon, label, exact, feature }) => {
            const locked = feature && !hasFeature(feature)
            return (
              <NavLink
                key={to}
                to={to}
                end={exact}
                className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}${locked ? ' sidebar-link-locked' : ''}`}
                onClick={() => setSidebarOpen(false)}
                title={locked ? `Disponible en plan superior` : undefined}
              >
                <span className="icon">{icon}</span>
                {label}
                {locked && <span style={{ marginLeft: 'auto', fontSize: '.65rem', background: '#e2e8f0', color: '#64748b', borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>PRO</span>}
              </NavLink>
            )
          })}

          {/* Indicador de rol para colaboradores */}
          {COLAB_ROLES.has(user?.rol) && (
            <div style={{ margin: '12px 8px 0', padding: '8px 12px', background: 'var(--c-surface-2)', borderRadius: 8, fontSize: '.75rem', color: 'var(--c-text-3)' }}>
              <span style={{ fontWeight: 700, color: 'var(--c-text-2)' }}>
                {{ profesional: '🩺 Profesional', recepcionista: '📋 Recepcionista', admin: '👤 Administrador' }[user.rol]}
              </span>
              <div style={{ marginTop: 2 }}>Acceso según tu rol</div>
            </div>
          )}

          {/* Link de Suscripción (solo para dueños, no colaboradores) */}
          {user?.rol === 'tenant' && (
            <>
              <div className="sidebar-section-label" style={{ marginTop: 16 }}>Cuenta</div>
              <NavLink
                to="/suscripcion"
                className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="icon">💳</span>
                Mi Plan
              </NavLink>
            </>
          )}

          {/* Link de Admin solo para superadmin */}
          {user?.rol === 'superadmin' && (
            <>
              <div className="sidebar-section-label" style={{ marginTop: 16 }}>Administración</div>
              <NavLink
                to="/admin"
                className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
                onClick={() => setSidebarOpen(false)}
                style={{ color: 'var(--c-warning, #d97706)' }}
              >
                <span className="icon">🛡️</span>
                Panel Admin
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <AICreditBadge />
          <div className="sidebar-consultorio">
            <div className="sc-name">
              {COLAB_ROLES.has(user?.rol) && user?.nombre
                ? user.nombre
                : (configuracion?.nombre_consultorio ?? 'Consultorio')}
            </div>
            <div className="sc-user">{user?.email}</div>
            {user?.rol === 'superadmin' && (
              <div style={{ fontSize: '.7rem', color: '#d97706', fontWeight: 700, marginTop: 2 }}>⚡ SUPERADMIN</div>
            )}
          </div>
          <NavLink
            to="/perfil"
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            onClick={() => setSidebarOpen(false)}
            style={{ fontSize: '.82rem', marginBottom: 4 }}
          >
            <span className="icon">👤</span>
            Mi perfil
          </NavLink>
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
              onClick={e => { e.stopPropagation(); setSidebarOpen(true) }}
              aria-label="Menú"
            >☰</button>
            <span className="topbar-title">{title}</span>
          </div>

          {/* Búsqueda global */}
          <div style={{ flex: 1, maxWidth: 360, margin: '0 16px', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <div className="search-bar" style={{ width: '100%' }}>
              <span className="search-icon">🔍</span>
              <input
                ref={searchRef}
                placeholder="Buscar paciente... (F, / o Ctrl+K)"
                value={searchQ}
                onChange={handleSearchChange}
                onFocus={() => searchQ && setShowSearchDrop(true)}
                onBlur={() => setTimeout(() => setShowSearchDrop(false), 200)}
                autoComplete="off"
              />
              {searchLoading && <span className="spinner" style={{ width: 14, height: 14 }} />}
            </div>
            {showSearchDrop && searchQ && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 500, background: 'var(--c-surface)', border: '1.5px solid var(--c-border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', marginTop: 4 }}>
                {searchResults.length === 0 ? (
                  <div style={{ padding: '12px 16px', fontSize: '.85rem', color: 'var(--c-text-3)' }}>Sin resultados</div>
                ) : searchResults.map(p => (
                  <div key={p.id}
                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--c-border)', fontSize: '.85rem', display: 'flex', gap: 10, alignItems: 'center' }}
                    onMouseDown={() => selectSearchResult(p)}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--c-surface-2)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--c-primary-light)', color: 'var(--c-primary-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '.72rem', flexShrink: 0 }}>
                      {p.apellido[0]}{p.nombre[0]}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--c-text)' }}>{p.apellido}, {p.nombre}</div>
                      <div style={{ fontSize: '.75rem', color: 'var(--c-text-3)' }}>{p.dni ? `DNI ${p.dni}` : ''}{p.obra_social ? ` · ${p.obra_social}` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="topbar-right">
            <span className="text-sm text-muted" style={{ whiteSpace: 'nowrap' }}>
              {COLAB_ROLES.has(user?.rol) ? (user?.nombre ?? user?.email ?? '') : (configuracion?.nombre_profesional ?? user?.nombre ?? '')}
            </span>
          </div>
        </header>

        <OfflineIndicator />
        <TrialBanner />
        <div className="page-content">
          <Outlet />
        </div>
      </main>

      {/* ── FAB (Floating Action Button) ── */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 400 }} onClick={e => e.stopPropagation()}>
        {fabOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12, alignItems: 'flex-end' }}>
            {[
              ['paciente', '👤', 'Nuevo paciente', 'P', null],
              ['turno', '📅', 'Nuevo turno', 'N', null],
              ['pago', '💵', 'Registrar pago', '', 'caja'],
            ].filter(([, , , , module]) => canAccess(module)).map(([tipo, icon, label, atajo]) => (
              <button key={tipo}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 100, boxShadow: 'var(--shadow-md)', fontWeight: 600, fontSize: '.84rem', color: 'var(--c-text)', whiteSpace: 'nowrap', cursor: 'pointer' }}
                onClick={() => openFabModal(tipo)}>
                {icon} {label}
                {atajo && <span style={{ fontSize: '.7rem', background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 4, padding: '1px 5px', color: 'var(--c-text-3)' }}>{atajo}</span>}
              </button>
            ))}
          </div>
        )}
        <button
          style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--c-primary)', color: '#FFF', border: 'none', fontSize: '1.5rem', boxShadow: '0 4px 20px rgba(3,105,161,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .2s, background .15s', transform: fabOpen ? 'rotate(45deg)' : 'none', cursor: 'pointer' }}
          onClick={e => { e.stopPropagation(); setFabOpen(o => !o) }}
          title="Acciones rápidas"
        >+</button>
      </div>

      {/* ── Modal FAB: Nuevo turno ── */}
      {fabModal === 'turno' && (
        <div className="modal-overlay">
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">📅 Nuevo turno</span>
              <button className="btn-close" onClick={() => setFabModal(null)}>✕</button>
            </div>
            <form onSubmit={handleFabTurno}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">Paciente <span className="req">*</span></label>
                  {fabPacId ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', border: '1.5px solid var(--c-primary)', borderRadius: 'var(--radius-sm)', background: 'var(--c-primary-light)' }}>
                      <span style={{ flex: 1, fontWeight: 600, color: 'var(--c-primary-dark)', fontSize: '.88rem' }}>{fabPacNombre}</span>
                      <button type="button" className="btn-close" onClick={() => { setFabPacId(''); setFabPacNombre(''); setFabSearch('') }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <input className="form-input" placeholder="Buscar paciente..." value={fabSearch}
                        onChange={e => { setFabSearch(e.target.value); setFabShowSug(true); setFabInlineCrear(false) }}
                        onBlur={() => setTimeout(() => setFabShowSug(false), 150)} autoComplete="off" />
                      {fabShowSug && fabSearch && fabSugerencias.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300, background: 'var(--c-surface)', border: '1.5px solid var(--c-border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md)', maxHeight: 200, overflowY: 'auto' }}>
                          {fabSugerencias.map(p => (
                            <div key={p.id} style={{ padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid var(--c-border)', fontSize: '.86rem' }}
                              onMouseDown={() => { setFabPacId(p.id); setFabPacNombre(`${p.apellido}, ${p.nombre}`); setFabSearch(''); setFabShowSug(false) }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--c-surface-2)'}
                              onMouseLeave={e => e.currentTarget.style.background = ''}>
                              <strong>{p.apellido}, {p.nombre}</strong>
                              {p.dni && <span style={{ marginLeft: 8, color: 'var(--c-text-3)', fontSize: '.78rem' }}>DNI {p.dni}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {fabSearch && fabSugerencias.length === 0 && !fabInlineCrear && (
                        <div style={{ marginTop: 6, padding: '8px 12px', background: 'var(--c-surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--c-border)', fontSize: '.84rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--c-text-3)' }}>No se encontró "{fabSearch}"</span>
                          <button type="button" className="btn btn-sm btn-primary"
                            onClick={() => {
                              const parts = fabSearch.trim().split(/\s+/)
                              setFabNuevoPacForm({ nombre: parts[0] ?? '', apellido: parts.slice(1).join(' '), telefono: '' })
                              setFabInlineCrear(true)
                            }}>
                            + Crear paciente
                          </button>
                        </div>
                      )}
                      {fabInlineCrear && (
                        <div style={{ marginTop: 8, padding: '14px', background: '#f0f9ff', border: '1.5px solid #bae6fd', borderRadius: 'var(--radius-sm)' }}>
                          <div style={{ fontSize: '.8rem', fontWeight: 700, color: '#0369a1', marginBottom: 10 }}>Nuevo paciente</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                            <input className="form-input" placeholder="Nombre *"
                              value={fabNuevoPacForm.nombre}
                              onChange={e => setFabNuevoPacForm(f => ({ ...f, nombre: e.target.value }))} />
                            <input className="form-input" placeholder="Apellido *"
                              value={fabNuevoPacForm.apellido}
                              onChange={e => setFabNuevoPacForm(f => ({ ...f, apellido: e.target.value }))} />
                          </div>
                          <input className="form-input" placeholder="Teléfono (opcional)"
                            value={fabNuevoPacForm.telefono}
                            onChange={e => setFabNuevoPacForm(f => ({ ...f, telefono: e.target.value }))}
                            style={{ marginBottom: 10 }} />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setFabInlineCrear(false)}>Cancelar</button>
                            <button type="button" className="btn btn-sm btn-primary" disabled={fabSaving}
                              onClick={handleFabInlinePaciente}>
                              {fabSaving ? 'Creando...' : 'Crear y seleccionar'}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Fecha y hora <span className="req">*</span></label>
                    <input className="form-input" type="datetime-local" required value={fabTurnoForm.fecha_hora}
                      onChange={e => setFabTurnoForm(f => ({ ...f, fecha_hora: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Duración</label>
                    <select className="form-input" value={fabTurnoForm.duracion_minutos}
                      onChange={e => setFabTurnoForm(f => ({ ...f, duracion_minutos: e.target.value }))}>
                      {[15,20,30,45,60,90,120].map(d => <option key={d} value={d}>{d} min</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Motivo</label>
                  <input className="form-input" value={fabTurnoForm.motivo}
                    onChange={e => setFabTurnoForm(f => ({ ...f, motivo: e.target.value }))} placeholder="" />
                </div>
                {fabColaboradores.length > 0 && (
                  <div className="form-group">
                    <label className="form-label">Profesional</label>
                    <select className="form-input" value={fabTurnoForm.profesional_id}
                      onChange={e => setFabTurnoForm(f => ({ ...f, profesional_id: e.target.value }))}>
                      <option value="">Sin asignar</option>
                      {fabColaboradores.map(c => (
                        <option key={c.id} value={c.id}>{c.nombre} {c.apellido ?? ''}</option>
                      ))}
                    </select>
                  </div>
                )}
                {fabError && <div className="alert alert-danger">{fabError}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setFabModal(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={fabSaving}>{fabSaving ? 'Guardando...' : 'Crear turno'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal FAB: Nuevo paciente ── */}
      {fabModal === 'paciente' && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">👤 Nuevo paciente</span>
              <button className="btn-close" onClick={() => setFabModal(null)}>✕</button>
            </div>
            <form onSubmit={handleFabPaciente}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Nombre <span className="req">*</span></label>
                    <input className="form-input" required value={fabPacForm.nombre}
                      onChange={e => setFabPacForm(f => ({ ...f, nombre: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Apellido <span className="req">*</span></label>
                    <input className="form-input" required value={fabPacForm.apellido}
                      onChange={e => setFabPacForm(f => ({ ...f, apellido: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input className="form-input" value={fabPacForm.telefono}
                    onChange={e => setFabPacForm(f => ({ ...f, telefono: e.target.value }))} placeholder="" />
                </div>
                <div className="form-group">
                  <label className="form-label">Obra social</label>
                  <input className="form-input" value={fabPacForm.obra_social}
                    onChange={e => setFabPacForm(f => ({ ...f, obra_social: e.target.value }))} placeholder="" />
                </div>
                {fabError && <div className="alert alert-danger">{fabError}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setFabModal(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={fabSaving}>{fabSaving ? 'Guardando...' : 'Crear paciente'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Ctrl+K: Búsqueda global ── */}
      {ctrlKOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}
          onClick={closeCtrlK}
        >
          <div
            style={{ background: 'var(--c-surface)', border: '1.5px solid var(--c-border)', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.25)', width: '100%', maxWidth: 520, overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Escape') { closeCtrlK(); return }
              if (e.key === 'ArrowDown') { e.preventDefault(); setCtrlKSelectedIdx(i => Math.min(i + 1, ctrlKResults.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setCtrlKSelectedIdx(i => Math.max(i - 1, 0)) }
              if (e.key === 'Enter' && ctrlKResults[ctrlKSelectedIdx]) { selectCtrlKResult(ctrlKResults[ctrlKSelectedIdx]) }
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--c-border)', gap: 10 }}>
              <span style={{ fontSize: '1.1rem', opacity: .5 }}>🔍</span>
              <input
                ref={ctrlKInputRef}
                value={ctrlKQ}
                onChange={handleCtrlKChange}
                placeholder="Buscar paciente por nombre, apellido o DNI..."
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: '1rem', background: 'transparent', color: 'var(--c-text)' }}
                autoComplete="off"
              />
              {ctrlKLoading && <span className="spinner" style={{ width: 16, height: 16 }} />}
              <kbd style={{ fontSize: '.7rem', padding: '2px 6px', border: '1px solid var(--c-border)', borderRadius: 5, color: 'var(--c-text-3)', background: 'var(--c-surface-2)' }}>ESC</kbd>
            </div>
            {ctrlKResults.length > 0 && (
              <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                {ctrlKResults.map((p, i) => (
                  <div
                    key={p.id}
                    style={{ padding: '11px 16px', cursor: 'pointer', borderBottom: '1px solid var(--c-border)', display: 'flex', gap: 12, alignItems: 'center', background: i === ctrlKSelectedIdx ? 'var(--c-surface-2)' : 'transparent', transition: 'background .1s' }}
                    onMouseEnter={() => setCtrlKSelectedIdx(i)}
                    onMouseDown={() => selectCtrlKResult(p)}
                  >
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--c-primary-light)', color: 'var(--c-primary-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '.78rem', flexShrink: 0 }}>
                      {p.apellido[0]}{p.nombre[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'var(--c-text)', fontSize: '.9rem' }}>{p.apellido}, {p.nombre}</div>
                      <div style={{ fontSize: '.76rem', color: 'var(--c-text-3)', marginTop: 1 }}>
                        {p.dni ? `DNI ${p.dni}` : ''}
                        {p.obra_social ? ` · ${p.obra_social}` : ''}
                        {p.telefono ? ` · ${p.telefono}` : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: '.72rem', color: 'var(--c-text-3)' }}>↵ abrir ficha</span>
                  </div>
                ))}
              </div>
            )}
            {ctrlKQ.trim() && !ctrlKLoading && ctrlKResults.length === 0 && (
              <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--c-text-3)', fontSize: '.88rem' }}>
                Sin resultados para "{ctrlKQ}"
              </div>
            )}
            {!ctrlKQ.trim() && (
              <div style={{ padding: '16px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '.76rem', color: 'var(--c-text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <kbd style={{ fontSize: '.68rem', padding: '1px 5px', border: '1px solid var(--c-border)', borderRadius: 4, background: 'var(--c-surface-2)' }}>↑↓</kbd> navegar
                </span>
                <span style={{ fontSize: '.76rem', color: 'var(--c-text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <kbd style={{ fontSize: '.68rem', padding: '1px 5px', border: '1px solid var(--c-border)', borderRadius: 4, background: 'var(--c-surface-2)' }}>↵</kbd> abrir ficha
                </span>
                <span style={{ fontSize: '.76rem', color: 'var(--c-text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <kbd style={{ fontSize: '.68rem', padding: '1px 5px', border: '1px solid var(--c-border)', borderRadius: 4, background: 'var(--c-surface-2)' }}>ESC</kbd> cerrar
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal FAB: Registrar pago ── */}
      {fabModal === 'pago' && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">💵 Registrar pago</span>
              <button className="btn-close" onClick={() => setFabModal(null)}>✕</button>
            </div>
            <form onSubmit={handleFabPago}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">Paciente <span className="req">*</span></label>
                  {fabPacId ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', border: '1.5px solid var(--c-primary)', borderRadius: 'var(--radius-sm)', background: 'var(--c-primary-light)' }}>
                      <span style={{ flex: 1, fontWeight: 600, color: 'var(--c-primary-dark)', fontSize: '.88rem' }}>{fabPacNombre}</span>
                      <button type="button" className="btn-close" onClick={() => { setFabPacId(''); setFabPacNombre(''); setFabSearch('') }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <input className="form-input" placeholder="Buscar paciente..." value={fabSearch}
                        onChange={e => { setFabSearch(e.target.value); setFabShowSug(true) }}
                        onBlur={() => setTimeout(() => setFabShowSug(false), 150)} autoComplete="off" />
                      {fabShowSug && fabSearch && fabSugerencias.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300, background: 'var(--c-surface)', border: '1.5px solid var(--c-border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md)', maxHeight: 200, overflowY: 'auto' }}>
                          {fabSugerencias.map(p => (
                            <div key={p.id} style={{ padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid var(--c-border)', fontSize: '.86rem' }}
                              onMouseDown={() => { setFabPacId(p.id); setFabPacNombre(`${p.apellido}, ${p.nombre}`); setFabSearch(''); setFabShowSug(false) }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--c-surface-2)'}
                              onMouseLeave={e => e.currentTarget.style.background = ''}>
                              <strong>{p.apellido}, {p.nombre}</strong>
                              {p.dni && <span style={{ marginLeft: 8, color: 'var(--c-text-3)', fontSize: '.78rem' }}>DNI {p.dni}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Monto <span className="req">*</span></label>
                  <input className="form-input" type="number" min="1" required value={fabPagoForm.monto}
                    onChange={e => setFabPagoForm(f => ({ ...f, monto: e.target.value }))} placeholder="$0" />
                </div>
                <div className="form-group">
                  <label className="form-label">Método</label>
                  <select className="form-input" value={fabPagoForm.metodo_pago}
                    onChange={e => setFabPagoForm(f => ({ ...f, metodo_pago: e.target.value }))}>
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="tarjeta_debito">Débito</option>
                    <option value="tarjeta_credito">Crédito</option>
                    <option value="obra_social">Obra Social</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Concepto</label>
                  <input className="form-input" value={fabPagoForm.concepto}
                    onChange={e => setFabPagoForm(f => ({ ...f, concepto: e.target.value }))} placeholder="" />
                </div>
                {fabError && <div className="alert alert-danger">{fabError}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setFabModal(null)}>Cancelar</button>
                <button type="submit" className="btn btn-success" disabled={fabSaving}>{fabSaving ? 'Guardando...' : 'Registrar pago'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
