import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export default function InsumosPage() {
  const [insumos, setInsumos] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [movModal, setMovModal] = useState(null) // insumo para movimiento
  const [form, setForm] = useState({ nombre: '', descripcion: '', unidad: 'unidad', stock_actual: '', stock_minimo: '', precio_unitario: '', proveedor: '', categoria: 'general' })
  const [movForm, setMovForm] = useState({ tipo: 'entrada', cantidad: '', motivo: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const CATEGORIAS = ['general','anestesia','resinas','instrumental','esterilizacion','radiologia','ortodoncia','protesis','limpieza']

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const data = await api.insumos.list().catch(() => [])
    setInsumos(data ?? [])
    setLoading(false)
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSave(e) {
    e.preventDefault()
    if (!form.nombre) { setError('Nombre requerido'); return }
    setSaving(true); setError('')
    try {
      const insumo = await api.insumos.create({
        ...form,
        stock_actual: Number(form.stock_actual) || 0,
        stock_minimo: Number(form.stock_minimo) || 0,
        precio_unitario: Number(form.precio_unitario) || 0,
      })
      setInsumos(prev => [...prev, insumo].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setModal(false)
      setForm({ nombre: '', descripcion: '', unidad: 'unidad', stock_actual: '', stock_minimo: '', precio_unitario: '', proveedor: '', categoria: 'general' })
    } catch (e) { setError('No se pudo guardar el insumo. El nombre es obligatorio.') }
    finally { setSaving(false) }
  }

  async function handleMovimiento(e) {
    e.preventDefault()
    if (!movForm.cantidad) return
    setSaving(true)
    try {
      const updated = await api.insumos.update(movModal.id, {
        _movimiento: { tipo: movForm.tipo, cantidad: Number(movForm.cantidad), motivo: movForm.motivo }
      })
      setInsumos(prev => prev.map(i => i.id === movModal.id ? updated : i))
      setMovModal(null)
      setMovForm({ tipo: 'entrada', cantidad: '', motivo: '' })
    } catch (e) { setError('No se pudo registrar el movimiento de stock. Verificá la cantidad.') }
    finally { setSaving(false) }
  }

  const stockStatus = (i) => {
    if (i.stock_actual <= 0) return { label: 'Sin stock', cls: 'danger' }
    if (i.stock_actual <= i.stock_minimo) return { label: 'Stock bajo', cls: 'warning' }
    return { label: 'Normal', cls: 'success' }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Insumos</div>
          <div className="page-sub">{insumos.filter(i => i.stock_actual <= i.stock_minimo).length} ítems con stock bajo</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm" onClick={() => { setError(''); setModal(true) }}>+ Nuevo insumo</button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="card-body" style={{ textAlign: 'center' }}><span className="spinner" /></div>
        ) : insumos.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <div className="empty-title">Sin insumos registrados</div>
            <button className="btn btn-primary btn-sm mt-2" onClick={() => setModal(true)}>Agregar insumo</button>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>Insumo</th><th>Categoría</th><th>Stock actual</th><th>Stock mínimo</th><th>Proveedor</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {insumos.map(i => {
                  const st = stockStatus(i)
                  return (
                    <tr key={i.id}>
                      <td>
                        <div className="td-main">{i.nombre}</div>
                        {i.descripcion && <div className="text-xs text-muted">{i.descripcion}</div>}
                      </td>
                      <td><span className="badge badge-neutral">{i.categoria}</span></td>
                      <td className="font-semibold">{i.stock_actual} {i.unidad}</td>
                      <td className="text-sm text-muted">{i.stock_minimo} {i.unidad}</td>
                      <td className="text-sm">{i.proveedor || '—'}</td>
                      <td><span className={`badge badge-${st.cls}`}>{st.label}</span></td>
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setMovModal(i); setMovForm({ tipo: 'entrada', cantidad: '', motivo: '' }) }}>
                          ± Stock
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal nuevo insumo */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">📦 Nuevo Insumo</span>
              <button className="btn-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Nombre <span className="req">*</span></label>
                    <input className="form-input" value={form.nombre} onChange={set('nombre')} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Categoría</label>
                    <select className="form-input" value={form.categoria} onChange={set('categoria')}>
                      {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row cols-3">
                  <div className="form-group">
                    <label className="form-label">Stock inicial</label>
                    <input className="form-input" type="number" min="0" value={form.stock_actual} onChange={set('stock_actual')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Stock mínimo</label>
                    <input className="form-input" type="number" min="0" value={form.stock_minimo} onChange={set('stock_minimo')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Unidad</label>
                    <input className="form-input" placeholder="unidad, caja, ml..." value={form.unidad} onChange={set('unidad')} />
                  </div>
                </div>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Proveedor</label>
                    <input className="form-input" value={form.proveedor} onChange={set('proveedor')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Precio unitario</label>
                    <input className="form-input" type="number" min="0" value={form.precio_unitario} onChange={set('precio_unitario')} />
                  </div>
                </div>
                {error && <div className="alert alert-danger">{error}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Crear insumo'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal movimiento de stock */}
      {movModal && (
        <div className="modal-overlay" onClick={() => setMovModal(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">± Ajustar Stock: {movModal.nombre}</span>
              <button className="btn-close" onClick={() => setMovModal(null)}>✕</button>
            </div>
            <form onSubmit={handleMovimiento}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                  <span className="text-sm text-muted">Stock actual: </span>
                  <strong>{movModal.stock_actual} {movModal.unidad}</strong>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo de movimiento</label>
                  <select className="form-input" value={movForm.tipo} onChange={e => setMovForm(f => ({ ...f, tipo: e.target.value }))}>
                    <option value="entrada">Entrada (suma stock)</option>
                    <option value="salida">Salida (resta stock)</option>
                    <option value="ajuste">Ajuste (nuevo valor)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{movForm.tipo === 'ajuste' ? 'Nueva cantidad en stock' : 'Cantidad'} <span className="req">*</span></label>
                  <input className="form-input" type="number" min="0" required value={movForm.cantidad} onChange={e => setMovForm(f => ({ ...f, cantidad: e.target.value }))} placeholder={movForm.tipo === 'ajuste' ? 'Ingresá el nuevo stock total...' : ''} />
                  {movForm.tipo === 'ajuste' && <span className="form-hint">El stock quedará exactamente en este valor</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">Motivo</label>
                  <input className="form-input" placeholder="Compra, uso en tratamiento..." value={movForm.motivo} onChange={e => setMovForm(f => ({ ...f, motivo: e.target.value }))} />
                </div>
                {error && <div className="alert alert-danger">{error}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setMovModal(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Registrar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
