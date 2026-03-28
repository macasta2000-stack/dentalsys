import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'

const METODO_LABEL = { efectivo:'Efectivo', transferencia:'Transferencia', tarjeta_debito:'Débito', tarjeta_credito:'Crédito', obra_social:'Obra Social', mercadopago:'MercadoPago', cheque:'Cheque', otro:'Otro' }

function fmt(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0)
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const today = new Date()
  const [turnosHoy, setTurnosHoy] = useState([])
  const [stats, setStats] = useState({ facturacion: 0, pacientesNuevos: 0, ausentes: 0 })
  const [loading, setLoading] = useState(true)

  // Modal cobro dashboard
  const [modalCobro, setModalCobro] = useState(false)
  const [turnoACobrar, setTurnoACobrar] = useState(null)
  const [cobroForm, setCobroForm] = useState({ monto: '', metodo_pago: 'efectivo', concepto: '', monto_os: 0, monto_copago: 0 })
  const [cobroSaving, setCobroSaving] = useState(false)
  const [cobroError, setCobroError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [turnos, pagos] = await Promise.all([
          api.turnos.list({
            from: startOfDay(today).toISOString(),
            to: endOfDay(today).toISOString(),
          }),
          api.pagos.list({
            from: startOfMonth(today).toISOString(),
            to: endOfMonth(today).toISOString(),
          }),
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
  }, [])

  const estadoColor = { programado: 'info', confirmado: 'info', presente: 'success', completado: 'neutral', ausente: 'danger', no_asistio: 'warning', cancelado: 'neutral' }
  const estadoLabel = { programado: 'Programado', confirmado: 'Confirmado', presente: 'Presente', completado: 'Completado', ausente: 'Ausente', no_asistio: 'No asistió', cancelado: 'Cancelado' }

  async function loadTurnosHoy() {
    const turnos = await api.turnos.list({
      from: startOfDay(today).toISOString(),
      to: endOfDay(today).toISOString(),
    }).catch(() => [])
    setTurnosHoy(turnos ?? [])
  }

  async function cambiarEstadoTurno(turno, nuevoEstado) {
    try {
      await api.turnos.update(turno.id, { estado: nuevoEstado })
      if (nuevoEstado === 'completado') {
        // abrir modal de cobro
        setTurnoACobrar(turno)
        setCobroForm({ monto: '', metodo_pago: 'efectivo', concepto: turno.motivo || 'Consulta', monto_os: 0, monto_copago: 0 })
        setCobroError('')
        setModalCobro(true)
      }
      await loadTurnosHoy()
    } catch (e) { alert(e.message) }
  }

  async function handleCobro(e) {
    e.preventDefault()
    if (!cobroForm.monto || Number(cobroForm.monto) <= 0) { setCobroError('Ingresá un monto válido'); return }
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
    } catch (e) { setCobroError(e.message) }
    finally { setCobroSaving(false) }
  }

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
          {loading ? <div className="stat-value">—</div> : (() => {
            const next = turnosHoy.find(t => new Date(t.fecha_hora) > new Date() && t.estado !== 'cancelado')
            if (!next) return <div className="stat-value" style={{ fontSize: '1rem' }}>Sin turnos pendientes</div>
            return <>
              <div className="stat-value" style={{ fontSize: '1.3rem' }}>{format(new Date(next.fecha_hora), 'HH:mm')}</div>
              <div className="stat-sub">{next.paciente_nombre}</div>
            </>
          })()}
        </div>
      </div>

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
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {t.estado === 'programado' && <>
                          <button className="btn btn-success btn-sm" onClick={() => cambiarEstadoTurno(t, 'confirmado')}>Confirmar</button>
                          <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('¿Cancelar este turno?')) cambiarEstadoTurno(t, 'cancelado') }}>Cancelar</button>
                        </>}
                        {t.estado === 'confirmado' && <>
                          <button className="btn btn-success btn-sm" onClick={() => cambiarEstadoTurno(t, 'completado')}>Presente ✓</button>
                          <button className="btn btn-sm" style={{ background: 'var(--c-warning-bg)', color: 'var(--c-warning)', border: '1px solid #FCD34D' }} onClick={() => cambiarEstadoTurno(t, 'no_asistio')}>No asistió</button>
                        </>}
                        {t.estado === 'completado' && <span className="badge badge-neutral">Cobrado ✓</span>}
                        {t.estado === 'cancelado' && <span className="badge badge-danger">Cancelado</span>}
                        {t.estado === 'no_asistio' && <span className="badge badge-warning">No asistió</span>}
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/pacientes/${t.paciente_id}`)}>Ver ficha</button>
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
                    <select className="form-input" value={cobroForm.metodo_pago}
                      onChange={e => setCobroForm(f => ({ ...f, metodo_pago: e.target.value }))}>
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="tarjeta_debito">Débito</option>
                      <option value="tarjeta_credito">Crédito</option>
                      <option value="obra_social">Obra Social</option>
                      <option value="mercadopago">MercadoPago</option>
                      <option value="cheque">Cheque</option>
                    </select>
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
