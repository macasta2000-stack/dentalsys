import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, isSameWeek } from 'date-fns'
import { es } from 'date-fns/locale'

const METODO_LABEL = { efectivo:'Efectivo', transferencia:'Transferencia', tarjeta_debito:'Débito', tarjeta_credito:'Crédito', obra_social:'Obra Social', mercadopago:'MercadoPago', cheque:'Cheque', otro:'Otro' }

function fmt(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0)
}

function minutesUntil(dateStr, now) {
  return Math.round((new Date(dateStr) - now) / 60000)
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const today = new Date()
  const [turnosHoy, setTurnosHoy] = useState([])
  const [stats, setStats] = useState({ facturacion: 0, ausentes: 0 })
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(new Date())

  // Alertas del día
  const [alertas, setAlertas] = useState({ insumos: [], presupuestos: [], cumpleanos: [], deudoresConTurno: [] })
  const [alertasLoading, setAlertasLoading] = useState(true)

  // Modal cobro dashboard
  const [modalCobro, setModalCobro] = useState(false)
  const [turnoACobrar, setTurnoACobrar] = useState(null)
  const [cobroForm, setCobroForm] = useState({ monto: '', metodo_pago: 'efectivo', concepto: '', monto_os: 0, monto_copago: 0 })
  const [cobroSaving, setCobroSaving] = useState(false)
  const [cobroError, setCobroError] = useState('')

  // Cuenta regresiva: actualizar cada minuto
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const [turnos, pagos] = await Promise.all([
          api.turnos.list({ from: startOfDay(today).toISOString(), to: endOfDay(today).toISOString() }),
          api.pagos.list({ from: startOfMonth(today).toISOString(), to: endOfMonth(today).toISOString() }),
        ])
        setTurnosHoy(turnos ?? [])
        const facturacion = (pagos ?? []).reduce((s, p) => s + Number(p.monto), 0)
        const ausentes = (turnos ?? []).filter(t => t.estado === 'ausente').length
        setStats({ facturacion, ausentes })
      } finally {
        setLoading(false)
      }
    }
    load()
    loadAlertas()
  }, [])

  async function loadAlertas() {
    setAlertasLoading(true)
    try {
      const [insumos, presupuestos, pacientes, turnosHoyData] = await Promise.allSettled([
        api.insumos.list(),
        api.presupuestos.list(),
        api.pacientes.list(),
        api.turnos.list({ from: startOfDay(today).toISOString(), to: endOfDay(today).toISOString() }),
      ])

      const getVal = r => r.status === 'fulfilled' ? (r.value ?? []) : []

      // Insumos con stock bajo
      const insumosData = getVal(insumos)
      const stockBajo = insumosData.filter(i => (i.stock_actual ?? 0) <= (i.stock_minimo ?? 0) && i.activo !== 0)

      // Presupuestos vencidos sin respuesta
      const presupuestosData = getVal(presupuestos)
      const vencidos = presupuestosData.filter(p =>
        p.estado === 'pendiente' && p.fecha_vencimiento && new Date(p.fecha_vencimiento) < today
      )

      // Pacientes con cumpleaños esta semana
      const pacientesData = getVal(pacientes)
      const cumpleanos = pacientesData.filter(p => {
        if (!p.fecha_nacimiento) return false
        const fn = new Date(p.fecha_nacimiento)
        const thisYear = new Date(today.getFullYear(), fn.getMonth(), fn.getDate())
        return isSameWeek(thisYear, today, { weekStartsOn: 1 })
      })

      // Pacientes con deuda que tienen turno hoy
      const turnosData = getVal(turnosHoyData)
      const deudoresConTurno = turnosData.filter(t => (t.paciente_saldo ?? 0) < 0)

      setAlertas({ insumos: stockBajo, presupuestos: vencidos, cumpleanos, deudoresConTurno })
    } finally {
      setAlertasLoading(false)
    }
  }

  const estadoColor = { programado: 'info', confirmado: 'info', presente: 'success', completado: 'neutral', ausente: 'danger', no_asistio: 'warning', cancelado: 'neutral' }
  const estadoLabel = { programado: 'Programado', confirmado: 'Confirmado', presente: 'Presente', completado: 'Completado', ausente: 'Ausente', no_asistio: 'No asistió', cancelado: 'Cancelado' }

  async function loadTurnosHoy() {
    const turnos = await api.turnos.list({ from: startOfDay(today).toISOString(), to: endOfDay(today).toISOString() }).catch(() => [])
    setTurnosHoy(turnos ?? [])
  }

  async function cambiarEstado(turno, nuevoEstado) {
    try {
      await api.turnos.update(turno.id, { estado: nuevoEstado })
      if (nuevoEstado === 'completado') {
        setTurnoACobrar(turno)
        setCobroForm({ monto: '', metodo_pago: 'efectivo', concepto: turno.motivo || 'Consulta', monto_os: 0, monto_copago: 0 })
        setCobroError('')
        setModalCobro(true)
      }
      await loadTurnosHoy()
    } catch (e) { alert(`No se pudo cambiar el estado del turno. ${e.message}`) }
  }

  async function handleCobro(e) {
    e.preventDefault()
    if (!cobroForm.monto || Number(cobroForm.monto) <= 0) { setCobroError('El monto debe ser mayor a cero'); return }
    setCobroSaving(true); setCobroError('')
    try {
      const pagoData = {
        paciente_id: turnoACobrar.paciente_id,
        monto: Number(cobroForm.monto),
        metodo_pago: cobroForm.metodo_pago,
        concepto: cobroForm.concepto || 'Consulta',
        turno_id: turnoACobrar.id,
      }
      if (cobroForm.metodo_pago === 'obra_social') {
        pagoData.monto_os = Number(cobroForm.monto_os) || 0
        pagoData.monto_copago = Number(cobroForm.monto_copago) || 0
      }
      await api.pagos.create(pagoData)
      setModalCobro(false)
      setTurnoACobrar(null)
    } catch (e) { setCobroError(`No se pudo registrar el pago. Verificá que el monto sea mayor a cero.`) }
    finally { setCobroSaving(false) }
  }

  const nextTurno = turnosHoy.find(t => new Date(t.fecha_hora) > now && !['cancelado','ausente','completado'].includes(t.estado))
  const minutos = nextTurno ? minutesUntil(nextTurno.fecha_hora, now) : null

  const totalAlertas = alertas.insumos.length + alertas.presupuestos.length + alertas.cumpleanos.length + alertas.deudoresConTurno.length

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">{format(today, "EEEE d 'de' MMMM", { locale: es })}</div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Turnos hoy</div>
          <div className="stat-value primary">{loading ? '—' : turnosHoy.length}</div>
          <div className="stat-sub">{turnosHoy.filter(t => t.estado === 'completado').length} completados</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Facturación del mes</div>
          <div className="stat-value success">{loading ? '—' : fmt(stats.facturacion)}</div>
          <div className="stat-sub">{format(today, 'MMMM yyyy', { locale: es })}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ausentes hoy</div>
          <div className={`stat-value ${stats.ausentes > 0 ? 'warning' : ''}`}>{loading ? '—' : stats.ausentes}</div>
          <div className="stat-sub">turnos sin presentarse</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Próximo turno</div>
          {loading ? <div className="stat-value">—</div> : nextTurno ? (
            <>
              <div className="stat-value" style={{ fontSize: '1.3rem' }}>{format(new Date(nextTurno.fecha_hora), 'HH:mm')}</div>
              <div className="stat-sub" style={{ fontWeight: 600 }}>{nextTurno.paciente_nombre}</div>
              {minutos !== null && minutos >= 0 && (
                <div className="stat-sub" style={{ color: minutos <= 15 ? 'var(--c-danger)' : minutos <= 30 ? 'var(--c-warning)' : 'var(--c-text-3)' }}>
                  {minutos === 0 ? 'Ahora mismo' : `En ${minutos} min`}
                </div>
              )}
            </>
          ) : (
            <div className="stat-value" style={{ fontSize: '1rem' }}>Sin turnos pendientes</div>
          )}
        </div>
      </div>

      {/* Panel de alertas */}
      {!alertasLoading && totalAlertas > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">⚡ Alertas del día</span>
            <span className="badge badge-danger">{totalAlertas}</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alertas.insumos.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--c-danger-bg)', borderRadius: 'var(--radius-sm)', fontSize: '.84rem' }}>
                <span>🔴</span>
                <span style={{ flex: 1 }}>
                  <strong>{alertas.insumos.length} insumo{alertas.insumos.length > 1 ? 's' : ''} con stock bajo:</strong>{' '}
                  {alertas.insumos.slice(0, 3).map(i => i.nombre).join(', ')}{alertas.insumos.length > 3 ? '...' : ''}
                </span>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: '.72rem' }} onClick={() => navigate('/insumos')}>Ver insumos →</button>
              </div>
            )}
            {alertas.presupuestos.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--c-warning-bg)', borderRadius: 'var(--radius-sm)', fontSize: '.84rem' }}>
                <span>🟡</span>
                <span style={{ flex: 1 }}>
                  <strong>{alertas.presupuestos.length} presupuesto{alertas.presupuestos.length > 1 ? 's' : ''} vencido{alertas.presupuestos.length > 1 ? 's' : ''}</strong> sin respuesta del paciente
                </span>
              </div>
            )}
            {alertas.cumpleanos.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--c-info-bg)', borderRadius: 'var(--radius-sm)', fontSize: '.84rem' }}>
                <span>🔵</span>
                <span style={{ flex: 1 }}>
                  <strong>Cumpleaños esta semana:</strong>{' '}
                  {alertas.cumpleanos.map(p => `${p.nombre} ${p.apellido}`).join(', ')}
                </span>
              </div>
            )}
            {alertas.deudoresConTurno.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#FFF7ED', border: '1px solid #F97316', borderRadius: 'var(--radius-sm)', fontSize: '.84rem' }}>
                <span>🟠</span>
                <span style={{ flex: 1 }}>
                  <strong>{alertas.deudoresConTurno.length} paciente{alertas.deudoresConTurno.length > 1 ? 's' : ''} con deuda</strong> tiene{alertas.deudoresConTurno.length > 1 ? 'n' : ''} turno hoy:{' '}
                  {alertas.deudoresConTurno.slice(0, 3).map(t => t.paciente_nombre).join(', ')}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Turnos de hoy */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📅 Turnos de hoy</span>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/agenda')}>Ver agenda →</button>
        </div>
        {loading ? (
          <div className="card-body" style={{ textAlign: 'center' }}><span className="spinner" /></div>
        ) : turnosHoy.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <div className="empty-title">Sin turnos para hoy</div>
            <button className="btn btn-primary btn-sm mt-2" onClick={() => navigate('/agenda')}>Agendar turno</button>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Paciente</th>
                  <th>Obra social</th>
                  <th>Motivo</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {turnosHoy.map(t => (
                  <tr key={t.id}>
                    <td className="td-main">{format(new Date(t.fecha_hora), 'HH:mm')}</td>
                    <td>{t.paciente_nombre}</td>
                    <td><span className="text-sm text-muted">{t.paciente_obra_social || 'Particular'}</span></td>
                    <td className="text-sm">{t.motivo || '—'}</td>
                    <td><span className={`badge badge-${estadoColor[t.estado] ?? 'neutral'}`}>{estadoLabel[t.estado] ?? t.estado}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* programado o confirmado → [Presente] [Ausente] */}
                        {(t.estado === 'programado' || t.estado === 'confirmado') && <>
                          <button className="btn btn-success btn-sm" onClick={() => cambiarEstado(t, 'presente')}>Presente</button>
                          <button className="btn btn-danger btn-sm" onClick={() => cambiarEstado(t, 'ausente')}>Ausente</button>
                        </>}
                        {/* presente → [Completar + Cobrar] */}
                        {t.estado === 'presente' && (
                          <button className="btn btn-success btn-sm" onClick={() => cambiarEstado(t, 'completado')}>Completar + Cobrar</button>
                        )}
                        {/* completado → [Ver ficha] */}
                        {t.estado === 'completado' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/pacientes/${t.paciente_id}`)}>Ver ficha</button>
                        )}
                        {t.estado === 'cancelado' && <span className="badge badge-danger">Cancelado</span>}
                        {t.estado === 'ausente' && <span className="badge badge-warning">Ausente</span>}
                        {/* siempre mostrar "Ver ficha" a menos que ya esté */}
                        {t.estado !== 'completado' && t.estado !== 'cancelado' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/pacientes/${t.paciente_id}`)}>Ver ficha</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal cobro desde dashboard */}
      {modalCobro && turnoACobrar && (
        <div className="modal-overlay" onClick={() => setModalCobro(false)}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Cobrar turno</span>
              <button className="btn-close" onClick={() => setModalCobro(false)}>✕</button>
            </div>
            <form onSubmit={handleCobro}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="alert alert-info" style={{ fontSize: '.82rem' }}>
                  Paciente: <strong>{turnoACobrar.paciente_nombre}</strong>
                  {turnoACobrar.motivo && <> — {turnoACobrar.motivo}</>}
                </div>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Monto total <span className="req">*</span></label>
                    <input className="form-input" type="number" min="0" required value={cobroForm.monto}
                      onChange={e => setCobroForm(f => ({ ...f, monto: e.target.value }))} placeholder="$0" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Método de pago</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {[['efectivo','Efectivo'],['transferencia','Transf.'],['tarjeta_debito','Débito'],['tarjeta_credito','Crédito'],['obra_social','OS']].map(([val,lbl]) => (
                        <button key={val} type="button" className={`btn btn-sm ${cobroForm.metodo_pago === val ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={() => setCobroForm(f => ({ ...f, metodo_pago: val }))}>{lbl}</button>
                      ))}
                    </div>
                  </div>
                </div>
                {cobroForm.metodo_pago === 'obra_social' && (
                  <div className="form-row cols-2">
                    <div className="form-group">
                      <label className="form-label">Monto Obra Social</label>
                      <input className="form-input" type="number" min="0" value={cobroForm.monto_os}
                        onChange={e => setCobroForm(f => ({ ...f, monto_os: e.target.value }))} placeholder="$0" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Copago del paciente</label>
                      <input className="form-input" type="number" min="0" value={cobroForm.monto_copago}
                        onChange={e => setCobroForm(f => ({ ...f, monto_copago: e.target.value }))} placeholder="$0" />
                    </div>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Concepto</label>
                  <input className="form-input" value={cobroForm.concepto}
                    onChange={e => setCobroForm(f => ({ ...f, concepto: e.target.value }))} placeholder="Descripción del cobro" />
                </div>
                {cobroError && <div className="alert alert-danger">{cobroError}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModalCobro(false)}>Omitir por ahora</button>
                <button type="submit" className="btn btn-success" disabled={cobroSaving}>
                  {cobroSaving ? 'Registrando...' : 'Registrar cobro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
