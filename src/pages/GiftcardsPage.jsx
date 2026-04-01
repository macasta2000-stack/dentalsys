import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'

const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0)

const ESTADO_BADGE = {
  activo:  { bg: '#D1FAE5', color: '#065F46', label: 'Activo' },
  usado:   { bg: '#DBEAFE', color: '#1E3A5F', label: 'Usado' },
  vencido: { bg: '#FEF3C7', color: '#92400E', label: 'Vencido' },
  anulado: { bg: '#FEE2E2', color: '#991B1B', label: 'Anulado' },
}

function Badge({ estado }) {
  const s = ESTADO_BADGE[estado] ?? { bg: '#F3F4F6', color: '#374151', label: estado }
  return (
    <span style={{ fontSize: '.72rem', fontWeight: 700, padding: '2px 9px', borderRadius: 10,
      background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{s.label}</span>
  )
}

export default function GiftcardsPage() {
  const { user } = useAuth()
  const addToast = useToast()
  const isOwner = ['tenant', 'superadmin', 'admin'].includes(user?.rol)

  const [giftcards, setGiftcards] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [busqueda, setBusqueda] = useState('')

  // Modal crear
  const [showCrear, setShowCrear] = useState(false)
  const [form, setForm] = useState({ codigo: '', monto_original: '', fecha_vencimiento: '', notas: '' })
  const [saving, setSaving] = useState(false)

  // Modal aplicar saldo
  const [aplicando, setAplicando] = useState(null)
  const [montoAplicar, setMontoAplicar] = useState('')
  const [savingAplicar, setSavingAplicar] = useState(false)

  async function cargar() {
    setLoading(true)
    try {
      const params = {}
      if (filtroEstado) params.estado = filtroEstado
      const res = await api.giftcards.list(params)
      setGiftcards(res ?? [])
    } catch (e) {
      addToast('Error al cargar giftcards: ' + e.message, 'error')
    } finally { setLoading(false) }
  }

  useEffect(() => { cargar() }, [filtroEstado])

  const filtered = giftcards.filter(g => {
    if (!busqueda) return true
    const q = busqueda.toLowerCase()
    return (g.codigo ?? '').toLowerCase().includes(q) || (g.notas ?? '').toLowerCase().includes(q)
  })

  async function handleCrear(e) {
    e.preventDefault()
    if (!form.monto_original || Number(form.monto_original) <= 0) {
      addToast('El monto debe ser mayor a 0', 'error'); return
    }
    setSaving(true)
    try {
      await api.giftcards.create({
        monto_original: Number(form.monto_original),
        codigo: form.codigo || undefined,
        fecha_vencimiento: form.fecha_vencimiento || undefined,
        notas: form.notas || undefined,
      })
      addToast('Giftcard creada correctamente', 'success')
      setShowCrear(false)
      setForm({ codigo: '', monto_original: '', fecha_vencimiento: '', notas: '' })
      cargar()
    } catch (e) {
      addToast(e.message || 'No se pudo crear', 'error')
    } finally { setSaving(false) }
  }

  async function handleAnular(gc) {
    if (!confirm(`¿Anular la giftcard ${gc.codigo}? Esta acción no se puede deshacer.`)) return
    try {
      await api.giftcards.anular(gc.id)
      addToast('Giftcard anulada', 'success')
      cargar()
    } catch (e) {
      addToast(e.message || 'No se pudo anular', 'error')
    }
  }

  async function handleAplicar(e) {
    e.preventDefault()
    const monto = Number(montoAplicar)
    if (!monto || monto <= 0) { addToast('Monto inválido', 'error'); return }
    if (monto > aplicando.monto_restante) {
      addToast(`El monto supera el saldo disponible (${fmt(aplicando.monto_restante)})`, 'error'); return
    }
    setSavingAplicar(true)
    try {
      await api.giftcards.update(aplicando.id, { aplicar_monto: monto })
      addToast(`${fmt(monto)} descontados de la giftcard`, 'success')
      setAplicando(null)
      setMontoAplicar('')
      cargar()
    } catch (e) {
      addToast(e.message || 'No se pudo aplicar', 'error')
    } finally { setSavingAplicar(false) }
  }

  return (
    <div>
      <div className="page-actions" style={{ marginBottom: 20 }}>
        <div>
          <div className="page-title">Giftcards</div>
          <div className="text-sm text-muted">Emitir y aplicar tarjetas de regalo o crédito.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isOwner && (
            <button className="btn btn-primary" onClick={() => setShowCrear(true)}>+ Nueva giftcard</button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0, flex: '1 1 200px' }}>
            <label className="form-label">Buscar código</label>
            <input className="form-input" placeholder="Código o nota..." value={busqueda}
              onChange={e => setBusqueda(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: 150 }}>
            <label className="form-label">Estado</label>
            <select className="form-input" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
              <option value="">Todos</option>
              <option value="activo">Activo</option>
              <option value="usado">Usado</option>
              <option value="vencido">Vencido</option>
              <option value="anulado">Anulado</option>
            </select>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={cargar} disabled={loading}>↺ Actualizar</button>
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--c-text-3)' }}>Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--c-text-3)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>🎁</div>
            <div style={{ fontWeight: 600 }}>No hay giftcards</div>
            <div style={{ fontSize: '.85rem', marginTop: 6 }}>
              {isOwner ? 'Creá la primera con el botón de arriba.' : 'Todavía no se emitieron giftcards.'}
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Monto original</th>
                  <th>Saldo restante</th>
                  <th>Estado</th>
                  <th>Vencimiento</th>
                  <th>Notas</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(gc => (
                  <tr key={gc.id}>
                    <td><span style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '.05em' }}>{gc.codigo}</span></td>
                    <td>{fmt(gc.monto_original)}</td>
                    <td style={{ fontWeight: 700, color: gc.monto_restante > 0 ? 'var(--c-success)' : 'var(--c-text-3)' }}>
                      {fmt(gc.monto_restante)}
                    </td>
                    <td><Badge estado={gc.estado} /></td>
                    <td style={{ fontSize: '.85rem', color: 'var(--c-text-3)' }}>
                      {gc.fecha_vencimiento ? gc.fecha_vencimiento.slice(0, 10) : '—'}
                    </td>
                    <td style={{ fontSize: '.85rem', color: 'var(--c-text-3)', maxWidth: 200 }}>{gc.notas || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {gc.estado === 'activo' && gc.monto_restante > 0 && (
                          <button className="btn btn-ghost btn-sm" onClick={() => { setAplicando(gc); setMontoAplicar('') }}>
                            Aplicar
                          </button>
                        )}
                        {isOwner && gc.estado === 'activo' && (
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--c-danger)' }}
                            onClick={() => handleAnular(gc)}>
                            Anular
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Crear */}
      {showCrear && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3 className="modal-title">Nueva giftcard</h3>
              <button className="modal-close" onClick={() => setShowCrear(false)}>×</button>
            </div>
            <form onSubmit={handleCrear}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Monto <span className="req">*</span></label>
                  <input className="form-input" type="number" min="1" step="1" required
                    placeholder="Ej: 5000" value={form.monto_original}
                    onChange={e => setForm(f => ({ ...f, monto_original: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Código (opcional)</label>
                  <input className="form-input" placeholder="Dejá vacío para generar automáticamente"
                    value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))} />
                  <div style={{ fontSize: '.75rem', color: 'var(--c-text-3)', marginTop: 4 }}>
                    Si no ingresás código, se genera uno alfanumérico de 8 caracteres.
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha de vencimiento (opcional)</label>
                  <input className="form-input" type="date" value={form.fecha_vencimiento}
                    onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Notas (opcional)</label>
                  <input className="form-input" placeholder="Ej: Promo verano, regalo paciente..."
                    value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCrear(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Creando...' : 'Crear giftcard'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Aplicar saldo */}
      {aplicando && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">Aplicar saldo</h3>
              <button className="modal-close" onClick={() => setAplicando(null)}>×</button>
            </div>
            <form onSubmit={handleAplicar}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: 'var(--c-surface-2)', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ fontSize: '.8rem', color: 'var(--c-text-3)', marginBottom: 4 }}>Giftcard</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1.1rem', letterSpacing: '.05em' }}>
                    {aplicando.codigo}
                  </div>
                  <div style={{ fontSize: '.85rem', color: 'var(--c-success)', fontWeight: 600, marginTop: 4 }}>
                    Saldo disponible: {fmt(aplicando.monto_restante)}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Monto a descontar <span className="req">*</span></label>
                  <input className="form-input" type="number" min="1" max={aplicando.monto_restante} step="1" required
                    placeholder={`Máximo ${fmt(aplicando.monto_restante)}`}
                    value={montoAplicar} onChange={e => setMontoAplicar(e.target.value)} autoFocus />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setAplicando(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={savingAplicar}>
                  {savingAplicar ? 'Aplicando...' : 'Aplicar descuento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
