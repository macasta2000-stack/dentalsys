import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { format } from 'date-fns'

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

const EMPTY_PAC = { nombre: '', apellido: '', telefono: '', obra_social: '' }

export default function Layout() {
  const { user, configuracion, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // ── Búsqueda global ──────────────────────────────────────
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showSearchDrop, setShowSearchDrop] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const searchRef = useRef(null)
  const searchTimerRef = useRef(null)

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
  const [fabSearch, setFabSearch] = useState('')
  const [fabShowSug, setFabShowSug] = useState(false)
  const [fabPacId, setFabPacId] = useState('')
  const [fabPacNombre, setFabPacNombre] = useState('')
  const [fabTurnoForm, setFabTurnoForm] = useState({ fecha_hora: '', duracion_minutos: 60, motivo: '' })
  const [fabPacForm, setFabPacForm] = useState(EMPTY_PAC)
  const [fabPagoForm, setFabPagoForm] = useState({ monto: '', metodo_pago: 'efectivo', concepto: '' })
  const [fabSaving, setFabSaving] = useState(false)
  const [fabError, setFabError] = useState('')

  function openFabModal(tipo) {
    setFabModal(tipo)
    setFabOpen(false)
    setFabError('')
    setFabPacId('')
    setFabPacNombre('')
    setFabSearch('')
    if (tipo === 'turno') {
      const now = new Date(); now.setMinutes(0,0,0); now.setHours(now.getHours()+1)
      setFabTurnoForm({ fecha_hora: format(now, "yyyy-MM-dd'T'HH:mm"), duracion_minutos: 60, motivo: '' })
      api.pacientes.list().then(ps => setFabPacientes(ps ?? [])).catch(() => {})
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
      await api.turnos.create({ ...fabTurnoForm, paciente_id: fabPacId, duracion_minutos: Number(fabTurnoForm.duracion_minutos) || 60 })
      setFabModal(null)
      navigate('/agenda')
    } catch (err) { setFabError('No se pudo crear el turno. Verificá los datos e intentá nuevamente.') }
    finally { setFabSaving(false) }
  }

  async function handleFabPaciente(e) {
    e.preventDefault()
    if (!fabPacForm.nombre || !fabPacForm.apellido) { setFabError('Nombre y apellido son obligatorios'); return }
    setFabSaving(true); setFabError('')
    try {
      const p = await api.pacientes.create(fabPacForm)
      setFabModal(null)
      navigate(`/pacientes/${p.id}`)
    } catch (err) { setFabError('No se pudo crear el paciente. Nombre y apellido son obligatorios.') }
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
    } catch (err) { setFabError('No se pudo registrar el pago. Verificá que el monto sea mayor a cero.') }
    finally { setFabSaving(false) }
  }

  const fabSugerencias = fabPacientes.filter(p => {
    const q = fabSearch.toLowerCase()
    return p.nombre.toLowerCase().includes(q) || p.apellido.toLowerCase().includes(q) || (p.dni ?? '').includes(q)
  }).slice(0, 6)

  // ── Atajos de teclado ─────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      // Ignorar si el foco está en un input/textarea/select
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        if (e.key === 'Escape') document.activeElement.blur()
        return
      }
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openFabModal('turno') }
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); openFabModal('paciente') }
      if (e.key === 'f' || e.key === 'F' || e.key === '/') { e.preventDefault(); searchRef.current?.focus() }
      if (e.key === 'Escape') { setFabModal(null); setFabOpen(false); setShowSearchDrop(false) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const title = PAGE_TITLES[location.pathname]
    ?? (location.pathname.startsWith('/pacientes/') ? 'Ficha del Paciente' : 'DentalSys')

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
                placeholder="Buscar paciente... (F o /)"
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
              {configuracion?.nombre_profesional ?? user?.nombre ?? ''}
            </span>
          </div>
        </header>

        <div className="page-content">
          <Outlet />
        </div>
      </main>

      {/* ── FAB (Floating Action Button) ── */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 400 }} onClick={e => e.stopPropagation()}>
        {fabOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12, alignItems: 'flex-end' }}>
            {[
              ['paciente', '👤', 'Nuevo paciente', 'P'],
              ['turno', '📅', 'Nuevo turno', 'N'],
              ['pago', '💵', 'Registrar pago', ''],
            ].map(([tipo, icon, label, atajo]) => (
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
        <div className="modal-overlay" onClick={() => setFabModal(null)}>
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
                    onChange={e => setFabTurnoForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Control, consulta, tratamiento..." />
                </div>
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
        <div className="modal-overlay" onClick={() => setFabModal(null)}>
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
                    onChange={e => setFabPacForm(f => ({ ...f, telefono: e.target.value }))} placeholder="11-5555-0000" />
                </div>
                <div className="form-group">
                  <label className="form-label">Obra social</label>
                  <input className="form-input" value={fabPacForm.obra_social}
                    onChange={e => setFabPacForm(f => ({ ...f, obra_social: e.target.value }))} placeholder="OSDE, Swiss Medical..." />
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

      {/* ── Modal FAB: Registrar pago ── */}
      {fabModal === 'pago' && (
        <div className="modal-overlay" onClick={() => setFabModal(null)}>
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
                    <option value="mercadopago">MercadoPago</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Concepto</label>
                  <input className="form-input" value={fabPagoForm.concepto}
                    onChange={e => setFabPagoForm(f => ({ ...f, concepto: e.target.value }))} placeholder="Consulta, tratamiento..." />
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
