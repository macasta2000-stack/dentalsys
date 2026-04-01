import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'

const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0)

const COLORS = ['#0369A1', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#0891B2', '#DB2777', '#65A30D']

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function downloadCSV(rows, headers, filename) {
  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(h => `"${(row[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))
  ]
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function ReportesPage() {
  const [tipo, setTipo] = useState('mensual')
  const now = new Date()
  const [anio, setAnio] = useState(now.getFullYear())
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function cargar() {
    setLoading(true); setError(''); setData(null)
    try {
      let res
      if (tipo === 'mensual') res = await api.reportes.mensual(anio, mes)
      else if (tipo === 'anual') res = await api.reportes.anual(anio)
      else if (tipo === 'prestaciones') res = await api.reportes.prestaciones(anio, mes)
      else if (tipo === 'pacientes') res = await api.reportes.pacientes(anio, mes)
      else if (tipo === 'comisiones') res = await api.reportes.comisiones(anio, mes)
      else if (tipo === 'nps') res = await api.encuestas.resumen()
      setData(res)
    } catch (e) {
      setError('No se pudo cargar el reporte: ' + e.message)
    } finally { setLoading(false) }
  }

  useEffect(() => { cargar() }, [tipo, anio, mes])

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  return (
    <div>
      <div className="page-actions" style={{ marginBottom: 20 }}>
        <div>
          <div className="page-title">Reportes</div>
          <div className="text-sm text-muted">Análisis de facturación, pacientes y prestaciones.</div>
        </div>
      </div>

      {/* Controles */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Tipo de reporte</label>
            <select className="form-input" value={tipo} onChange={e => setTipo(e.target.value)}>
              <option value="mensual">Mensual</option>
              <option value="anual">Anual (todos los meses)</option>
              <option value="prestaciones">Prestaciones</option>
              <option value="pacientes">Pacientes</option>
              <option value="comisiones">Comisiones de profesionales</option>
              <option value="nps">NPS / Satisfacción de pacientes</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Año</label>
            <select className="form-input" value={anio} onChange={e => setAnio(Number(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {tipo !== 'anual' && tipo !== 'nps' && (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Mes</label>
              <select className="form-input" value={mes} onChange={e => setMes(Number(e.target.value))}>
                {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
          )}
          <button className="btn btn-primary" onClick={cargar} disabled={loading}>
            {loading ? 'Cargando...' : 'Actualizar'}
          </button>
          {data && (
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-end' }} onClick={() => {
              if (tipo === 'mensual') {
                const rows = (data.pagos_por_metodo ?? []).map(r => ({ metodo: r.metodo_pago, cantidad: r.cantidad, total: r.total }))
                downloadCSV(rows, ['metodo', 'cantidad', 'total'], `reporte_mensual_${anio}_${String(mes).padStart(2,'0')}.csv`)
              } else if (tipo === 'anual') {
                const ingresos = data.ingresos_por_mes ?? []
                const chartData = MESES.map((m, i) => {
                  const monthStr = String(i + 1).padStart(2, '0')
                  const row = ingresos.find(r => r.mes && r.mes.slice(5, 7) === monthStr)
                  return { mes: m, total: row?.total ?? 0, cantidad: row?.cantidad ?? 0 }
                })
                downloadCSV(chartData, ['mes', 'total', 'cantidad'], `reporte_anual_${anio}.csv`)
              } else if (tipo === 'prestaciones') {
                const rows = (data.prestaciones ?? []).map(r => ({ prestacion: r.prestacion_nombre, cantidad: r.cantidad, total: r.total_facturado }))
                downloadCSV(rows, ['prestacion', 'cantidad', 'total'], `prestaciones_${anio}_${String(mes).padStart(2,'0')}.csv`)
              } else if (tipo === 'pacientes') {
                const atendidos = data.pacientes_atendidos ?? []
                downloadCSV(atendidos.map(p => ({ apellido: p.apellido, nombre: p.nombre, obra_social: p.obra_social ?? '', evoluciones: p.evoluciones ?? 0, total_facturado: p.total_facturado ?? 0, saldo: p.saldo ?? 0 })),
                  ['apellido', 'nombre', 'obra_social', 'evoluciones', 'total_facturado', 'saldo'],
                  `pacientes_${anio}_${String(mes).padStart(2,'0')}.csv`)
              }
            }}>⬇ Exportar CSV</button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 'var(--radius-sm)', padding: '10px 14px', color: '#B91C1C', marginBottom: 16 }}>{error}</div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--c-text-3)' }}>
          <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px' }} />
          Cargando reporte...
        </div>
      )}

      {data && tipo === 'mensual' && <ReporteMensual data={data} anio={anio} mes={mes} />}
      {data && tipo === 'anual' && <ReporteAnual data={data} anio={anio} />}
      {data && tipo === 'prestaciones' && <ReportePrestaciones data={data} anio={anio} mes={mes} />}
      {data && tipo === 'pacientes' && <ReportePacientes data={data} anio={anio} mes={mes} />}
      {data && tipo === 'comisiones' && <ReporteComisiones data={data} anio={anio} mes={mes} />}
      {data && tipo === 'nps' && <ReporteNPS data={data} />}

      {!loading && !error && data && tipo === 'mensual' &&
        (data.pagos_por_metodo ?? []).length === 0 &&
        (data.ingresos_por_dia ?? []).length === 0 &&
        (data.turnos_por_estado ?? []).reduce((s, r) => s + (r.cantidad ?? 0), 0) === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--c-text-3)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>📊</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Sin datos para este período</div>
          <div style={{ fontSize: '.85rem' }}>Seleccioná otro mes o registrá actividad en la agenda y caja.</div>
        </div>
      )}

      {!loading && !error && data && tipo === 'anual' &&
        (data.ingresos_por_mes ?? []).every(r => (r.total ?? 0) === 0) &&
        (data.ingresos_por_mes ?? []).length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--c-text-3)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>📊</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Sin datos para este período</div>
          <div style={{ fontSize: '.85rem' }}>Seleccioná otro mes o registrá actividad en la agenda y caja.</div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="stat-card" style={{ borderTop: `3px solid ${color ?? 'var(--c-primary)'}` }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: color ?? 'var(--c-primary)' }}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

function ReporteMensual({ data, anio, mes }) {
  const total = (data.pagos_por_metodo ?? []).reduce((s, r) => s + (r.total ?? 0), 0)
  const totalTurnos = (data.turnos_por_estado ?? []).reduce((s, r) => s + (r.cantidad ?? 0), 0)

  function exportar() {
    const rows = (data.pagos_por_metodo ?? []).map(r => ({ metodo: r.metodo_pago, cantidad: r.cantidad, total: r.total }))
    downloadCSV(rows, ['metodo', 'cantidad', 'total'], `reporte_mensual_${anio}_${String(mes).padStart(2,'0')}.csv`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPIs */}
      <div className="stats-grid">
        <StatCard label="Facturación del mes" value={fmt(total)} color="var(--c-primary)" />
        <StatCard label="Turnos del mes" value={totalTurnos} color="#16A34A" />
        <StatCard label="Pacientes nuevos" value={data.resumen?.pacientes_nuevos ?? 0} color="#7C3AED" />
        <StatCard label="Deudores" value={data.deudores?.length ?? 0} color={data.deudores?.length > 0 ? '#DC2626' : '#6B7280'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
        {/* Ingresos por día */}
        {(data.ingresos_por_dia ?? []).length > 0 && (
          <div className="card">
            <div className="card-header"><span className="card-title">Ingresos por día</span></div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.ingresos_por_dia} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
                  <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => fmt(v)} />
                  <Bar dataKey="total" fill="var(--c-primary)" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Por método de pago */}
        {(data.pagos_por_metodo ?? []).length > 0 && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Por método de pago</span>
              <button className="btn btn-ghost btn-sm" onClick={exportar}>⬇ CSV</button>
            </div>
            <div className="card-body">
              <PieChart width={300} height={200} style={{ margin: '0 auto' }}>
                <Pie data={data.pagos_por_metodo} dataKey="total" nameKey="metodo_pago" cx="50%" cy="50%" outerRadius={80}>
                  {(data.pagos_por_metodo ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => fmt(v)} />
                <Legend formatter={(v) => METODO_LABEL[v] ?? v} />
              </PieChart>
            </div>
          </div>
        )}
      </div>

      {/* Tabla desglose por método */}
      {(data.pagos_por_metodo ?? []).length > 0 && (
        <div className="card">
          <div className="card-header"><span className="card-title">Desglose por método</span></div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="table">
              <thead><tr><th>Método</th><th>Cantidad</th><th>Total</th></tr></thead>
              <tbody>
                {data.pagos_por_metodo.map((r, i) => (
                  <tr key={i}>
                    <td>{METODO_LABEL[r.metodo_pago] ?? r.metodo_pago}</td>
                    <td>{r.cantidad}</td>
                    <td style={{ fontWeight: 600, color: 'var(--c-primary)' }}>{fmt(r.total)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, background: 'var(--c-surface-2)' }}>
                  <td>TOTAL</td>
                  <td>{(data.pagos_por_metodo ?? []).reduce((s,r) => s + r.cantidad, 0)}</td>
                  <td style={{ color: 'var(--c-primary)' }}>{fmt(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top prestaciones */}
      {(data.prestaciones_top ?? []).length > 0 && (
        <div className="card">
          <div className="card-header"><span className="card-title">Prestaciones más realizadas</span></div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="table">
              <thead><tr><th>Prestación</th><th>Cantidad</th><th>Total</th></tr></thead>
              <tbody>
                {data.prestaciones_top.map((r, i) => (
                  <tr key={i}>
                    <td>{r.prestacion_nombre ?? r.prestacion_id ?? 'Sin prestación'}</td>
                    <td>{r.cantidad}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Deudores */}
      {(data.deudores ?? []).length > 0 && (
        <div className="card">
          <div className="card-header"><span className="card-title" style={{ color: 'var(--c-danger)' }}>Pacientes con deuda</span></div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="table">
              <thead><tr><th>Paciente</th><th>Deuda</th></tr></thead>
              <tbody>
                {data.deudores.map((p, i) => (
                  <tr key={i}>
                    <td><a href={`/pacientes/${p.id}`} style={{ color: 'var(--c-primary)', fontWeight: 600 }}>{p.apellido}, {p.nombre}</a></td>
                    <td style={{ color: 'var(--c-danger)', fontWeight: 700 }}>{fmt(Math.abs(p.saldo))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

const METODO_LABEL = {
  efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta_debito: 'Débito',
  tarjeta_credito: 'Crédito', obra_social: 'Obra Social',
  cheque: 'Cheque', otro: 'Otro'
}

function ReporteAnual({ data, anio }) {
  const ingresos = data.ingresos_por_mes ?? []
  const total = ingresos.reduce((s, r) => s + (r.total ?? 0), 0)

  const chartData = MESES.map((m, i) => {
    const monthStr = String(i + 1).padStart(2, '0')
    const row = ingresos.find(r => r.mes && r.mes.slice(5, 7) === monthStr)
    return { mes: m, total: row?.total ?? 0, cantidad: row?.cantidad ?? 0 }
  })

  function exportar() {
    downloadCSV(chartData, ['mes', 'total', 'cantidad'], `reporte_anual_${anio}.csv`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="stats-grid">
        <StatCard label="Facturación anual" value={fmt(total)} color="var(--c-primary)" />
        <StatCard label="Promedio mensual" value={fmt(total / 12)} color="#16A34A" />
        <StatCard label="Pacientes nuevos" value={(data.pacientes_nuevos_por_mes ?? []).reduce((s,r) => s + (r.cantidad ?? 0), 0)} color="#7C3AED" />
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Facturación mensual {anio}</span>
          <button className="btn btn-ghost btn-sm" onClick={exportar}>⬇ CSV</button>
        </div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => fmt(v)} />
              <Bar dataKey="total" fill="var(--c-primary)" radius={[3,3,0,0]} name="Facturación" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Resumen mensual</span></div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="table">
            <thead><tr><th>Mes</th><th>Cobros</th><th>Facturación</th></tr></thead>
            <tbody>
              {chartData.map((r, i) => (
                <tr key={i} style={{ opacity: r.total === 0 ? 0.4 : 1 }}>
                  <td>{r.mes}</td>
                  <td>{r.cantidad}</td>
                  <td style={{ fontWeight: r.total > 0 ? 600 : 400 }}>{r.total > 0 ? fmt(r.total) : '—'}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, background: 'var(--c-surface-2)' }}>
                <td>TOTAL {anio}</td>
                <td>{chartData.reduce((s,r) => s + r.cantidad, 0)}</td>
                <td style={{ color: 'var(--c-primary)' }}>{fmt(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ReportePrestaciones({ data, anio, mes }) {
  const rows = data.prestaciones ?? []
  const total = rows.reduce((s, r) => s + (r.total_facturado ?? 0), 0)

  function exportar() {
    downloadCSV(rows.map(r => ({ prestacion: r.prestacion_nombre, cantidad: r.cantidad, total: r.total_facturado })),
      ['prestacion', 'cantidad', 'total'],
      `prestaciones_${anio}_${String(mes).padStart(2,'0')}.csv`)
  }

  if (!rows.length) return (
    <div className="card"><div className="card-body" style={{ textAlign: 'center', padding: 40, color: 'var(--c-text-3)' }}>Sin prestaciones registradas en este período.</div></div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="stats-grid">
        <StatCard label="Prestaciones realizadas" value={rows.reduce((s,r) => s + (r.cantidad ?? 0), 0)} color="var(--c-primary)" />
        <StatCard label="Tipos distintos" value={rows.length} color="#16A34A" />
        <StatCard label="Facturación total" value={fmt(total)} color="#7C3AED" />
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Prestaciones — {MESES[mes-1]} {anio}</span>
          <button className="btn btn-ghost btn-sm" onClick={exportar}>⬇ CSV</button>
        </div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 36)}>
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="prestacion_nombre" tick={{ fontSize: 11 }} width={140} />
              <Tooltip formatter={v => fmt(v)} />
              <Bar dataKey="total_facturado" fill="var(--c-primary)" radius={[0,3,3,0]} name="Total" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table className="table">
            <thead><tr><th>Prestación</th><th>Cantidad</th><th>Total</th><th>Promedio</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{r.prestacion_nombre}</td>
                  <td>{r.cantidad}</td>
                  <td style={{ color: 'var(--c-primary)', fontWeight: 600 }}>{fmt(r.total_facturado)}</td>
                  <td style={{ color: 'var(--c-text-2)' }}>{fmt(r.total_facturado / r.cantidad)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ReportePacientes({ data, anio, mes }) {
  const atendidos = data.pacientes_atendidos ?? []
  const deudaTotal = data.deuda_total ?? 0
  const totalFacturado = atendidos.reduce((s, p) => s + (p.total_facturado ?? 0), 0)

  function exportar() {
    downloadCSV(atendidos.map(p => ({
      apellido: p.apellido, nombre: p.nombre,
      obra_social: p.obra_social ?? '',
      evoluciones: p.evoluciones ?? 0,
      total_facturado: p.total_facturado ?? 0,
      saldo: p.saldo ?? 0,
    })),
      ['apellido', 'nombre', 'obra_social', 'evoluciones', 'total_facturado', 'saldo'],
      `pacientes_${anio}_${String(mes).padStart(2,'0')}.csv`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="stats-grid">
        <StatCard label="Pacientes atendidos" value={atendidos.length} color="var(--c-primary)" />
        <StatCard label="Facturado en el período" value={fmt(totalFacturado)} color="#16A34A" />
        <StatCard label="Con deuda acumulada" value={atendidos.filter(p => (p.saldo ?? 0) < 0).length} color="#DC2626" />
        <StatCard label="Deuda total pendiente" value={fmt(Math.abs(deudaTotal))} color={deudaTotal > 0 ? '#DC2626' : '#6B7280'} />
      </div>

      {atendidos.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Pacientes atendidos — {MESES[mes-1]} {anio}</span>
            <button className="btn btn-ghost btn-sm" onClick={exportar}>⬇ CSV</button>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="table">
              <thead><tr><th>Paciente</th><th>Obra Social</th><th style={{ textAlign: 'right' }}>Evoluciones</th><th style={{ textAlign: 'right' }}>Facturado</th><th style={{ textAlign: 'right' }}>Saldo actual</th></tr></thead>
              <tbody>
                {atendidos.map((p, i) => (
                  <tr key={i}>
                    <td><a href={`/pacientes/${p.id}`} style={{ color: 'var(--c-primary)', fontWeight: 600 }}>{p.apellido}, {p.nombre}</a></td>
                    <td>{p.obra_social || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{p.evoluciones ?? 0}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--c-primary)' }}>{fmt(p.total_facturado ?? 0)}</td>
                    <td style={{ textAlign: 'right', color: (p.saldo ?? 0) < 0 ? 'var(--c-danger)' : (p.saldo ?? 0) > 0 ? '#16A34A' : 'var(--c-text-3)', fontWeight: 600 }}>
                      {(p.saldo ?? 0) < 0 ? `Debe ${fmt(Math.abs(p.saldo))}` : (p.saldo ?? 0) > 0 ? `A favor ${fmt(p.saldo)}` : 'Sin deuda'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {atendidos.length === 0 && (
        <div className="card"><div className="card-body" style={{ textAlign: 'center', padding: 40, color: 'var(--c-text-3)' }}>Sin pacientes atendidos en este período.</div></div>
      )}
    </div>
  )
}

function ReporteComisiones({ data, anio, mes }) {
  const profesionales = data.profesionales ?? []
  const totales = data.totales ?? {}

  if (!profesionales.length) return (
    <div className="card">
      <div className="card-body" style={{ textAlign: 'center', padding: 40, color: 'var(--c-text-3)' }}>
        Sin actividad de profesionales en este período.
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="stats-grid">
        <StatCard label="Profesionales activos" value={profesionales.length} color="var(--c-primary)" />
        <StatCard label="Total facturado" value={fmt(totales.total_facturado ?? 0)} color="#16A34A" />
        <StatCard label="Total comisiones" value={fmt(totales.total_comisiones ?? 0)} color="#7C3AED" />
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Comisiones — {MESES[mes-1]} {anio}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => {
            downloadCSV(profesionales.map(p => ({
              nombre: p.nombre,
              prestaciones: p.total_prestaciones ?? 0,
              facturado: p.total_facturado ?? 0,
              porcentaje: p.porcentaje_comision ?? 0,
              comision: p.comision_monto ?? 0,
            })), ['nombre','prestaciones','facturado','porcentaje','comision'],
            `comisiones_${anio}_${String(mes).padStart(2,'0')}.csv`)
          }}>⬇ CSV</button>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Profesional</th>
                <th style={{ textAlign: 'right' }}>Prestaciones</th>
                <th style={{ textAlign: 'right' }}>Facturado</th>
                <th style={{ textAlign: 'right' }}>% Comisión</th>
                <th style={{ textAlign: 'right' }}>Comisión a pagar</th>
              </tr>
            </thead>
            <tbody>
              {profesionales.map((p, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                  <td style={{ textAlign: 'right' }}>{p.total_prestaciones ?? 0}</td>
                  <td style={{ textAlign: 'right', color: 'var(--c-primary)', fontWeight: 600 }}>{fmt(p.total_facturado ?? 0)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--c-text-2)' }}>{p.porcentaje_comision ?? 0}%</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#7C3AED' }}>{fmt(p.comision_monto ?? 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--c-surface-2)' }}>
                <td>Totales</td>
                <td></td>
                <td style={{ textAlign: 'right', color: 'var(--c-primary)' }}>{fmt(totales.total_facturado ?? 0)}</td>
                <td></td>
                <td style={{ textAlign: 'right', color: '#7C3AED' }}>{fmt(totales.total_comisiones ?? 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

function ReporteNPS({ data }) {
  const score = data.nps_score ?? null
  const total = data.total_enviadas ?? 0
  const respondidas = data.total_respondidas ?? 0
  const tasa = data.tasa_respuesta ?? 0
  const promotores = data.promotores ?? 0
  const neutrales = data.neutrales ?? 0
  const detractores = data.detractores ?? 0

  const scoreColor = score === null ? '#6B7280' : score >= 50 ? '#16A34A' : score >= 0 ? '#D97706' : '#DC2626'
  const scoreLabel = score === null ? 'Sin datos' : score >= 50 ? 'Excelente' : score >= 0 ? 'Bueno' : 'Necesita mejorar'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* NPS Score destacado */}
      <div className="card">
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap', padding: 28 }}>
          <div style={{ textAlign: 'center', minWidth: 120 }}>
            <div style={{ fontSize: '3.5rem', fontWeight: 900, lineHeight: 1, color: scoreColor }}>
              {score !== null ? Math.round(score) : '—'}
            </div>
            <div style={{ fontSize: '.8rem', fontWeight: 700, color: scoreColor, marginTop: 6 }}>{scoreLabel}</div>
            <div style={{ fontSize: '.75rem', color: 'var(--c-text-3)', marginTop: 4 }}>NPS Score</div>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: '.85rem', color: 'var(--c-text-2)', marginBottom: 12, lineHeight: 1.5 }}>
              El Net Promoter Score (NPS) mide la satisfacción de tus pacientes.<br />
              <strong style={{ color: scoreColor }}>{scoreLabel}</strong>
              {score !== null && ` — Score de ${Math.round(score)} puntos`}
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center', padding: '8px 16px', background: '#D1FAE5', borderRadius: 8 }}>
                <div style={{ fontWeight: 800, fontSize: '1.3rem', color: '#065F46' }}>{promotores}</div>
                <div style={{ fontSize: '.72rem', color: '#065F46', fontWeight: 600 }}>Promotores (9-10)</div>
              </div>
              <div style={{ textAlign: 'center', padding: '8px 16px', background: '#FEF3C7', borderRadius: 8 }}>
                <div style={{ fontWeight: 800, fontSize: '1.3rem', color: '#92400E' }}>{neutrales}</div>
                <div style={{ fontSize: '.72rem', color: '#92400E', fontWeight: 600 }}>Neutrales (7-8)</div>
              </div>
              <div style={{ textAlign: 'center', padding: '8px 16px', background: '#FEE2E2', borderRadius: 8 }}>
                <div style={{ fontWeight: 800, fontSize: '1.3rem', color: '#991B1B' }}>{detractores}</div>
                <div style={{ fontSize: '.72rem', color: '#991B1B', fontWeight: 600 }}>Detractores (0-6)</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard label="Encuestas enviadas" value={total} color="var(--c-primary)" />
        <StatCard label="Respondidas" value={respondidas} color="#16A34A" sub={`${Math.round(tasa * 100)}% tasa`} />
        <StatCard label="Sin responder" value={total - respondidas} color="#6B7280" />
      </div>

      {total === 0 && (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--c-text-3)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 600 }}>Sin encuestas enviadas</div>
            <div style={{ fontSize: '.85rem', marginTop: 6 }}>
              Las encuestas se envían automáticamente cuando marcás un turno como completado.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
