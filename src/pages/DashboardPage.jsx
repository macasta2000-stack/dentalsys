import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'

function fmt(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0)
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const today = new Date()
  const [turnosHoy, setTurnosHoy] = useState([])
  const [stats, setStats] = useState({ facturacion: 0, pacientesNuevos: 0, ausentes: 0 })
  const [loading, setLoading] = useState(true)

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

  const estadoColor = { programado: 'info', confirmado: 'info', presente: 'success', completado: 'neutral', ausente: 'danger', cancelado: 'neutral' }
  const estadoLabel = { programado: 'Programado', confirmado: 'Confirmado', presente: 'Presente', completado: 'Completado', ausente: 'Ausente', cancelado: 'Cancelado' }

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
                    <td><span className={`badge badge-${estadoColor[t.estado] ?? 'neutral'}`}>{estadoLabel[t.estado]}</span></td>
                    <td>
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => navigate(`/pacientes/${t.paciente_id}`)}>Ver ficha</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
