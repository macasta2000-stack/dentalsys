// ============================================================
// PANEL DE ADMINISTRACIÓN — Solo para superadmin
// Gestión completa de clientes (tenants) del sistema
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

function fmtARS(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0)
}
function fmtDate(d) {
  if (!d) return '—'
  try { return format(new Date(d), 'dd/MM/yyyy', { locale: es }) } catch { return d }
}
function fmtRelativo(d) {
  if (!d) return null
  try {
    const diffMs = new Date().setHours(0,0,0,0) - new Date(d).setHours(0,0,0,0)
    const diff = Math.floor(diffMs / 86400000)
    if (diff === 0) return 'Hoy'
    if (diff === 1) return 'Ayer'
    if (diff < 7) return `Hace ${diff} días`
    if (diff < 30) return `Hace ${Math.floor(diff/7)} sem.`
    if (diff < 365) return `Hace ${Math.floor(diff/30)} meses`
    return `Hace ${Math.floor(diff/365)} año${Math.floor(diff/365)>1?'s':''}`
  } catch { return null }
}

// Indicador de actividad basado en último login y último turno
function getActividad(t) {
  const loginAt = t.last_login_at ? new Date(t.last_login_at) : null
  const turnoAt = t.ultimo_turno_fecha ? new Date(t.ultimo_turno_fecha) : null
  const mas_reciente = loginAt && turnoAt
    ? (loginAt > turnoAt ? loginAt : turnoAt)
    : (loginAt || turnoAt)

  if (!mas_reciente) return { dot: '#94a3b8', label: 'Sin actividad', bg: '#f1f5f9', color: '#64748b' }
  const dias = Math.floor((Date.now() - mas_reciente.getTime()) / 86400000)
  if (dias <= 7)  return { dot: '#16a34a', label: 'Activo',          bg: '#dcfce7', color: '#15803d' }
  if (dias <= 30) return { dot: '#d97706', label: 'Bajo uso',         bg: '#fef3c7', color: '#b45309' }
  return              { dot: '#dc2626', label: 'Inactivo',          bg: '#fee2e2', color: '#b91c1c' }
}

const ESTADO_CONFIG = {
  activo:     { label: 'Activo',     color: '#16a34a', bg: '#dcfce7' },
  trial:      { label: 'Trial',      color: '#d97706', bg: '#fef3c7' },
  suspendido: { label: 'Suspendido', color: '#dc2626', bg: '#fee2e2' },
}

const EMPTY_FORM = {
  email: '', password: '', nombre: '', nombre_consultorio: '',
  estado: 'activo', trial_dias: '30', notas: '',
}

export default function AdminPage() {
  const addToast = useToast()
  const [tab, setTab] = useState('clientes') // clientes | revenue | config
  const [data, setData] = useState({ tenants: [], stats: {} })
  const [revenue, setRevenue] = useState(null)
  const [loadingRevenue, setLoadingRevenue] = useState(false)
  const [sistemaConfig, setSistemaConfig] = useState(null)
  const [sistemaForm, setSistemaForm] = useState({})
  const [savingConfig, setSavingConfig] = useState(false)
  const [loading, setLoading] = useState(true)
  const [modalCrear, setModalCrear] = useState(false)
  const [modalEditar, setModalEditar] = useState(null)   // tenant a editar
  const [modalConfirm, setModalConfirm] = useState(null) // { tipo, tenant }
  const [form, setForm] = useState(EMPTY_FORM)
  const [formEdit, setFormEdit] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('todos') // todos | activo | trial | suspendido
  const [busqueda, setBusqueda] = useState('')
  const [modalPlan, setModalPlan] = useState(null) // tenant a asignar plan
  const [planForm, setPlanForm] = useState({ plan_id: 'plan_pro', ciclo: 'mensual' })
  const [savingPlan, setSavingPlan] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/tenants')
      setData(res)
    } catch (e) {
      addToast('No se pudo cargar la lista de clientes', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  const cargarRevenue = useCallback(async () => {
    if (revenue) return // ya cargado
    setLoadingRevenue(true)
    try {
      const res = await api.get('/admin/revenue')
      setRevenue(res)
    } catch (e) {
      addToast('No se pudo cargar el reporte de ingresos', 'error')
    } finally {
      setLoadingRevenue(false)
    }
  }, [revenue])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { if (tab === 'revenue') cargarRevenue() }, [tab, cargarRevenue])
  useEffect(() => {
    if (tab === 'config' && !sistemaConfig) {
      api.get('/config/sistema').then(cfg => {
        setSistemaConfig(cfg)
        setSistemaForm(cfg)
      }).catch(() => addToast('No se pudo cargar la configuración', 'error'))
    }
  }, [tab, sistemaConfig])

  async function handleGuardarConfig(e) {
    e.preventDefault()
    setSavingConfig(true)
    try {
      await api.patch('/config/sistema', sistemaForm)
      setSistemaConfig(sistemaForm)
      addToast('Configuración guardada', 'success')
    } catch (err) {
      addToast(err.message || 'Error al guardar', 'error')
    } finally {
      setSavingConfig(false)
    }
  }

  // ── Crear cliente ────────────────────────────────────────
  async function handleCrear(e) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      await api.post('/admin/tenants', {
        ...form,
        trial_dias: form.estado === 'trial' ? Number(form.trial_dias) : undefined,
      })
      addToast(`Cliente ${form.email} creado correctamente`, 'success')
      setModalCrear(false)
      setForm(EMPTY_FORM)
      cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Editar / cambiar estado ──────────────────────────────
  async function handleEditar(e) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      await api.patch(`/admin/tenants/${modalEditar.id}`, formEdit)
      addToast('Cliente actualizado', 'success')
      setModalEditar(null)
      cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Acción rápida de estado (activar/suspender) ──────────
  async function cambiarEstado(tenant, nuevoEstado) {
    try {
      await api.patch(`/admin/tenants/${tenant.id}`, { estado: nuevoEstado })
      addToast(
        nuevoEstado === 'suspendido'
          ? `${tenant.email} suspendido`
          : `${tenant.email} activado`,
        nuevoEstado === 'suspendido' ? 'warning' : 'success'
      )
      cargar()
    } catch (e) {
      addToast(e.message, 'error')
    }
  }

  // ── Eliminar cliente ─────────────────────────────────────
  async function handleEliminar() {
    const tenant = modalConfirm.tenant
    setSaving(true)
    try {
      await api.delete(`/admin/tenants/${tenant.id}`)
      addToast(`Cliente ${tenant.email} eliminado`, 'success')
      setModalConfirm(null)
      cargar()
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── Activar plan ─────────────────────────────────────────
  async function handleActivarPlan(e) {
    e.preventDefault()
    setSavingPlan(true)
    try {
      await api.patch(`/admin/tenants/${modalPlan.id}`, planForm)
      addToast(`Plan activado para ${modalPlan.email}`, 'success')
      setModalPlan(null)
      cargar()
    } catch (e) {
      addToast(e.message || 'Error al activar plan', 'error')
    } finally {
      setSavingPlan(false)
    }
  }

  // ── Filtrar ──────────────────────────────────────────────
  const tenantsFiltrados = filtro === 'todos'
    ? (data.tenants ?? [])
    : (data.tenants ?? []).filter(t => t.estado === filtro)

  const busquedaLower = busqueda.toLowerCase().trim()
  const tenants = busquedaLower
    ? tenantsFiltrados.filter(t =>
        (t.email ?? '').toLowerCase().includes(busquedaLower) ||
        (t.nombre ?? '').toLowerCase().includes(busquedaLower) ||
        (t.nombre_consultorio ?? '').toLowerCase().includes(busquedaLower)
      )
    : tenantsFiltrados

  const stats = data.stats ?? {}

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Panel de Administración</h1>
          <p style={{ color: 'var(--c-text-3)', fontSize: '.875rem', marginTop: 4 }}>
            Gestioná los clientes de Clingest
          </p>
        </div>
        {tab === 'clientes' && (
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setError(''); setModalCrear(true) }}>
            + Nuevo cliente
          </button>
        )}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid var(--c-border)', marginBottom: 24 }}>
        {[['clientes', '👥', 'Clientes'], ['revenue', '💰', 'Ingresos & MRR'], ['config', '⚙️', 'Configuración']].map(([t, icon, lbl]) => (
          <button key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '9px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: tab === t ? 700 : 500, fontSize: '.875rem',
              color: tab === t ? 'var(--c-primary)' : 'var(--c-text-3)',
              borderBottom: tab === t ? '2px solid var(--c-primary)' : '2px solid transparent',
              marginBottom: -2, transition: 'all .15s',
            }}
          >{icon} {lbl}</button>
        ))}
      </div>

      {/* ══════════════════════ TAB: CLIENTES ══════════════════════ */}
      {tab === 'clientes' && <>

      {/* ── Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total clientes', value: stats.total ?? 0, icon: '👥', color: 'var(--c-primary)' },
          { label: 'Activos', value: stats.activos ?? 0, icon: '✅', color: '#16a34a' },
          { label: 'En trial', value: stats.en_trial ?? 0, icon: '⏳', color: '#d97706' },
          { label: 'Suspendidos', value: stats.suspendidos ?? 0, icon: '🔒', color: '#dc2626' },
          {
            label: 'Usaron esta semana',
            value: (data.tenants ?? []).filter(t => {
              const act = getActividad(t)
              return act.label === 'Activo'
            }).length,
            icon: '🟢', color: '#0891b2',
          },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: '1.6rem' }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '.8rem', color: 'var(--c-text-3)', marginTop: 2 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filtros + Búsqueda ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['todos', 'Todos'], ['activo', 'Activos'], ['trial', 'Trial'], ['suspendido', 'Suspendidos']].map(([val, lbl]) => (
          <button key={val}
            className={`btn btn-sm ${filtro === val ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFiltro(val)}
          >{lbl}</button>
        ))}
        <input
          className="form-input"
          style={{ width: 220, padding: '5px 10px', fontSize: '.84rem', marginLeft: 8 }}
          placeholder="Buscar por nombre o email..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
        <span style={{ marginLeft: 'auto', fontSize: '.85rem', color: 'var(--c-text-3)', alignSelf: 'center' }}>
          {tenants.length} cliente{tenants.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Tabla de clientes ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--c-text-3)' }}>Cargando...</div>
      ) : tenants.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--c-text-3)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>👥</div>
          <div style={{ fontWeight: 600 }}>Sin clientes aún</div>
          <div style={{ fontSize: '.875rem', marginTop: 4 }}>Creá el primer cliente con el botón de arriba</div>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--c-border)', background: 'var(--c-surface-2)' }}>
                <th style={th}>Cliente</th>
                <th style={th}>Consultorio</th>
                <th style={th}>Estado</th>
                <th style={{ ...th, textAlign: 'center' }}>Actividad</th>
                <th style={th}>Plan</th>
                <th style={{ ...th, textAlign: 'center' }}>Profes.</th>
                <th style={{ ...th, textAlign: 'center' }}>Pacientes</th>
                <th style={{ ...th, textAlign: 'center' }}>Turnos/mes</th>
                <th style={th}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => {
                const est = ESTADO_CONFIG[t.estado] ?? ESTADO_CONFIG.activo
                const act = getActividad(t)
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--c-border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--c-surface-2)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>

                    {/* Cliente */}
                    <td style={td}>
                      <div style={{ fontWeight: 600, fontSize: '.875rem' }}>{t.nombre ?? '—'}</div>
                      <div style={{ fontSize: '.75rem', color: 'var(--c-text-3)' }}>{t.email}</div>
                      {t.notas && (
                        <div style={{ fontSize: '.72rem', color: 'var(--c-primary)', marginTop: 2, fontStyle: 'italic' }}>
                          📝 {t.notas}
                        </div>
                      )}
                    </td>

                    {/* Consultorio */}
                    <td style={td}>
                      <div style={{ fontSize: '.84rem' }}>{t.nombre_consultorio ?? '—'}</div>
                      {t.ciudad && <div style={{ fontSize: '.75rem', color: 'var(--c-text-3)' }}>📍 {t.ciudad}</div>}
                    </td>

                    {/* Estado */}
                    <td style={td}>
                      <span style={{ background: est.bg, color: est.color, padding: '3px 9px', borderRadius: 100, fontSize: '.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {est.label}
                      </span>
                      {t.estado === 'trial' && t.trial_hasta && (
                        <div style={{ fontSize: '.7rem', color: 'var(--c-text-3)', marginTop: 3 }}>
                          Vence: {fmtDate(t.trial_hasta)}
                        </div>
                      )}
                    </td>

                    {/* Actividad */}
                    <td style={{ ...td, textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          background: act.bg, color: act.color,
                          padding: '3px 9px', borderRadius: 100, fontSize: '.72rem', fontWeight: 700, whiteSpace: 'nowrap',
                        }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: act.dot, display: 'inline-block', flexShrink: 0 }} />
                          {act.label}
                        </span>
                        {t.last_login_at && (
                          <div style={{ fontSize: '.68rem', color: 'var(--c-text-3)' }}>
                            Login: {fmtRelativo(t.last_login_at)}
                          </div>
                        )}
                        {t.ultimo_turno_fecha && (
                          <div style={{ fontSize: '.68rem', color: 'var(--c-text-3)' }}>
                            Turno: {fmtRelativo(t.ultimo_turno_fecha)}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Plan */}
                    <td style={td}>
                      {t.plan_nombre ? (
                        <div>
                          <span style={{
                            background: 'var(--c-primary-light, #ede9fe)', color: 'var(--c-primary)',
                            padding: '2px 8px', borderRadius: 6, fontSize: '.72rem', fontWeight: 700,
                          }}>
                            {t.plan_nombre}
                          </span>
                          {t.plan_vencimiento && (
                            <div style={{ fontSize: '.68rem', color: 'var(--c-text-3)', marginTop: 3 }}>
                              Vence: {fmtDate(t.plan_vencimiento)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: '.75rem', color: 'var(--c-text-3)' }}>Sin plan</span>
                      )}
                    </td>

                    {/* Profesionales */}
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ fontWeight: 600 }}>{t.total_profesionales ?? 0}</span>
                    </td>

                    {/* Pacientes */}
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ fontWeight: 600 }}>{t.total_pacientes ?? 0}</span>
                    </td>

                    {/* Turnos este mes */}
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{
                        fontWeight: 700,
                        color: (t.turnos_ultimo_mes ?? 0) > 0 ? '#16a34a' : 'var(--c-text-3)',
                      }}>
                        {t.turnos_ultimo_mes ?? 0}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button className="btn btn-sm"
                          title="Activar plan"
                          style={{ background: '#ede9fe', color: '#7c3aed', border: 'none' }}
                          onClick={() => { setPlanForm({ plan_id: 'plan_pro', ciclo: 'mensual' }); setModalPlan(t) }}>
                          ⭐
                        </button>
                        <button className="btn btn-sm btn-ghost"
                          title="Editar"
                          onClick={() => {
                            let fo = {}
                            try { fo = t.features_override ? JSON.parse(t.features_override) : {} } catch {}
                            setFormEdit({ nombre: t.nombre, notas: t.notas, estado: t.estado, trial_hasta: t.trial_hasta, features_override: fo })
                            setError(''); setModalEditar(t)
                          }}>
                          ✏️
                        </button>
                        {t.estado !== 'suspendido' ? (
                          <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#dc2626', border: 'none' }}
                            title="Suspender"
                            onClick={() => cambiarEstado(t, 'suspendido')}>
                            🔒
                          </button>
                        ) : (
                          <button className="btn btn-sm" style={{ background: '#dcfce7', color: '#16a34a', border: 'none' }}
                            title="Reactivar"
                            onClick={() => cambiarEstado(t, 'activo')}>
                            ✅
                          </button>
                        )}
                        <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#dc2626', border: 'none' }}
                          title="Eliminar cliente y todos sus datos"
                          onClick={() => setModalConfirm({ tipo: 'eliminar', tenant: t })}>
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      </> /* end tab clientes */}

      {/* ══════════════════════ TAB: REVENUE ══════════════════════ */}
      {tab === 'revenue' && (
        loadingRevenue ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--c-text-3)' }}>Cargando métricas...</div>
        ) : !revenue ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--c-text-3)' }}>
            No se pudieron cargar las métricas. Recargá la página para reintentar.
          </div>
        ) : (
          <div>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
              {[
                { label: 'MRR', value: fmtARS(revenue.mrr), icon: '📈', color: '#7c3aed', sub: 'Ingreso mensual recurrente' },
                { label: 'ARR', value: fmtARS(revenue.arr), icon: '🎯', color: '#0369a1', sub: 'Ingreso anual recurrente' },
                { label: 'Ingresos totales', value: fmtARS(revenue.total_cobrado), icon: '💰', color: '#16a34a', sub: 'Pagos aprobados' },
                { label: 'ARPU', value: fmtARS(revenue.arpu), icon: '👤', color: '#d97706', sub: 'Ingreso medio por usuario' },
              ].map(s => (
                <div key={s.label} className="card" style={{ padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: '1.4rem' }}>{s.icon}</span>
                    <div style={{ fontSize: '.75rem', color: 'var(--c-text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{s.label}</div>
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--c-text-3)', marginTop: 4 }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Distribución por plan */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
              <div className="card" style={{ padding: '20px 24px' }}>
                <h3 style={{ fontSize: '.95rem', fontWeight: 700, marginBottom: 16 }}>Distribución por plan</h3>
                {(revenue.por_plan ?? []).map(p => (
                  <div key={p.plan_id} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.84rem', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>{p.plan_nombre ?? p.plan_id}</span>
                      <span style={{ color: 'var(--c-text-3)' }}>{p.cantidad} clientes · {fmtARS(p.mrr_plan)}/mes</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 100, background: 'var(--c-surface-2)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 100,
                        background: p.plan_id === 'plan_clinica' ? '#0369a1' : p.plan_id === 'plan_pro' ? '#7c3aed' : '#0891b2',
                        width: `${revenue.mrr > 0 ? Math.round((p.mrr_plan / revenue.mrr) * 100) : 0}%`,
                        transition: 'width .5s',
                      }} />
                    </div>
                  </div>
                ))}
                {!(revenue.por_plan?.length) && (
                  <div style={{ color: 'var(--c-text-3)', fontSize: '.84rem' }}>Sin datos de planes aún</div>
                )}
              </div>

              <div className="card" style={{ padding: '20px 24px' }}>
                <h3 style={{ fontSize: '.95rem', fontWeight: 700, marginBottom: 16 }}>Métricas de conversión</h3>
                {[
                  { label: 'Clientes activos de pago', value: revenue.activos_pago ?? 0 },
                  { label: 'En período de trial', value: revenue.en_trial ?? 0 },
                  { label: 'Churn (suspendidos)', value: revenue.suspendidos ?? 0 },
                  { label: 'Total clientes registrados', value: revenue.total_clientes ?? 0 },
                ].map(m => (
                  <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--c-border)', fontSize: '.84rem' }}>
                    <span style={{ color: 'var(--c-text-2)' }}>{m.label}</span>
                    <span style={{ fontWeight: 700 }}>{m.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Últimas transacciones */}
            <div className="card" style={{ padding: '20px 24px' }}>
              <h3 style={{ fontSize: '.95rem', fontWeight: 700, marginBottom: 16 }}>Últimas transacciones</h3>
              {!(revenue.ultimas_transacciones?.length) ? (
                <div style={{ color: 'var(--c-text-3)', fontSize: '.84rem', textAlign: 'center', padding: '24px 0' }}>
                  No hay transacciones aún
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--c-border)', background: 'var(--c-surface-2)' }}>
                      {['Fecha', 'Cliente', 'Plan', 'Ciclo', 'Monto', 'Estado'].map(h => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {revenue.ultimas_transacciones.map(t => (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--c-border)' }}>
                        <td style={td}>{fmtDate(t.created_at)}</td>
                        <td style={td}>
                          <div style={{ fontSize: '.84rem', fontWeight: 600 }}>{t.nombre ?? '—'}</div>
                          <div style={{ fontSize: '.75rem', color: 'var(--c-text-3)' }}>{t.email}</div>
                        </td>
                        <td style={td}>{t.plan_nombre ?? t.plan_id ?? '—'}</td>
                        <td style={{ ...td, textTransform: 'capitalize' }}>{t.ciclo ?? '—'}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{fmtARS(t.monto)}</td>
                        <td style={td}>
                          <span style={{
                            background: t.estado === 'approved' ? '#dcfce7' : t.estado === 'pending' ? '#fef3c7' : '#fee2e2',
                            color: t.estado === 'approved' ? '#16a34a' : t.estado === 'pending' ? '#d97706' : '#dc2626',
                            padding: '2px 8px', borderRadius: 100, fontSize: '.72rem', fontWeight: 700,
                          }}>
                            {t.estado === 'approved' ? 'Aprobado' : t.estado === 'pending' ? 'Pendiente' : t.estado ?? '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )
      )}

      {/* ══════════════════════ TAB: CONFIG ══════════════════════ */}
      {tab === 'config' && (
        <div className="card" style={{ padding: '28px 32px', maxWidth: 600 }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 24 }}>⚙️ Configuración del sistema</h2>
          <form onSubmit={handleGuardarConfig} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            <div className="form-group">
              <label className="form-label">📱 Número de WhatsApp (sin + ni espacios)</label>
              <input className="form-input" value={sistemaForm.whatsapp_numero ?? ''}
                onChange={e => setSistemaForm(f => ({ ...f, whatsapp_numero: e.target.value }))}
                placeholder="5491144755339" />
              <div style={{ fontSize: '.75rem', color: 'var(--c-text-3)', marginTop: 4 }}>
                Formato: código país + código área + número. Ej: Argentina → 5491144755339
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">🔗 URL de la app</label>
              <input className="form-input" value={sistemaForm.app_url ?? ''}
                onChange={e => setSistemaForm(f => ({ ...f, app_url: e.target.value }))}
                placeholder="https://app.clingest.app" />
            </div>

            <div className="form-group">
              <label className="form-label">✅ WhatsApp activo</label>
              <select className="form-input" value={sistemaForm.whatsapp_activo ?? 'true'}
                onChange={e => setSistemaForm(f => ({ ...f, whatsapp_activo: e.target.value }))}>
                <option value="true">Sí — mostrar botones de WhatsApp</option>
                <option value="false">No — ocultar botones de WhatsApp</option>
              </select>
            </div>

            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', fontSize: '.82rem', color: '#166534' }}>
              <strong>Preview del mensaje de WhatsApp:</strong><br />
              <span style={{ marginTop: 4, display: 'block', fontStyle: 'italic' }}>
                "Hola! Quiero contratar el plan Pro de Clingest (facturación mensual). ¿Me podés ayudar?"
              </span>
            </div>

            <div className="modal-footer" style={{ padding: 0, marginTop: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={savingConfig}>
                {savingConfig ? 'Guardando...' : '💾 Guardar configuración'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Modal: Crear cliente ── */}
      {modalCrear && (
        <div className="modal-overlay">
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">➕ Nuevo cliente</span>
              <button className="btn-close" onClick={() => setModalCrear(false)}>✕</button>
            </div>
            <form onSubmit={handleCrear}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Email <span className="req">*</span></label>
                    <input className="form-input" type="email" required
                      value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="medico@clinica.com" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contraseña <span className="req">*</span></label>
                    <input className="form-input" type="text" required minLength={8}
                      value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="Mín. 8 caracteres" />
                  </div>
                </div>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Nombre del profesional</label>
                    <input className="form-input"
                      value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                      placeholder="Dra. García" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nombre del consultorio</label>
                    <input className="form-input"
                      value={form.nombre_consultorio} onChange={e => setForm(f => ({ ...f, nombre_consultorio: e.target.value }))}
                      placeholder="Consultorio García" />
                  </div>
                </div>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Estado inicial</label>
                    <select className="form-input" value={form.estado}
                      onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}>
                      <option value="activo">Activo</option>
                      <option value="trial">Trial</option>
                      <option value="suspendido">Suspendido</option>
                    </select>
                  </div>
                  {form.estado === 'trial' && (
                    <div className="form-group">
                      <label className="form-label">Días de trial</label>
                      <input className="form-input" type="number" min="1" max="365"
                        value={form.trial_dias} onChange={e => setForm(f => ({ ...f, trial_dias: e.target.value }))} />
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Notas internas</label>
                  <input className="form-input"
                    value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                    placeholder="Ej: Referido por Juan, pagó 1 mes..." />
                </div>
                {error && <div className="alert alert-danger">{error}</div>}
                <div className="alert" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)', fontSize: '.82rem' }}>
                  💡 Al crear el cliente se provisiona automáticamente su base de datos con los servicios default.
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModalCrear(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Creando...' : 'Crear cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Editar cliente ── */}
      {modalEditar && (
        <div className="modal-overlay">
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">✏️ Editar — {modalEditar.email}</span>
              <button className="btn-close" onClick={() => setModalEditar(null)}>✕</button>
            </div>
            <form onSubmit={handleEditar}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Nombre</label>
                  <input className="form-input" value={formEdit.nombre ?? ''}
                    onChange={e => setFormEdit(f => ({ ...f, nombre: e.target.value }))} />
                </div>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Estado</label>
                    <select className="form-input" value={formEdit.estado ?? 'activo'}
                      onChange={e => setFormEdit(f => ({ ...f, estado: e.target.value }))}>
                      <option value="activo">Activo</option>
                      <option value="trial">Trial</option>
                      <option value="suspendido">Suspendido</option>
                    </select>
                  </div>
                  {formEdit.estado === 'trial' && (
                    <div className="form-group">
                      <label className="form-label">Vencimiento trial</label>
                      <input className="form-input" type="date"
                        value={formEdit.trial_hasta ?? ''}
                        onChange={e => setFormEdit(f => ({ ...f, trial_hasta: e.target.value }))} />
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Nueva contraseña <span style={{ color: 'var(--c-text-3)', fontWeight: 400 }}>(opcional)</span></label>
                  <input className="form-input" type="text" minLength={8}
                    value={formEdit.password ?? ''}
                    onChange={e => setFormEdit(f => ({ ...f, password: e.target.value }))}
                    placeholder="Dejar vacío para no cambiar" />
                </div>
                <div className="form-group">
                  <label className="form-label">Notas internas</label>
                  <input className="form-input" value={formEdit.notas ?? ''}
                    onChange={e => setFormEdit(f => ({ ...f, notas: e.target.value }))} />
                </div>

                {/* ── Funciones extra (override de plan) ── */}
                <div style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--c-primary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    ⚡ Funciones adicionales (override de plan)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { key: 'crm',               label: '💬 CRM' },
                      { key: 'reportes_avanzados', label: '📊 Reportes avanzados' },
                      { key: 'insumos',            label: '📦 Insumos' },
                      { key: 'recetas_completas',  label: '📋 Recetas completas' },
                      { key: 'firma_digital',      label: '✍️ Firma digital' },
                      { key: 'recordatorios',      label: '🔔 Recordatorios' },
                      { key: 'exportar',           label: '📥 Importar/Exportar' },
                    ].map(({ key, label }) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.84rem', cursor: 'pointer', padding: '4px 0' }}>
                        <input
                          type="checkbox"
                          checked={formEdit.features_override?.[key] === true}
                          onChange={e => setFormEdit(f => ({
                            ...f,
                            features_override: { ...(f.features_override ?? {}), [key]: e.target.checked || undefined }
                          }))}
                          style={{ width: 15, height: 15 }}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div style={{ fontSize: '.73rem', color: 'var(--c-text-3)', marginTop: 10 }}>
                    Activa funciones más allá del plan contratado. Solo visible para vos.
                  </div>
                </div>

                {error && <div className="alert alert-danger">{error}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModalEditar(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Activar plan ── */}
      {modalPlan && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">⭐ Activar plan — {modalPlan.email}</span>
              <button className="btn-close" onClick={() => setModalPlan(null)}>✕</button>
            </div>
            <form onSubmit={handleActivarPlan}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '10px 14px', fontSize: '.82rem', color: '#0369a1' }}>
                  Esto cancela el plan actual (si existe) y activa el nuevo plan inmediatamente.
                  El cliente queda en estado <strong>activo</strong>.
                </div>
                <div className="form-group">
                  <label className="form-label">Plan</label>
                  <select className="form-input" value={planForm.plan_id}
                    onChange={e => setPlanForm(f => ({ ...f, plan_id: e.target.value }))}>
                    <option value="plan_pro">⭐ Pro</option>
                    <option value="plan_clinica">🏥 Clínica</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Ciclo de facturación</label>
                  <select className="form-input" value={planForm.ciclo}
                    onChange={e => setPlanForm(f => ({ ...f, ciclo: e.target.value }))}>
                    <option value="mensual">Mensual</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModalPlan(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={savingPlan}>
                  {savingPlan ? 'Activando...' : 'Activar plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmar eliminación ── */}
      {tab === 'clientes' && modalConfirm?.tipo === 'eliminar' && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">⚠️ Eliminar cliente</span>
              <button className="btn-close" onClick={() => setModalConfirm(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-danger" style={{ marginBottom: 16 }}>
                Esta acción es <strong>irreversible</strong>. Se eliminarán todos los datos del cliente:
                pacientes, turnos, pagos, historial clínico, etc.
              </div>
              <p style={{ fontSize: '.9rem' }}>
                ¿Estás seguro que querés eliminar a <strong>{modalConfirm.tenant.email}</strong>?
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModalConfirm(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleEliminar} disabled={saving}>
                {saving ? 'Eliminando...' : 'Sí, eliminar todo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const th = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: '.78rem',
  fontWeight: 700,
  color: 'var(--c-text-3)',
  textTransform: 'uppercase',
  letterSpacing: '.04em',
}

const td = {
  padding: '12px 14px',
  verticalAlign: 'middle',
  fontSize: '.875rem',
}
