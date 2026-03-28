import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0)

const METODO_LABEL = {
  efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta_debito: 'Débito',
  tarjeta_credito: 'Crédito', obra_social: 'Obra Social', mercadopago: 'MercadoPago',
  cheque: 'Cheque', otro: 'Otro'
}

export default function CajaPage() {
  const [range, setRange] = useState('hoy')
  const [pagos, setPagos] = useState([])
  const [loading, setLoading] = useState(true)
  const [monthlyData, setMonthlyData] = useState([])
  const [deudores, setDeudores] = useState([])
  const [filtroOS, setFiltroOS] = useState('')
  const [tabCaja, setTabCaja] = useState('movimientos') // 'movimientos' | 'deudores'

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
  useEffect(() => { loadMonthly(); loadDeudores() }, [])

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
        .then(ps => ({
          mes: format(m, 'MMM', { locale: es }),
          total: (ps ?? []).reduce((s, p) => s + Number(p.monto), 0),
          os: (ps ?? []).filter(p => p.metodo_pago === 'obra_social').reduce((s, p) => s + Number(p.monto), 0),
        }))
        .catch(() => ({ mes: format(m, 'MMM', { locale: es }), total: 0, os: 0 }))
    ))
    setMonthlyData(results)
  }

  async function loadDeudores() {
    // Obtener pacientes con saldo negativo
    try {
      const pacs = await api.pacientes.list('')
      setDeudores((pacs ?? []).filter(p => (p.saldo ?? 0) < 0))
    } catch {}
  }

  // Filtrar pagos
  const pagosFiltrados = pagos.filter(p => {
    if (!filtroOS) return true
    if (filtroOS === '_sin_os') return p.metodo_pago !== 'obra_social'
    if (filtroOS === '_con_os') return p.metodo_pago === 'obra_social'
    return (p.paciente_obra_social ?? '') === filtroOS || (p.concepto ?? '').includes(filtroOS)
  })

  const total = pagosFiltrados.reduce((s, p) => s + Number(p.monto), 0)
  const totalParticular = pagosFiltrados.filter(p => p.metodo_pago !== 'obra_social').reduce((s, p) => s + Number(p.monto), 0)
  const totalOS = pagosFiltrados.filter(p => p.metodo_pago === 'obra_social').reduce((s, p) => s + Number(p.monto_os ?? p.monto), 0)
  const totalCopago = pagosFiltrados.filter(p => p.metodo_pago === 'obra_social').reduce((s, p) => s + Number(p.monto_copago ?? 0), 0)

  const porMetodo = pagosFiltrados.reduce((acc, p) => {
    acc[p.metodo_pago] = (acc[p.metodo_pago] ?? 0) + Number(p.monto)
    return acc
  }, {})

  // Obras sociales únicas en los pagos
  const obrasDistintas = [...new Set(pagos.filter(p => p.metodo_pago === 'obra_social').map(p => p.paciente_obra_social).filter(Boolean))]

  function handleCierreDeCaja() {
    window.print()
  }

  return (
    <div>
      {/* CSS para impresión del cierre de caja */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-show { display: block !important; }
        }
        @media screen {
          .print-show { display: none; }
        }
      `}</style>

      <div className="page-header no-print">
        <div className="page-title">Caja</div>
        <div className="page-actions">
          {['hoy', 'mes', 'mes_ant'].map(r => (
            <button key={r} className={`btn btn-sm ${range === r ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setRange(r)}>
              {r === 'hoy' ? 'Hoy' : r === 'mes' ? 'Este mes' : 'Mes anterior'}
            </button>
          ))}
          <button className="btn btn-secondary btn-sm" onClick={handleCierreDeCaja}>Cierre de caja</button>
        </div>
      </div>

      {/* Encabezado de cierre de caja para impresión */}
      <div className="print-show" style={{ padding: 20 }}>
        <h1 style={{ fontFamily: 'serif', fontSize: '1.4rem', marginBottom: 4 }}>Cierre de Caja</h1>
        <p>{format(new Date(), "EEEE d 'de' MMMM yyyy", { locale: es })}</p>
        <hr style={{ margin: '12px 0' }} />
      </div>

      {/* Totales resumen */}
      <div className="stats-grid no-print" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Total {range === 'hoy' ? 'hoy' : range === 'mes' ? 'este mes' : 'mes anterior'}</div>
          <div className="stat-value success">{loading ? '—' : fmt(total)}</div>
          <div className="stat-sub">{pagosFiltrados.length} cobros</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Particular</div>
          <div className="stat-value primary">{loading ? '—' : fmt(totalParticular)}</div>
          <div className="stat-sub">Sin obra social</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Obra Social</div>
          <div className="stat-value">{loading ? '—' : fmt(totalOS)}</div>
          <div className="stat-sub">Cobro a OS</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Copago</div>
          <div className="stat-value">{loading ? '—' : fmt(totalCopago)}</div>
          <div className="stat-sub">Pago del paciente</div>
        </div>
        {deudores.length > 0 && (
          <div className="stat-card" style={{ borderColor: 'var(--c-danger)', cursor: 'pointer' }} onClick={() => setTabCaja('deudores')}>
            <div className="stat-label" style={{ color: 'var(--c-danger)' }}>Deudores</div>
            <div className="stat-value danger">{deudores.length}</div>
            <div className="stat-sub">{fmt(Math.abs(deudores.reduce((s, p) => s + (p.saldo ?? 0), 0)))}</div>
          </div>
        )}
      </div>

      {/* Por método (resumen) */}
      {!loading && Object.keys(porMetodo).length > 0 && (
        <div className="stats-grid no-print" style={{ marginBottom: 20 }}>
          {Object.entries(porMetodo).map(([m, v]) => (
            <div key={m} className="stat-card">
              <div className="stat-label">{METODO_LABEL[m] ?? m}</div>
              <div className="stat-value" style={{ fontSize: '1.3rem' }}>{fmt(v)}</div>
              <div className="stat-sub">{total > 0 ? ((v / total) * 100).toFixed(0) : 0}% del total</div>
            </div>
          ))}
        </div>
      )}

      {/* Gráfico */}
      <div className="card mb-4 no-print">
        <div className="card-header"><span className="card-title">Facturación últimos 6 meses</span></div>
        <div className="card-body" style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => fmt(v)} />
              <Bar dataKey="total" name="Total" fill="var(--c-primary)" radius={[4,4,0,0]} />
              <Bar dataKey="os" name="OS" fill="var(--c-success)" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabs listado / deudores */}
      <div className="tabs no-print">
        <button className={`tab-btn${tabCaja === 'movimientos' ? ' active' : ''}`} onClick={() => setTabCaja('movimientos')}>Movimientos</button>
        <button className={`tab-btn${tabCaja === 'deudores' ? ' active' : ''}`} onClick={() => setTabCaja('deudores')}>
          Deudores {deudores.length > 0 && <span className="badge badge-danger" style={{ marginLeft: 4 }}>{deudores.length}</span>}
        </button>
      </div>

      {/* Listado de movimientos */}
      {tabCaja === 'movimientos' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Movimientos</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {/* Filtro por OS */}
              {obrasDistintas.length > 0 && (
                <select className="form-input" style={{ maxWidth: 200, padding: '5px 10px', fontSize: '.8rem' }}
                  value={filtroOS} onChange={e => setFiltroOS(e.target.value)}>
                  <option value="">Todos los pagos</option>
                  <option value="_sin_os">Sólo particulares</option>
                  <option value="_con_os">Sólo Obra Social</option>
                  {obrasDistintas.map(os => <option key={os} value={os}>{os}</option>)}
                </select>
              )}
              <span className="text-sm text-muted">{pagosFiltrados.length} registros</span>
            </div>
          </div>

          {loading ? (
            <div className="card-body" style={{ textAlign: 'center' }}><span className="spinner" /></div>
          ) : pagosFiltrados.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">💵</div><div className="empty-title">Sin cobros en este período</div></div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Paciente</th>
                    <th>Concepto</th>
                    <th>Método</th>
                    <th style={{ textAlign: 'right' }}>Particular</th>
                    <th style={{ textAlign: 'right' }}>OS</th>
                    <th style={{ textAlign: 'right' }}>Copago</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pagosFiltrados.map(p => {
                    const esOS = p.metodo_pago === 'obra_social'
                    const montoOS = esOS ? Number(p.monto_os ?? p.monto) : 0
                    const montoCopago = esOS ? Number(p.monto_copago ?? 0) : 0
                    const montoParticular = !esOS ? Number(p.monto) : 0
                    return (
                      <tr key={p.id}>
                        <td className="text-sm text-muted">{format(new Date(p.fecha), 'HH:mm')}</td>
                        <td className="td-main">{p.paciente_nombre ?? '—'}</td>
                        <td className="text-sm">{p.concepto || '—'}</td>
                        <td><span className="badge badge-neutral">{METODO_LABEL[p.metodo_pago] ?? p.metodo_pago}</span></td>
                        <td style={{ textAlign: 'right' }} className="text-sm">{montoParticular > 0 ? fmt(montoParticular) : '—'}</td>
                        <td style={{ textAlign: 'right' }} className="text-sm">{montoOS > 0 ? fmt(montoOS) : '—'}</td>
                        <td style={{ textAlign: 'right' }} className="text-sm">{montoCopago > 0 ? fmt(montoCopago) : '—'}</td>
                        <td style={{ textAlign: 'right' }} className="font-semibold">{fmt(p.monto)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--c-text)' }}>TOTALES</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>{fmt(totalParticular)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>{fmt(totalOS)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>{fmt(totalCopago)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--c-success)' }}>{fmt(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Deudores */}
      {tabCaja === 'deudores' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Pacientes con saldo negativo</span>
            <span className="text-sm text-muted">Deuda total: {fmt(Math.abs(deudores.reduce((s, p) => s + (p.saldo ?? 0), 0)))}</span>
          </div>
          {deudores.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">✅</div><div className="empty-title">Sin deudores</div></div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Paciente</th><th>Obra Social</th><th>Teléfono</th><th style={{ textAlign: 'right' }}>Deuda</th></tr></thead>
                <tbody>
                  {deudores.sort((a, b) => (a.saldo ?? 0) - (b.saldo ?? 0)).map(p => (
                    <tr key={p.id}>
                      <td className="td-main">{p.apellido}, {p.nombre}</td>
                      <td className="text-sm">{p.obra_social || <span className="text-muted">Particular</span>}</td>
                      <td className="text-sm">{p.telefono || '—'}</td>
                      <td style={{ textAlign: 'right' }} className="font-semibold text-danger">{fmt(Math.abs(p.saldo ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
