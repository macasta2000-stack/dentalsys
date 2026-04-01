import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'

const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0)

const CATEGORIAS = [
  { value: 'alquiler', label: 'Alquiler', color: '#3B82F6' },
  { value: 'servicios', label: 'Servicios (luz, gas, internet)', color: '#8B5CF6' },
  { value: 'insumos', label: 'Insumos y materiales', color: '#10B981' },
  { value: 'laboratorio', label: 'Laboratorio dental', color: '#F59E0B' },
  { value: 'sueldos', label: 'Sueldos y honorarios', color: '#EF4444' },
  { value: 'impuestos', label: 'Impuestos y tasas', color: '#6366F1' },
  { value: 'marketing', label: 'Marketing y publicidad', color: '#EC4899' },
  { value: 'mantenimiento', label: 'Mantenimiento y reparaciones', color: '#14B8A6' },
  { value: 'seguros', label: 'Seguros', color: '#F97316' },
  { value: 'capacitacion', label: 'Capacitaciones', color: '#06B6D4' },
  { value: 'general', label: 'Otros / General', color: '#64748B' },
]

const CAT_MAP = Object.fromEntries(CATEGORIAS.map(c => [c.value, c]))
const METODOS = ['efectivo', 'transferencia', 'tarjeta_debito', 'tarjeta_credito', 'cheque', 'otro']
const METODO_LABEL = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta_debito: 'Debito', tarjeta_credito: 'Credito', cheque: 'Cheque', otro: 'Otro' }

export default function GastosPage() {
  const addToast = useToast()
  const [gastos, setGastos] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [filtroCategoria, setFiltroCategoria] = useState('todas')
  const [confirmDelete, setConfirmDelete] = useState(null)

  const now = new Date()
  const [desde, setDesde] = useState(format(startOfMonth(now), 'yyyy-MM-dd'))
  const [hasta, setHasta] = useState(format(endOfMonth(now), 'yyyy-MM-dd'))

  const [form, setForm] = useState({
    fecha: format(now, 'yyyy-MM-dd'),
    descripcion: '', categoria: 'general', monto: '',
    metodo_pago: 'efectivo', proveedor: '', comprobante_nro: '', notas: '',
  })

  useEffect(() => { loadGastos() }, [desde, hasta, filtroCategoria])

  async function loadGastos() {
    setLoading(true)
    try {
      const data = await api.gastos.list({ desde, hasta, categoria: filtroCategoria })
      setGastos(data ?? [])
    } catch { setGastos([]) }
    setLoading(false)
  }

  function openNew() {
    setEditing(null)
    setForm({ fecha: format(new Date(), 'yyyy-MM-dd'), descripcion: '', categoria: 'general', monto: '', metodo_pago: 'efectivo', proveedor: '', comprobante_nro: '', notas: '' })
    setModal(true)
  }

  function openEdit(g) {
    setEditing(g)
    setForm({ fecha: g.fecha, descripcion: g.descripcion, categoria: g.categoria, monto: String(g.monto), metodo_pago: g.metodo_pago || 'efectivo', proveedor: g.proveedor || '', comprobante_nro: g.comprobante_nro || '', notas: g.notas || '' })
    setModal(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.descripcion.trim()) return addToast('La descripcion es requerida', 'error')
    if (!form.monto || Number(form.monto) <= 0) return addToast('El monto debe ser mayor a 0', 'error')
    setSaving(true)
    try {
      const body = { ...form, monto: Number(form.monto) }
      if (editing) {
        await api.gastos.update(editing.id, body)
        addToast('Gasto actualizado', 'success')
      } else {
        await api.gastos.create(body)
        addToast('Gasto registrado', 'success')
      }
      setModal(false)
      loadGastos()
    } catch (err) {
      addToast(err.message || 'Error al guardar', 'error')
    }
    setSaving(false)
  }

  async function handleDelete(id) {
    try {
      await api.gastos.delete(id)
      addToast('Gasto eliminado', 'success')
      setConfirmDelete(null)
      loadGastos()
    } catch (err) {
      addToast(err.message || 'Error al eliminar', 'error')
    }
  }

  const total = gastos.reduce((s, g) => s + Number(g.monto), 0)
  const porCategoria = CATEGORIAS.map(cat => {
    const sum = gastos.filter(g => g.categoria === cat.value).reduce((s, g) => s + Number(g.monto), 0)
    return { ...cat, total: sum }
  }).filter(c => c.total > 0)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="page-title">Gastos</div>
        <button className="btn btn-primary btn-sm" onClick={openNew}>+ Nuevo gasto</button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <input type="date" className="form-input" style={{ width: 155, padding: '6px 10px', fontSize: '.85rem' }} value={desde} onChange={e => setDesde(e.target.value)} />
        <span style={{ color: 'var(--c-text-3)', fontSize: '.85rem' }}>hasta</span>
        <input type="date" className="form-input" style={{ width: 155, padding: '6px 10px', fontSize: '.85rem' }} value={hasta} onChange={e => setHasta(e.target.value)} />
        <select className="form-input" style={{ width: 180, padding: '6px 10px', fontSize: '.85rem' }} value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
          <option value="todas">Todas las categorias</option>
          {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* KPIs */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Total gastos del periodo</div>
          <div className="stat-value" style={{ color: '#EF4444' }}>{loading ? '...' : fmt(total)}</div>
          <div className="stat-sub">{gastos.length} registros</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Promedio por gasto</div>
          <div className="stat-value primary">{loading ? '...' : fmt(gastos.length ? total / gastos.length : 0)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Mayor gasto</div>
          <div className="stat-value">{loading ? '...' : fmt(gastos.length ? Math.max(...gastos.map(g => g.monto)) : 0)}</div>
          <div className="stat-sub">{gastos.length ? gastos.reduce((max, g) => g.monto > max.monto ? g : max, gastos[0])?.descripcion?.slice(0, 30) : ''}</div>
        </div>
      </div>

      {/* Charts */}
      {porCategoria.length > 0 && (
        <div className="card" style={{ marginBottom: 20, padding: 20 }}>
          <h3 style={{ fontSize: '.9rem', fontWeight: 600, marginBottom: 16 }}>Gastos por categoria</h3>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ width: 220, height: 220 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={porCategoria} dataKey="total" nameKey="label" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={2}>
                    {porCategoria.map((c, i) => <Cell key={i} fill={c.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              {porCategoria.sort((a, b) => b.total - a.total).map(c => (
                <div key={c.value} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: '.82rem' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, color: 'var(--c-text-2)' }}>{c.label}</span>
                  <span style={{ fontWeight: 600 }}>{fmt(c.total)}</span>
                  <span style={{ color: 'var(--c-text-3)', fontSize: '.75rem', width: 40, textAlign: 'right' }}>{((c.total / total) * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Descripcion</th>
                <th>Categoria</th>
                <th>Proveedor</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
                <th>Metodo</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>Cargando...</td></tr>
              ) : gastos.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--c-text-3)' }}>No hay gastos en este periodo</td></tr>
              ) : gastos.map(g => (
                <tr key={g.id}>
                  <td>{g.fecha}</td>
                  <td className="td-main">{g.descripcion}</td>
                  <td><span className="badge" style={{ background: (CAT_MAP[g.categoria]?.color ?? '#64748B') + '22', color: CAT_MAP[g.categoria]?.color ?? '#64748B', border: 'none', fontSize: '.72rem' }}>{CAT_MAP[g.categoria]?.label ?? g.categoria}</span></td>
                  <td style={{ color: 'var(--c-text-2)' }}>{g.proveedor || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#EF4444' }}>{fmt(g.monto)}</td>
                  <td style={{ color: 'var(--c-text-2)', fontSize: '.82rem' }}>{METODO_LABEL[g.metodo_pago] ?? g.metodo_pago}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(g)} title="Editar">✏️</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(g)} title="Eliminar" style={{ color: '#EF4444' }}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {gastos.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700 }}>
                  <td colSpan={4}>Total</td>
                  <td style={{ textAlign: 'right', color: '#EF4444' }}>{fmt(total)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modal crear/editar */}
      {modal && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>{editing ? 'Editar gasto' : 'Nuevo gasto'}</h3>
              <button className="btn-close" onClick={() => setModal(false)}>X</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="form-label">Fecha</label>
                    <input type="date" className="form-input" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} required />
                  </div>
                  <div>
                    <label className="form-label">Monto ($)</label>
                    <input type="number" className="form-input" placeholder="0.00" step="0.01" min="0.01" value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} required />
                  </div>
                </div>
                <div>
                  <label className="form-label">Descripcion</label>
                  <input type="text" className="form-input" placeholder="Ej: Alquiler del consultorio marzo" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} required maxLength={500} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="form-label">Categoria</label>
                    <select className="form-input" value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
                      {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Metodo de pago</label>
                    <select className="form-input" value={form.metodo_pago} onChange={e => setForm({ ...form, metodo_pago: e.target.value })}>
                      {METODOS.map(m => <option key={m} value={m}>{METODO_LABEL[m]}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="form-label">Proveedor (opcional)</label>
                    <input type="text" className="form-input" placeholder="Nombre del proveedor" value={form.proveedor} onChange={e => setForm({ ...form, proveedor: e.target.value })} />
                  </div>
                  <div>
                    <label className="form-label">Nro. comprobante (opcional)</label>
                    <input type="text" className="form-input" placeholder="0001-00001234" value={form.comprobante_nro} onChange={e => setForm({ ...form, comprobante_nro: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="form-label">Notas (opcional)</label>
                  <textarea className="form-input" rows={2} placeholder="Notas adicionales..." value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Registrar gasto'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="modal-overlay" style={{ zIndex: 1001 }}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header"><h3>Eliminar gasto</h3></div>
            <div className="modal-body">
              <p>Seguro que queres eliminar "{confirmDelete.descripcion}" por {fmt(confirmDelete.monto)}?</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{ background: '#EF4444' }} onClick={() => handleDelete(confirmDelete.id)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
