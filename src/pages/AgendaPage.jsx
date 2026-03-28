import React, { useEffect, useState, useRef } from 'react'
import { api } from '../lib/api'
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, isSameDay, parseISO, startOfDay, endOfDay } from 'date-fns'
import { es } from 'date-fns/locale'

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8) // 8 a 20

// Colores por estado
const ESTADO_CHIP_STYLE = {
  programado:  { bg: '#EFF6FF', border: '#3B82F6', nameColor: '#1D4ED8' },
  confirmado:  { bg: '#F0FDF4', border: '#16A34A', nameColor: '#15803D' },
  presente:    { bg: '#F0FDF4', border: '#16A34A', nameColor: '#15803D' },
  completado:  { bg: '#F1F5F9', border: '#64748B', nameColor: '#475569' },
  ausente:     { bg: '#FFF7ED', border: '#F97316', nameColor: '#C2410C' },
  no_asistio:  { bg: '#FFF7ED', border: '#F97316', nameColor: '#C2410C' },
  cancelado:   { bg: '#FEF2F2', border: '#DC2626', nameColor: '#B91C1C' },
}

const METODO_LABEL = { efectivo:'Efectivo', transferencia:'Transferencia', tarjeta_debito:'Débito', tarjeta_credito:'Crédito', obra_social:'Obra Social', mercadopago:'MercadoPago', cheque:'Cheque', otro:'Otro' }

export default function AgendaPage() {
  const [vista, setVista] = useState('semanal') // 'diaria' | 'semanal'
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [diaActual, setDiaActual] = useState(new Date())
  const [turnos, setTurnos] = useState([])
  const [loading, setLoading] = useState(true)
  const [pacientes, setPacientes] = useState([])
  const [prestaciones, setPrestaciones] = useState([])
  const [modal, setModal] = useState(false)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({ paciente_id: '', fecha_hora: '', duracion_minutos: 60, motivo: '', prestacion_id: '', estado: 'programado', notas: '' })
  const [pacienteSearch, setPacienteSearch] = useState('')
  const [pacienteSelNombre, setPacienteSelNombre] = useState('')
  const [showPacienteSugerencias, setShowPacienteSugerencias] = useState(false)
  const pacienteSearchRef = useRef(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Modal cobro
  const [modalCobro, setModalCobro] = useState(false)
  const [turnoACobrar, setTurnoACobrar] = useState(null)
  const [cobroForm, setCobroForm] = useState({ monto: '', metodo_pago: 'efectivo', concepto: '', monto_os: 0, monto_copago: 0 })
  const [cobroSaving, setCobroSaving] = useState(false)
  const [cobroError, setCobroError] = useState('')

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  useEffect(() => { load() }, [weekStart, vista, diaActual])

  async function load() {
    setLoading(true)
    let from, to
    if (vista === 'diaria') {
      from = startOfDay(diaActual).toISOString()
      to = endOfDay(diaActual).toISOString()
    } else {
      from = weekStart.toISOString()
      to = weekEnd.toISOString()
    }
    const [ts, ps, prests] = await Promise.all([
      api.turnos.list({ from, to }),
      api.pacientes.list(),
      api.prestaciones.list(),
    ])
    setTurnos(ts ?? [])
    setPacientes(ps ?? [])
    setPrestaciones(prests ?? [])
    setLoading(false)
  }

  function getTurnosForSlot(day, hour) {
    return turnos.filter(t => {
      const d = parseISO(t.fecha_hora)
      return isSameDay(d, day) && d.getHours() === hour
    })
  }

  function openNew(day, hour) {
    const dt = new Date(day)
    dt.setHours(hour, 0, 0, 0)
    setSelected(null)
    setForm({ paciente_id: '', fecha_hora: format(dt, "yyyy-MM-dd'T'HH:mm"), duracion_minutos: 60, motivo: '', prestacion_id: '', estado: 'programado', notas: '' })
    setPacienteSearch('')
    setPacienteSelNombre('')
    setShowPacienteSugerencias(false)
    setError('')
    setModal(true)
  }

  function openEdit(t) {
    // Si está completado, abrir modal de cobro directamente
    if (t.estado === 'completado') {
      openCobro(t)
      return
    }
    setSelected(t)
    setForm({
      paciente_id: t.paciente_id,
      fecha_hora: format(parseISO(t.fecha_hora), "yyyy-MM-dd'T'HH:mm"),
      duracion_minutos: t.duracion_minutos ?? 60,
      motivo: t.motivo ?? '',
      prestacion_id: t.prestacion_id ?? '',
      estado: t.estado,
      notas: t.notas ?? '',
    })
    setPacienteSearch('')
    setPacienteSelNombre(t.paciente_nombre ?? '')
    setShowPacienteSugerencias(false)
    setError('')
    setModal(true)
  }

  function openCobro(t) {
    const prestacion = prestaciones.find(p => p.id === t.prestacion_id)
    const montoBase = prestacion?.precio ?? 0
    setTurnoACobrar(t)
    setCobroForm({
      monto: String(montoBase),
      metodo_pago: 'efectivo',
      concepto: prestacion ? prestacion.nombre : (t.motivo || 'Consulta'),
      monto_os: 0,
      monto_copago: 0,
    })
    setCobroError('')
    setModalCobro(true)
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSave(e) {
    e.preventDefault()
    if (!form.paciente_id || !form.fecha_hora) { setError('Paciente y fecha/hora son requeridos'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form, duracion_minutos: Number(form.duracion_minutos) || 60 }
      if (!payload.prestacion_id) delete payload.prestacion_id

      // Si se está marcando como completado, mostrar modal cobro
      if (selected && payload.estado === 'completado' && selected.estado !== 'completado') {
        const updated = await api.turnos.update(selected.id, payload)
        setTurnos(prev => prev.map(t => t.id === selected.id ? { ...t, ...updated } : t))
        setModal(false)
        // Abrir modal cobro con el turno actualizado
        const turnoActualizado = { ...selected, ...updated }
        openCobro(turnoActualizado)
        return
      }

      if (selected) {
        const updated = await api.turnos.update(selected.id, payload)
        setTurnos(prev => prev.map(t => t.id === selected.id ? { ...t, ...updated } : t))
      } else {
        const created = await api.turnos.create(payload)
        setTurnos(prev => [...prev, created])
      }
      setModal(false)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
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

  async function handleCancel(id) {
    if (!confirm('¿Cancelar este turno?')) return
    await api.turnos.cancel(id)
    setTurnos(prev => prev.filter(t => t.id !== id))
    setModal(false)
  }

  const displayDays = vista === 'diaria' ? [diaActual] : days
  const gridCols = vista === 'diaria' ? 2 : 8

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Agenda</div>
          <div className="page-sub">
            {vista === 'semanal'
              ? `${format(weekStart, "d 'de' MMMM", { locale: es })} — ${format(weekEnd, "d 'de' MMMM, yyyy", { locale: es })}`
              : format(diaActual, "EEEE d 'de' MMMM yyyy", { locale: es })
            }
          </div>
        </div>
        <div className="page-actions">
          {/* Toggle vista */}
          <div style={{ display: 'flex', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            <button className={`btn btn-sm ${vista === 'diaria' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: 0, border: 'none' }} onClick={() => setVista('diaria')}>Día</button>
            <button className={`btn btn-sm ${vista === 'semanal' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: 0, border: 'none' }} onClick={() => setVista('semanal')}>Semana</button>
          </div>
          {vista === 'semanal' ? <>
            <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(w => subWeeks(w, 1))}>← Anterior</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Hoy</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(w => addWeeks(w, 1))}>Siguiente →</button>
          </> : <>
            <button className="btn btn-ghost btn-sm" onClick={() => setDiaActual(d => addDays(d, -1))}>← Anterior</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setDiaActual(new Date())}>Hoy</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setDiaActual(d => addDays(d, 1))}>Siguiente →</button>
          </>}
          <button className="btn btn-primary btn-sm" onClick={() => openNew(vista === 'diaria' ? diaActual : new Date(), new Date().getHours() || 9)}>+ Turno</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 40 }}><span className="spinner" /></div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(${displayDays.length}, 1fr)`, border: '1px solid var(--c-border)', borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--c-surface)', minWidth: vista === 'diaria' ? 300 : 700 }}>
              {/* Header días */}
              <div className="agenda-day-header" style={{ gridColumn: 1 }} />
              {displayDays.map((d, i) => (
                <div key={i} className={`agenda-day-header${isSameDay(d, new Date()) ? ' today' : ''}`}>
                  <div className="day-name">{format(d, 'EEE', { locale: es })}</div>
                  <div className="day-num">{format(d, 'd')}</div>
                </div>
              ))}

              {/* Slots por hora */}
              {HOURS.map(hour => (
                <React.Fragment key={hour}>
                  <div className="agenda-cell time-col">{String(hour).padStart(2,'0')}:00</div>
                  {displayDays.map((day, di) => {
                    const slots = getTurnosForSlot(day, hour)
                    return (
                      <div key={`${di}-${hour}`} className="agenda-cell"
                        onClick={() => slots.length === 0 && openNew(day, hour)}
                        style={{ cursor: slots.length === 0 ? 'pointer' : 'default', minHeight: 50 }}>
                        {slots.map(t => {
                          const style = ESTADO_CHIP_STYLE[t.estado] ?? ESTADO_CHIP_STYLE.programado
                          const tieneDeuda = (t.paciente_saldo ?? 0) < 0
                          return (
                            <div
                              key={t.id}
                              style={{ background: style.bg, borderLeft: `3px solid ${style.border}`, borderRadius: 4, padding: '4px 6px', fontSize: '.72rem', cursor: 'pointer', margin: 1, transition: 'box-shadow .15s', position: 'relative' }}
                              onClick={e => { e.stopPropagation(); openEdit(t) }}
                            >
                              {tieneDeuda && <span style={{ position: 'absolute', top: 2, right: 3, width: 7, height: 7, borderRadius: '50%', background: '#DC2626' }} title="Paciente con deuda" />}
                              <div style={{ color: style.border, opacity: .7, fontSize: '.68rem' }}>{format(parseISO(t.fecha_hora), 'HH:mm')}</div>
                              <div style={{ fontWeight: 600, color: style.nameColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.paciente_nombre ?? 'Paciente'}</div>
                              {t.estado === 'completado' && <div style={{ fontSize: '.65rem', color: '#64748B' }}>✓ Completado</div>}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Leyenda de colores */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12, fontSize: '.75rem', color: 'var(--c-text-2)' }}>
        {Object.entries(ESTADO_CHIP_STYLE).map(([estado, style]) => (
          <span key={estado} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: style.bg, border: `1.5px solid ${style.border}`, display: 'inline-block' }} />
            {estado.charAt(0).toUpperCase() + estado.slice(1).replace('_', ' ')}
          </span>
        ))}
      </div>

      {/* Modal turno */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{selected ? 'Editar turno' : 'Nuevo turno'}</span>
              <button className="btn-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">Paciente <span className="req">*</span></label>
                  {form.paciente_id && pacienteSelNombre ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', border: '1.5px solid var(--c-primary)', borderRadius: 'var(--radius-sm)', background: 'var(--c-primary-light)' }}>
                      <span style={{ flex: 1, fontSize: '.88rem', fontWeight: 600, color: 'var(--c-primary-dark)' }}>{pacienteSelNombre}</span>
                      <button type="button" className="btn-close" style={{ fontSize: '1rem', color: 'var(--c-primary)' }} onClick={() => {
                        setForm(f => ({ ...f, paciente_id: '' }))
                        setPacienteSelNombre('')
                        setPacienteSearch('')
                        setTimeout(() => pacienteSearchRef.current?.focus(), 50)
                      }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <input
                        ref={pacienteSearchRef}
                        className="form-input"
                        type="text"
                        placeholder="Buscar paciente por nombre o DNI..."
                        value={pacienteSearch}
                        onChange={e => { setPacienteSearch(e.target.value); setShowPacienteSugerencias(true) }}
                        onFocus={() => pacienteSearch && setShowPacienteSugerencias(true)}
                        onBlur={() => setTimeout(() => setShowPacienteSugerencias(false), 150)}
                        autoComplete="off"
                      />
                      {showPacienteSugerencias && pacienteSearch && (() => {
                        const q = pacienteSearch.toLowerCase()
                        const filtrados = pacientes.filter(p =>
                          p.nombre.toLowerCase().includes(q) ||
                          p.apellido.toLowerCase().includes(q) ||
                          (p.dni ?? '').toLowerCase().includes(q)
                        ).slice(0, 8)
                        if (!filtrados.length) return null
                        return (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300, background: 'var(--c-surface)', border: '1.5px solid var(--c-border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md)', maxHeight: 220, overflowY: 'auto' }}>
                            {filtrados.map(p => (
                              <div key={p.id}
                                style={{ padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid var(--c-border)', fontSize: '.86rem' }}
                                onMouseDown={() => {
                                  setForm(f => ({ ...f, paciente_id: p.id }))
                                  setPacienteSelNombre(`${p.apellido}, ${p.nombre}`)
                                  setPacienteSearch('')
                                  setShowPacienteSugerencias(false)
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--c-surface-2)'}
                                onMouseLeave={e => e.currentTarget.style.background = ''}
                              >
                                <span style={{ fontWeight: 600, color: 'var(--c-text)' }}>{p.apellido}, {p.nombre}</span>
                                {p.dni && <span style={{ marginLeft: 8, fontSize: '.78rem', color: 'var(--c-text-3)' }}>DNI {p.dni}</span>}
                                {p.obra_social && <span style={{ marginLeft: 8, fontSize: '.75rem', color: 'var(--c-primary)' }}>{p.obra_social}</span>}
                              </div>
                            ))}
                          </div>
                        )
                      })()}
                    </>
                  )}
                  {!form.paciente_id && <input type="text" required value="" onChange={() => {}} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }} tabIndex={-1} />}
                </div>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Fecha y hora <span className="req">*</span></label>
                    <input className="form-input" type="datetime-local" required value={form.fecha_hora} onChange={set('fecha_hora')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Duración (min)</label>
                    <select className="form-input" value={form.duracion_minutos} onChange={set('duracion_minutos')}>
                      {[15,20,30,45,60,90,120].map(d => <option key={d} value={d}>{d} min</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Prestación</label>
                  <select className="form-input" value={form.prestacion_id} onChange={set('prestacion_id')}>
                    <option value="">Sin prestación específica</option>
                    {prestaciones.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Motivo de consulta</label>
                  <input className="form-input" value={form.motivo} onChange={set('motivo')} placeholder="Ej: Control, blanqueamiento, dolor..." />
                </div>
                {selected && (
                  <div className="form-group">
                    <label className="form-label">Estado</label>
                    <select className="form-input" value={form.estado} onChange={set('estado')}>
                      <option value="programado">Programado</option>
                      <option value="confirmado">Confirmado</option>
                      <option value="presente">Presente</option>
                      <option value="completado">Completado</option>
                      <option value="ausente">Ausente</option>
                    </select>
                    {form.estado === 'completado' && selected.estado !== 'completado' && (
                      <span className="form-hint" style={{ color: 'var(--c-success)' }}>Al guardar se abrirá el modal de cobro</span>
                    )}
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Notas internas</label>
                  <textarea className="form-input" rows={2} value={form.notas} onChange={set('notas')} />
                </div>
                {error && <div className="alert alert-danger">{error}</div>}
              </div>
              <div className="modal-footer">
                {selected && (
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => handleCancel(selected.id)}>Cancelar turno</button>
                )}
                {selected && selected.estado !== 'completado' && (
                  <button type="button" className="btn btn-success btn-sm" onClick={() => {
                    setModal(false)
                    openCobro(selected)
                  }}>Cobrar</button>
                )}
                <div style={{ flex: 1 }} />
                <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cerrar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : selected ? 'Actualizar' : 'Crear turno'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal cobro */}
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
