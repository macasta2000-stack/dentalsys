import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import Odontograma from '../components/Odontograma'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const ESTADOS_OD = [
  'sano','caries','obturado','corona','endodoncia',
  'extraccion_indicada','extraido','implante','fractura',
  'ausente_congenito','a_tratar','protesis_fija','protesis_removible'
]
const ESTADO_LABEL = { sano:'Sano', caries:'Caries', obturado:'Obturado', corona:'Corona', endodoncia:'Endodoncia', extraccion_indicada:'Extracción indicada', extraido:'Extraído', implante:'Implante', fractura:'Fractura', ausente_congenito:'Aus. congénito', a_tratar:'A tratar', protesis_fija:'Prótesis fija', protesis_removible:'Prótesis removible' }

function fmt(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0)
}
function calcEdad(fn) {
  if (!fn) return null
  return Math.floor((Date.now() - new Date(fn)) / (1000*60*60*24*365.25))
}

export default function PacienteDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState('hc')
  const [paciente, setPaciente] = useState(null)
  const [piezas, setPiezas] = useState({})
  const [evoluciones, setEvoluciones] = useState([])
  const [pagos, setPagos] = useState([])
  const [presupuestos, setPresupuestos] = useState([])
  const [turnos, setTurnos] = useState([])
  const [prestaciones, setPrestaciones] = useState([])
  const [loading, setLoading] = useState(true)

  // Pieza seleccionada para editar
  const [piezaSel, setPiezaSel] = useState(null)
  const [piezaEstado, setPiezaEstado] = useState('sano')
  const [piezaNota, setPiezaNota] = useState('')

  // Modales
  const [modalEvol, setModalEvol] = useState(false)
  const [modalPago, setModalPago] = useState(false)
  const [evolForm, setEvolForm] = useState({ descripcion: '', prestacion_id: '', monto: '', piezas_tratadas: '' })
  const [pagoForm, setPagoForm] = useState({ monto: '', metodo_pago: 'efectivo', concepto: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadAll() }, [id])

  async function loadAll() {
    setLoading(true)
    try {
      const results = await Promise.allSettled([
        api.pacientes.get(id),
        api.odontograma.get(id),
        api.evoluciones.list(id),
        api.pagos.list({ paciente_id: id }),
        api.presupuestos.list(id),
        api.turnos.list({ paciente_id: id }),
        api.prestaciones.list(),
      ])
      const val = (i) => results[i].status === 'fulfilled' ? results[i].value : null
      setPaciente(val(0))
      const od = val(1)
      const map = {}; (od ?? []).forEach(p => { map[p.numero_pieza] = p }); setPiezas(map)
      setEvoluciones(val(2) ?? [])
      setPagos(val(3) ?? [])
      setPresupuestos(val(4) ?? [])
      setTurnos(val(5) ?? [])
      setPrestaciones(val(6) ?? [])
    } finally { setLoading(false) }
  }

  async function handlePiezaClick(num) {
    const current = piezas[num]
    setPiezaSel(num)
    setPiezaEstado(current?.estado ?? 'sano')
    setPiezaNota(current?.notas ?? '')
  }

  async function savePieza() {
    setSaving(true)
    try {
      const result = await api.odontograma.save({ paciente_id: id, numero_pieza: piezaSel, estado: piezaEstado, notas: piezaNota })
      setPiezas(prev => ({ ...prev, [piezaSel]: result }))
      setPiezaSel(null)
    } finally { setSaving(false) }
  }

  async function handleEvolSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const prestacion = prestaciones.find(p => p.id === evolForm.prestacion_id)
      const ev = await api.evoluciones.create({
        paciente_id: id,
        descripcion: evolForm.descripcion,
        prestacion_id: evolForm.prestacion_id || null,
        prestacion_nombre: prestacion?.nombre ?? null,
        monto: Number(evolForm.monto) || 0,
        piezas_tratadas: JSON.stringify(evolForm.piezas_tratadas ? evolForm.piezas_tratadas.split(',').map(x => parseInt(x.trim())).filter(Boolean) : []),
      })
      setEvoluciones(prev => [ev, ...prev])
      setModalEvol(false)
      setEvolForm({ descripcion: '', prestacion_id: '', monto: '', piezas_tratadas: '' })
    } finally { setSaving(false) }
  }

  async function handlePagoSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const p = await api.pagos.create({ paciente_id: id, monto: Number(pagoForm.monto), metodo_pago: pagoForm.metodo_pago, concepto: pagoForm.concepto })
      setPagos(prev => [p, ...prev])
      setPaciente(pac => ({ ...pac, saldo: (pac.saldo || 0) + Number(pagoForm.monto) }))
      setModalPago(false)
      setPagoForm({ monto: '', metodo_pago: 'efectivo', concepto: '' })
    } finally { setSaving(false) }
  }

  if (loading) return <div style={{ textAlign: 'center', paddingTop: 60 }}><span className="spinner" /></div>
  if (!paciente) return <div className="empty-state"><div className="empty-title">Paciente no encontrado</div><button className="btn btn-ghost" onClick={() => navigate('/pacientes')}>← Volver</button></div>

  const totalPagado = pagos.reduce((s, p) => s + Number(p.monto), 0)

  return (
    <div>
      {/* Header paciente */}
      <div className="pd-header">
        <div className="pd-avatar">{paciente.apellido[0]}{paciente.nombre[0]}</div>
        <div className="pd-info">
          <div className="pd-name">{paciente.apellido}, {paciente.nombre}</div>
          <div className="pd-meta">
            {paciente.dni && <span className="pd-meta-item">🪪 DNI {paciente.dni}</span>}
            {paciente.fecha_nacimiento && <span className="pd-meta-item">🎂 {calcEdad(paciente.fecha_nacimiento)} años</span>}
            {paciente.telefono && <span className="pd-meta-item">📞 {paciente.telefono}</span>}
            {paciente.obra_social && <span className="pd-meta-item"><span className="badge badge-info">{paciente.obra_social}</span></span>}
            <span className="pd-meta-item">💰 Total pagado: <strong>{fmt(totalPagado)}</strong></span>
          </div>
          {paciente.notas && <div className="text-sm text-muted mt-1">⚠️ {paciente.notas}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setModalPago(true)}>+ Pago</button>
          <button className="btn btn-primary btn-sm" onClick={() => setModalEvol(true)}>+ Evolución</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[['hc','📋 Historia Clínica'], ['odontograma','🦷 Odontograma'], ['turnos','📅 Turnos'], ['presupuestos','💼 Presupuestos'], ['pagos','💵 Pagos']].map(([k,l]) => (
          <button key={k} className={`tab-btn${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {/* HISTORIA CLÍNICA */}
      {tab === 'hc' && (
        <div>
          <div className="page-actions" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setModalEvol(true)}>+ Agregar evolución</button>
          </div>
          {evoluciones.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">📋</div><div className="empty-title">Sin evoluciones registradas</div></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {evoluciones.map(ev => (
                <div key={ev.id} className="card">
                  <div className="card-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span className="text-sm text-muted">{format(new Date(ev.fecha), "d 'de' MMMM yyyy, HH:mm", { locale: es })}</span>
                      {ev.monto > 0 && <span className="badge badge-success">{fmt(ev.monto)}</span>}
                    </div>
                    {ev.prestacion_nombre && <div className="text-sm" style={{ color: 'var(--c-primary)', fontWeight: 600, marginBottom: 4 }}>🔧 {ev.prestacion_nombre}</div>}
                    <div style={{ fontSize: '.9rem' }}>{ev.descripcion}</div>
                    {ev.piezas_tratadas && ev.piezas_tratadas !== '[]' && (
                      <div className="text-xs text-muted mt-1">Piezas: {ev.piezas_tratadas}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ODONTOGRAMA */}
      {tab === 'odontograma' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">🦷 Odontograma Interactivo</span>
            <span className="text-sm text-muted">Hacé clic en una pieza para editarla</span>
          </div>
          <div className="card-body">
            <Odontograma piezas={piezas} onPiezaClick={handlePiezaClick} />
          </div>
        </div>
      )}

      {/* TURNOS */}
      {tab === 'turnos' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Historial de turnos</span>
          </div>
          {turnos.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">📅</div><div className="empty-title">Sin turnos registrados</div></div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Fecha y hora</th><th>Motivo</th><th>Estado</th></tr></thead>
                <tbody>
                  {turnos.slice(0, 20).map(t => (
                    <tr key={t.id}>
                      <td className="td-main">{format(new Date(t.fecha_hora), "d MMM yyyy, HH:mm", { locale: es })}</td>
                      <td className="text-sm">{t.motivo || '—'}</td>
                      <td><span className={`badge badge-${t.estado === 'completado' ? 'success' : t.estado === 'ausente' ? 'danger' : 'info'}`}>{t.estado}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PRESUPUESTOS */}
      {tab === 'presupuestos' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Presupuestos</span>
          </div>
          {presupuestos.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">💼</div><div className="empty-title">Sin presupuestos</div></div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Nº</th><th>Fecha</th><th>Total</th><th>Pagado</th><th>Estado</th></tr></thead>
                <tbody>
                  {presupuestos.map(p => (
                    <tr key={p.id}>
                      <td className="td-main">#{p.numero}</td>
                      <td className="text-sm">{format(new Date(p.fecha), "d MMM yyyy", { locale: es })}</td>
                      <td className="font-semibold">{fmt(p.total)}</td>
                      <td className="text-sm">{fmt(p.total_pagado)}</td>
                      <td><span className={`badge badge-${p.estado === 'completado' ? 'success' : p.estado === 'aprobado' ? 'info' : p.estado === 'vencido' ? 'danger' : 'warning'}`}>{p.estado}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PAGOS */}
      {tab === 'pagos' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Historial de pagos</span>
            <span className="font-semibold" style={{ color: 'var(--c-success)' }}>Total: {fmt(totalPagado)}</span>
          </div>
          {pagos.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">💵</div><div className="empty-title">Sin pagos registrados</div></div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Fecha</th><th>Monto</th><th>Método</th><th>Concepto</th></tr></thead>
                <tbody>
                  {pagos.map(p => (
                    <tr key={p.id}>
                      <td className="text-sm">{format(new Date(p.fecha), "d MMM yyyy, HH:mm", { locale: es })}</td>
                      <td className="td-main">{fmt(p.monto)}</td>
                      <td><span className="badge badge-neutral">{p.metodo_pago}</span></td>
                      <td className="text-sm text-muted">{p.concepto || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: Editar pieza odontograma */}
      {piezaSel && (
        <div className="modal-overlay" onClick={() => setPiezaSel(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">🦷 Pieza {piezaSel}</span>
              <button className="btn-close" onClick={() => setPiezaSel(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Estado</label>
                <select className="form-input" value={piezaEstado} onChange={e => setPiezaEstado(e.target.value)}>
                  {ESTADOS_OD.map(e => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Notas</label>
                <textarea className="form-input" rows={3} value={piezaNota} onChange={e => setPiezaNota(e.target.value)} placeholder="Observaciones sobre esta pieza..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setPiezaSel(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={savePieza} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Nueva evolución */}
      {modalEvol && (
        <div className="modal-overlay" onClick={() => setModalEvol(false)}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">📋 Nueva Evolución</span>
              <button className="btn-close" onClick={() => setModalEvol(false)}>✕</button>
            </div>
            <form onSubmit={handleEvolSave}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Prestación realizada</label>
                  <select className="form-input" value={evolForm.prestacion_id} onChange={e => {
                    const p = prestaciones.find(x => x.id === e.target.value)
                    setEvolForm(f => ({ ...f, prestacion_id: e.target.value, monto: p ? String(p.precio) : f.monto }))
                  }}>
                    <option value="">Sin prestación específica</option>
                    {prestaciones.map(p => <option key={p.id} value={p.id}>{p.nombre} — {new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(p.precio)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Descripción <span className="req">*</span></label>
                  <textarea className="form-input" rows={4} required value={evolForm.descripcion} onChange={e => setEvolForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Descripción del tratamiento realizado..." />
                </div>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Piezas tratadas</label>
                    <input className="form-input" placeholder="11, 21, 31..." value={evolForm.piezas_tratadas} onChange={e => setEvolForm(f => ({ ...f, piezas_tratadas: e.target.value }))} />
                    <span className="form-hint">Separadas por coma</span>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Monto cobrado</label>
                    <input className="form-input" type="number" min="0" value={evolForm.monto} onChange={e => setEvolForm(f => ({ ...f, monto: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModalEvol(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar evolución'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Registrar pago */}
      {modalPago && (
        <div className="modal-overlay" onClick={() => setModalPago(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">💵 Registrar Pago</span>
              <button className="btn-close" onClick={() => setModalPago(false)}>✕</button>
            </div>
            <form onSubmit={handlePagoSave}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Monto <span className="req">*</span></label>
                  <input className="form-input" type="number" min="1" required value={pagoForm.monto} onChange={e => setPagoForm(f => ({ ...f, monto: e.target.value }))} placeholder="$0" />
                </div>
                <div className="form-group">
                  <label className="form-label">Método de pago</label>
                  <select className="form-input" value={pagoForm.metodo_pago} onChange={e => setPagoForm(f => ({ ...f, metodo_pago: e.target.value }))}>
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="tarjeta_debito">Tarjeta débito</option>
                    <option value="tarjeta_credito">Tarjeta crédito</option>
                    <option value="obra_social">Obra social</option>
                    <option value="mercadopago">MercadoPago</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Concepto</label>
                  <input className="form-input" value={pagoForm.concepto} onChange={e => setPagoForm(f => ({ ...f, concepto: e.target.value }))} placeholder="Ej: Consulta + limpieza..." />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModalPago(false)}>Cancelar</button>
                <button type="submit" className="btn btn-success" disabled={saving}>{saving ? 'Guardando...' : 'Registrar pago'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
