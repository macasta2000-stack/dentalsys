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
  const [modalPago, setModalPago] = useState(false)
  const [pagoDeudor, setPagoDeudor] = useState(null)
  const [pagoForm, setPagoForm] = useState({ monto: '', metodo_pago: 'efectivo', concepto: '' })
  const [pagoSaving, setPagoSaving] = useState(false)
  const [rangoDesde, setRangoDesde] = useState('')
  const [rangoHasta, setRangoHasta] = useState('')

  const rangeParams = () => {
    const now = new Date()
    if (range === 'hoy') return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() }
    if (range === 'mes') return { from: startOfMonth(now).toISOString(), to: endOfMonth(now).toISOString() }
    if (range === 'mes_ant') {
      const prev = subMonths(now, 1)
      return { from: startOfMonth(prev).toISOString(), to: endOfMonth(prev).toISOString() }
    }
    if (range === 'custom' && rangoDesde && rangoHasta) {
      return { from: startOfDay(new Date(rangoDesde)).toISOString(), to: endOfDay(new Date(rangoHasta)).toISOString() }
    }
    return {}
  }

  useEffect(() => { loadPagos() }, [range, rangoDesde, rangoHasta])
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

  function openPagoDeudor(pac) {
    setPagoDeudor(pac)
    setPagoForm({ monto: String(Math.abs(pac.saldo ?? 0)), metodo_pago: 'efectivo', concepto: 'Saldo pendiente' })
    setModalPago(true)
  }

  async function handlePagoDeudor(e) {
    e.preventDefault()
    setPagoSaving(true)
    try {
      await api.pagos.create({ paciente_id: pagoDeudor.id, monto: Number(pagoForm.monto), metodo_pago: pagoForm.metodo_pago, concepto: pagoForm.concepto })
      setDeudores(prev => prev.map(p => p.id === pagoDeudor.id ? { ...p, saldo: (p.saldo ?? 0) + Number(pagoForm.monto) } : p).filter(p => (p.saldo ?? 0) < 0))
      setModalPago(false)
      await loadPagos()
    } catch (e) { alert(e.message) }
    finally { setPagoSaving(false) }
  }

  async function handleAnularPago(pago) {
    if (!confirm(`¿Anular el pago de ${fmt(pago.monto)} de ${pago.paciente_nombre || 'este paciente'}? Esta acción revertirá el saldo del paciente.`)) return
    try {
      await api.pagos.anular(pago.id)
      await loadPagos()
    } catch (e) { alert('No se pudo anular el pago. Intentá nuevamente o contactá al soporte.') }
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
        <div className="page-actions" style={{ flexWrap: 'wrap' }}>
          {['hoy', 'mes', 'mes_ant', 'custom'].map(r => (
            <button key={r} className={`btn btn-sm ${range === r ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setRange(r)}>
              {r === 'hoy' ? 'Hoy' : r === 'mes' ? 'Este mes' : r === 'mes_ant' ? 'Mes anterior' : 'Rango personalizado'}
            </button>
          ))}
          {range === 'custom' && (
            <>
              <input type="date" className="form-input" style={{ width: 150, padding: '5px 10px', fontSize: '.82rem' }} value={rangoDesde} onChange={e => setRangoDesde(e.target.value)} />
              <span className="text-sm text-muted">hasta</span>
              <input type="date" className="form-input" style={{ width: 150, padding: '5px 10px', fontSize: '.82rem' }} value={rangoHasta} onChange={e => setRangoHasta(e.target.value)} />
            </>
          )}
          <button className="btn btn-secondary btn-sm" onClick={handleCierreDeCaja}>Cierre de caja</button>
        </div>
      </div>

      {/* Encabezado de cierre de caja para impresión */}
      <div className="print-show" style={{ padding: 20, fontFamily: 'serif' }}>
        <h1 style={{ fontSize: '1.4rem', marginBottom: 4 }}>Cierre de Caja</h1>
        <p style={{ margin: 0 }}>{format(new Date(), "EEEE d 'de' MMMM yyyy", { locale: es })}</p>
        <hr style={{ margin: '12px 0' }} />
        <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>Resumen por método</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: '.9rem' }}>
          <thead><tr><th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '4px 8px' }}>Método</th><th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: '4px 8px' }}>Cantidad</th><th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: '4px 8px' }}>Total</th></tr></thead>
          <tbody>
            {Object.entries(porMetodo).map(([m, v]) => (
              <tr key={m}><td style={{ padding: '4px 8px' }}>{METODO_LABEL[m] ?? m}</td><td style={{ textAlign: 'right', padding: '4px 8px' }}>{pagosFiltrados.filter(p => p.metodo_pago === m).length}</td><td style={{ textAlign: 'right', padding: '4px 8px' }}>{fmt(v)}</td></tr>
            ))}
          </tbody>
          <tfoot><tr style={{ fontWeight: 700 }}><td style={{ padding: '6px 8px', borderTop: '2px solid #000' }}>TOTAL</td><td style={{ textAlign: 'right', padding: '6px 8px', borderTop: '2px solid #000' }}>{pagosFiltrados.length}</td><td style={{ textAlign: 'right', padding: '6px 8px', borderTop: '2px solid #000' }}>{fmt(total)}</td></tr></tfoot>
        </table>
        <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>Detalle de cobros</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
          <thead><tr><th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '3px 6px' }}>Hora</th><th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '3px 6px' }}>Paciente</th><th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '3px 6px' }}>Concepto</th><th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '3px 6px' }}>Método</th><th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: '3px 6px' }}>Monto</th></tr></thead>
          <tbody>
            {pagosFiltrados.filter(p => !p.anulado).map(p => (
              <tr key={p.id}><td style={{ padding: '3px 6px' }}>{format(new Date(p.fecha), 'HH:mm')}</td><td style={{ padding: '3px 6px' }}>{p.paciente_nombre ?? '—'}</td><td style={{ padding: '3px 6px' }}>{p.concepto || '—'}</td><td style={{ padding: '3px 6px' }}>{METODO_LABEL[p.metodo_pago] ?? p.metodo_pago}</td><td style={{ textAlign: 'right', padding: '3px 6px' }}>{fmt(p.monto)}</td></tr>
            ))}
          </tbody>
        </table>
        <hr style={{ margin: '16px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40 }}>
          <div style={{ textAlign: 'center' }}><div style={{ borderTop: '1px solid #000', width: 180, paddingTop: 4, fontSize: '.8rem' }}>Firma profesional</div></div>
          <div style={{ textAlign: 'right', fontSize: '.85rem' }}>Total del día: <strong>{fmt(total)}</strong></div>
        </div>
      </div>

      {/* Totales resumen */}
      <div className="stats-grid no-print" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Total {range === 'hoy' ? 'hoy' : range === 'mes' ? 'este mes' : range === 'mes_ant' ? 'mes anterior' : 'período'}</div>
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

      {/* Tabla desglose por método */}
      {!loading && Object.keys(porMetodo).length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header no-print"><span className="card-title">Desglose por método de pago</span></div>
          <div className="table-wrapper">
            <table className="table" style={{ fontSize: '.85rem' }}>
              <thead><tr><th>Método</th><th style={{ textAlign: 'right' }}>Cantidad</th><th style={{ textAlign: 'right' }}>Total</th><th className="no-print" style={{ textAlign: 'right' }}>% del total</th></tr></thead>
              <tbody>
                {Object.entries(porMetodo).sort((a,b) => b[1] - a[1]).map(([m, v]) => (
                  <tr key={m}>
                    <td className="td-main">{METODO_LABEL[m] ?? m}</td>
                    <td style={{ textAlign: 'right' }}>{pagosFiltrados.filter(p => p.metodo_pago === m).length}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(v)}</td>
                    <td className="no-print" style={{ textAlign: 'right', color: 'var(--c-text-3)' }}>{total > 0 ? ((v / total) * 100).toFixed(0) : 0}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700, background: 'var(--c-surface-2)' }}>
                  <td style={{ padding: '10px 16px' }}>TOTAL</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right' }}>{pagosFiltrados.length}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--c-success)' }}>{fmt(total)}</td>
                  <td className="no-print"></td>
                </tr>
              </tfoot>
            </table>
          </div>
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
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pagosFiltrados.map(p => {
                    const esOS = p.metodo_pago === 'obra_social'
                    const montoOS = esOS ? Number(p.monto_os ?? p.monto) : 0
                    const montoCopago = esOS ? Number(p.monto_copago ?? 0) : 0
                    const montoParticular = !esOS ? Number(p.monto) : 0
                    const anulado = !!p.anulado
                    return (
                      <tr key={p.id} style={anulado ? { opacity: 0.5, textDecoration: 'line-through' } : {}}>
                        <td className="text-sm text-muted">{format(new Date(p.fecha), 'HH:mm')}</td>
                        <td className="td-main">{p.paciente_nombre ?? '—'}</td>
                        <td className="text-sm">{p.concepto || '—'}{anulado && <span className="badge badge-danger" style={{ marginLeft: 6 }}>Anulado</span>}</td>
                        <td><span className="badge badge-neutral">{METODO_LABEL[p.metodo_pago] ?? p.metodo_pago}</span></td>
                        <td style={{ textAlign: 'right' }} className="text-sm">{montoParticular > 0 ? fmt(montoParticular) : '—'}</td>
                        <td style={{ textAlign: 'right' }} className="text-sm">{montoOS > 0 ? fmt(montoOS) : '—'}</td>
                        <td style={{ textAlign: 'right' }} className="text-sm">{montoCopago > 0 ? fmt(montoCopago) : '—'}</td>
                        <td style={{ textAlign: 'right' }} className="font-semibold">{fmt(p.monto)}</td>
                        <td>
                          {!anulado && (
                            <button className="btn btn-danger btn-sm" onClick={() => handleAnularPago(p)}>Anular</button>
                          )}
                        </td>
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
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal registrar pago a deudor */}
      {modalPago && pagoDeudor && (
        <div className="modal-overlay" onClick={() => setModalPago(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Registrar pago — {pagoDeudor.apellido}, {pagoDeudor.nombre}</span>
              <button className="btn-close" onClick={() => setModalPago(false)}>✕</button>
            </div>
            <form onSubmit={handlePagoDeudor}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Monto <span className="req">*</span></label>
                  <input className="form-input" type="number" min="1" required value={pagoForm.monto} onChange={e => setPagoForm(f => ({ ...f, monto: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Método</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {[['efectivo','Efectivo'],['transferencia','Transferencia'],['tarjeta_debito','Débito'],['tarjeta_credito','Crédito']].map(([val, lbl]) => (
                      <button key={val} type="button" className={`btn btn-sm ${pagoForm.metodo_pago === val ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPagoForm(f => ({ ...f, metodo_pago: val }))}>{lbl}</button>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Concepto</label>
                  <input className="form-input" value={pagoForm.concepto} onChange={e => setPagoForm(f => ({ ...f, concepto: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModalPago(false)}>Cancelar</button>
                <button type="submit" className="btn btn-success" disabled={pagoSaving}>{pagoSaving ? 'Registrando...' : 'Registrar pago'}</button>
              </div>
            </form>
          </div>
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
                <thead><tr><th>Paciente</th><th>Obra Social</th><th>Teléfono</th><th style={{ textAlign: 'right' }}>Deuda</th><th></th></tr></thead>
                <tbody>
                  {deudores.sort((a, b) => (a.saldo ?? 0) - (b.saldo ?? 0)).map(p => (
                    <tr key={p.id}>
                      <td className="td-main">{p.apellido}, {p.nombre}</td>
                      <td className="text-sm">{p.obra_social || <span className="text-muted">Particular</span>}</td>
                      <td className="text-sm">{p.telefono || '—'}</td>
                      <td style={{ textAlign: 'right' }} className="font-semibold text-danger">{fmt(Math.abs(p.saldo ?? 0))}</td>
                      <td><button className="btn btn-success btn-sm" onClick={() => openPagoDeudor(p)}>Registrar pago</button></td>
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
