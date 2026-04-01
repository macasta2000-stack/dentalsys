import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useRoleAccess } from '../hooks/useRoleAccess'
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, isSameWeek, addDays, startOfWeek, endOfWeek, isSameDay, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const toYMD = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

const METODO_LABEL = { efectivo:'Efectivo', transferencia:'Transferencia', tarjeta_debito:'Débito', tarjeta_credito:'Crédito', obra_social:'Obra Social', cheque:'Cheque', otro:'Otro' }

function fmt(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0)
}

function minutesUntil(dateStr, now) {
  return Math.round((new Date(dateStr) - now) / 60000)
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const addToast = useToast()
  const { user } = useAuth()
  const { canAccess } = useRoleAccess()
  const isProfesional = user?.rol === 'profesional'
  const isRecepcionista = user?.rol === 'recepcionista'
  const puedeVerFacturacion = !isRecepcionista   // recepcionista NO ve facturación
  const today = new Date()
  const [turnosHoy, setTurnosHoy] = useState([])
  const [proximosTurnos, setProximosTurnos] = useState([])
  const [stats, setStats] = useState({ facturacion: 0, ausentes: 0 })
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(new Date())
  const [turnosSemana, setTurnosSemana] = useState([])

  // Alertas del día
  const [alertas, setAlertas] = useState({ insumos: [], presupuestos: [], cumpleanos: [], deudoresConTurno: [] })
  const [alertasLoading, setAlertasLoading] = useState(true)

  // NPS
  const [npsData, setNpsData] = useState(null)

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
    if (!user) return   // Esperar a que el user esté disponible

    async function load() {
      // Leer el rol directamente del user dentro del efecto para evitar stale closures
      const rol = user.rol
      const esProfesional = rol === 'profesional'
      const esRecepcionista = rol === 'recepcionista'

      try {
        const weekFrom = startOfWeek(today, { weekStartsOn: 1 })
        const weekTo = endOfWeek(today, { weekStartsOn: 1 })
        const mesFrom = toYMD(startOfMonth(today))
        const mesTo = toYMD(endOfMonth(today))

        // Paralelizar todas las llamadas para reducir tiempo de carga
        const [turnos, proximosFetch, semanaFetch, turnosMes, pagosData] = await Promise.all([
          api.turnos.list({ from: toYMD(startOfDay(today)), to: toYMD(endOfDay(today)) }).catch(() => []),
          api.turnos.list({ from: toYMD(today), to: toYMD(addDays(today, 7)) }).catch(() => []),
          api.turnos.list({ from: toYMD(weekFrom), to: toYMD(weekTo) }).catch(() => []),
          esProfesional
            ? api.turnos.list({ from: mesFrom, to: mesTo }).catch(() => [])
            : Promise.resolve([]),
          !esRecepcionista
            ? api.pagos.list({ from: mesFrom, to: mesTo }).catch(() => [])
            : Promise.resolve([]),
        ])

        setTurnosHoy(turnos ?? [])
        setProximosTurnos(proximosFetch ?? [])
        setTurnosSemana(semanaFetch ?? [])
        const ausentes = (turnos ?? []).filter(t => t.estado === 'ausente').length

        let facturacion = 0
        if (esProfesional) {
          const misTurnoIds = new Set((turnosMes ?? []).map(t => t.id))
          facturacion = (pagosData ?? [])
            .filter(p => p.turno_id && misTurnoIds.has(p.turno_id))
            .reduce((s, p) => s + Number(p.monto), 0)
        } else if (!esRecepcionista) {
          facturacion = (pagosData ?? []).reduce((s, p) => s + Number(p.monto), 0)
        }

        setStats({ facturacion, ausentes })
      } catch (e) {
        console.error('[Dashboard] Error cargando datos:', e?.message)
      } finally {
        setLoading(false)
      }
    }
    load()
    loadAlertas()
    // NPS solo para dueño/admin
    if (user?.rol === 'tenant' || user?.rol === 'admin' || user?.rol === 'superadmin') {
      api.encuestas.resumen().then(setNpsData).catch(() => {})
    }
  }, [user?.rol])   // Re-ejecutar si cambia el rol

  async function loadAlertas() {
    setAlertasLoading(true)
    // Only fetch restricted resources for roles that have access
    const puedeVerInsumos = canAccess('insumos')
    const puedeVerReportes = canAccess('reportes')
    try {
      const [insumos, presupuestos, pacientes, turnosHoyData] = await Promise.allSettled([
        puedeVerInsumos ? api.insumos.list() : Promise.resolve([]),
        puedeVerReportes ? api.presupuestos.list() : Promise.resolve([]),
        api.pacientes.list(),
        api.turnos.list({ from: toYMD(startOfDay(today)), to: toYMD(endOfDay(today)) }),
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
    const [turnos, proximos] = await Promise.all([
      api.turnos.list({ from: toYMD(startOfDay(today)), to: toYMD(endOfDay(today)) }).catch(() => []),
      api.turnos.list({ from: toYMD(today), to: toYMD(addDays(today, 7)) }).catch(() => []),
    ])
    setTurnosHoy(turnos ?? [])
    setProximosTurnos(proximos ?? [])
  }

  // Solo el dueño/admin puede cobrar — recepcionistas y profesionales solo cambian estado
  const puedeECobrar = user?.rol === 'tenant' || user?.rol === 'admin' || user?.rol === 'superadmin'

  async function cambiarEstado(turno, nuevoEstado) {
    try {
      const updated = await api.turnos.update(turno.id, { estado: nuevoEstado })
      // Modal de cobro: solo para roles con acceso a caja
      if (puedeECobrar && (nuevoEstado === 'presente' || nuevoEstado === 'completado')) {
        setTurnoACobrar({ ...turno, ...updated })
        setCobroForm({ monto: '', metodo_pago: 'efectivo', concepto: turno.motivo || 'Consulta', monto_os: 0, monto_copago: 0 })
        setCobroError('')
        setModalCobro(true)
      }
      await loadTurnosHoy()
    } catch (e) { addToast(`No se pudo cambiar el estado del turno. ${e.message}`, 'error') }
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
      // Si el turno quedó en "presente", marcarlo como completado
      if (turnoACobrar.estado === 'presente') {
        await api.turnos.update(turnoACobrar.id, { estado: 'completado' }).catch(() => {})
      }
      setModalCobro(false)
      setTurnoACobrar(null)
      await loadTurnosHoy()
    } catch (e) { setCobroError(`No se pudo registrar el pago. Verificá que el monto sea mayor a cero.`) }
    finally { setCobroSaving(false) }
  }

  const nextTurno = proximosTurnos.find(t => new Date(t.fecha_hora) > now && !['cancelado','ausente','completado'].includes(t.estado))
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
        {puedeVerFacturacion && (
          <div className="stat-card">
            <div className="stat-label">
              {isProfesional ? 'Mi facturación del mes' : 'Facturación del mes'}
            </div>
            <div className="stat-value success">{loading ? '—' : fmt(stats.facturacion)}</div>
            <div className="stat-sub">
              {format(today, 'MMMM yyyy', { locale: es })}
              {isProfesional && <span style={{ display: 'block', fontSize: '.72rem', color: 'var(--c-text-3)', marginTop: 2 }}>Solo tus turnos</span>}
            </div>
          </div>
        )}
        <div className="stat-card">
          <div className="stat-label">Ausentes hoy</div>
          <div className={`stat-value ${stats.ausentes > 0 ? 'warning' : ''}`}>{loading ? '—' : stats.ausentes}</div>
          <div className="stat-sub">turnos sin presentarse</div>
        </div>
        {npsData !== null && (
          <div className="stat-card">
            <div className="stat-label">Satisfacción (NPS)</div>
            <div className={`stat-value ${npsData.nps_score === null ? '' : npsData.nps_score >= 50 ? 'success' : npsData.nps_score >= 0 ? 'warning' : 'danger'}`}>
              {npsData.nps_score === null ? '—' : npsData.nps_score}
            </div>
            <div className="stat-sub">
              {npsData.total_respondidas} respuestas · {npsData.tasa_respuesta}% tasa
            </div>
          </div>
        )}
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

      {/* Gráfico de turnos de la semana */}
      {(() => {
        const weekFrom = startOfWeek(today, { weekStartsOn: 1 })
        const days = Array.from({ length: 7 }, (_, i) => addDays(weekFrom, i))
        const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
        const data = days.map((d, i) => ({
          dia: DAY_LABELS[i],
          total: turnosSemana.filter(t => isSameDay(parseISO(t.fecha_hora), d)).length,
          isToday: isSameDay(d, today),
        }))
        return (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title">Turnos de la semana</span>
              <span className="text-sm text-muted">{format(weekFrom, "d MMM", { locale: es })} — {format(addDays(weekFrom, 6), "d MMM", { locale: es })}</span>
            </div>
            <div className="card-body" style={{ paddingTop: 8 }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}><span className="spinner" /></div>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <XAxis dataKey="dia" tick={{ fontSize: 12, fill: 'var(--c-text-3)' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--c-text-3)' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 8, fontSize: '.82rem' }}
                      formatter={(v) => [v, 'Turnos']}
                      labelStyle={{ fontWeight: 700, color: 'var(--c-text)' }}
                    />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={40}>
                      {data.map((entry, i) => (
                        <Cell key={i} fill={entry.isToday ? 'var(--c-primary, #0EA5E9)' : '#BAE6FD'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              <div style={{ fontSize: '.72rem', color: 'var(--c-text-3)', textAlign: 'center', marginTop: 4 }}>
                Barra azul oscuro = hoy
                {isProfesional && ' · Solo tus turnos'}
              </div>
            </div>
          </div>
        )
      })()}

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
                {canAccess('insumos') && (
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '.72rem' }} onClick={() => navigate('/insumos')}>Ver insumos →</button>
                )}
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
        <div className="modal-overlay">
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
                  {turnoACobrar.sesiones_autorizadas && (
                    <div style={{ marginTop: 6, fontWeight: 700, color: '#1D4ED8' }}>
                      Sesión {turnoACobrar.sesion_numero ?? '?'} de {turnoACobrar.sesiones_autorizadas} autorizadas
                      {turnoACobrar.sesion_numero >= turnoACobrar.sesiones_autorizadas && (
                        <span style={{ marginLeft: 8, color: '#DC2626' }}>⚠ Última sesión autorizada</span>
                      )}
                    </div>
                  )}
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
                    onChange={e => setCobroForm(f => ({ ...f, concepto: e.target.value }))} placeholder="" />
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
