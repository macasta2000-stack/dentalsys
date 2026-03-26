import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0)

export default function CajaPage() {
  const [range, setRange] = useState('hoy')
  const [pagos, setPagos] = useState([])
  const [loading, setLoading] = useState(true)
  const [monthlyData, setMonthlyData] = useState([])

  const rangeParams = () => {
    const now = new Date()
    if (range === 'hoy') return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() }
    if (range === 'mes') return { from: startOfMonth(now).toISOString(), to: endOfMonth(now).toISOString() }
    if (range === 'mes_ant') {
      const prev = subMonths(now, 1)
      return { from: startOfMonth(prev).toISOString(), to: endOfMonth(prev).toISOString() }
    }
    return {}
  }

  useEffect(() => { loadPagos() }, [range])
  useEffect(() => { loadMonthly() }, [])

  async function loadPagos() {
    setLoading(true)
    const data = await api.pagos.list(rangeParams()).catch(() => [])
    setPagos(data ?? [])
    setLoading(false)
  }

  async function loadMonthly() {
    const now = new Date()
    const months = Array.from({ length: 6 }, (_, i) => subMonths(now, 5 - i))
    const results = await Promise.all(months.map(m =>
      api.pagos.list({ from: startOfMonth(m).toISOString(), to: endOfMonth(m).toISOString() })
        .then(ps => ({ mes: format(m, 'MMM', { locale: es }), total: (ps ?? []).reduce((s, p) => s + Number(p.monto), 0) }))
        .catch(() => ({ mes: format(m, 'MMM', { locale: es }), total: 0 }))
    ))
    setMonthlyData(results)
  }

  const total = pagos.reduce((s, p) => s + Number(p.monto), 0)
  const porMetodo = pagos.reduce((acc, p) => {
    acc[p.metodo_pago] = (acc[p.metodo_pago] ?? 0) + Number(p.monto)
    return acc
  }, {})

  const METODO_LABEL = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta_debito: 'Débito', tarjeta_credito: 'Crédito', obra_social: 'Obra Social', mercadopago: 'MercadoPago', cheque: 'Cheque', otro: 'Otro' }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Caja</div>
        <div className="page-actions">
          {['hoy', 'mes', 'mes_ant'].map(r => (
            <button key={r} className={`btn btn-sm ${range === r ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setRange(r)}>
              {r === 'hoy' ? 'Hoy' : r === 'mes' ? 'Este mes' : 'Mes anterior'}
            </button>
          ))}
        </div>
      </div>

      {/* Totales */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Total {range === 'hoy' ? 'hoy' : range === 'mes' ? 'este mes' : 'mes anterior'}</div>
          <div className="stat-value success">{loading ? '—' : fmt(total)}</div>
          <div className="stat-sub">{pagos.length} cobros</div>
        </div>
        {Object.entries(porMetodo).map(([m, v]) => (
          <div key={m} className="stat-card">
            <div className="stat-label">{METODO_LABEL[m] ?? m}</div>
            <div className="stat-value">{fmt(v)}</div>
            <div className="stat-sub">{total > 0 ? ((v / total) * 100).toFixed(0) : 0}% del total</div>
          </div>
        ))}
      </div>

      {/* Gráfico últimos 6 meses */}
      <div className="card mb-4">
        <div className="card-header"><span className="card-title">📊 Facturación últimos 6 meses</span></div>
        <div className="card-body" style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => fmt(v)} />
              <Bar dataKey="total" fill="var(--c-primary)" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Listado */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Movimientos</span>
          <span className="text-sm text-muted">{pagos.length} registros</span>
        </div>
        {loading ? (
          <div className="card-body" style={{ textAlign: 'center' }}><span className="spinner" /></div>
        ) : pagos.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">💵</div><div className="empty-title">Sin cobros en este período</div></div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>Hora</th><th>Paciente</th><th>Concepto</th><th>Método</th><th style={{ textAlign: 'right' }}>Monto</th></tr>
              </thead>
              <tbody>
                {pagos.map(p => (
                  <tr key={p.id}>
                    <td className="text-sm text-muted">{format(new Date(p.fecha), 'HH:mm')}</td>
                    <td className="td-main">{p.paciente_nombre ?? '—'}</td>
                    <td className="text-sm">{p.concepto || '—'}</td>
                    <td><span className="badge badge-neutral">{METODO_LABEL[p.metodo_pago] ?? p.metodo_pago}</span></td>
                    <td style={{ textAlign: 'right' }} className="font-semibold">{fmt(p.monto)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--c-text)' }}>TOTAL</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--c-success)' }}>{fmt(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
