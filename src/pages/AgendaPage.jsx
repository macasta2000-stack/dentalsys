import React, { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, isSameDay, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8) // 8 a 20

const ESTADO_COLOR = { programado:'info', confirmado:'info', presente:'success', completado:'neutral', ausente:'danger', cancelado:'neutral' }

export default function AgendaPage() {
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [turnos, setTurnos] = useState([])
  const [loading, setLoading] = useState(true)
  const [pacientes, setPacientes] = useState([])
  const [prestaciones, setPrestaciones] = useState([])
  const [modal, setModal] = useState(false)
  const [selected, setSelected] = useState(null) // turno seleccionado
  const [form, setForm] = useState({ paciente_id: '', fecha_hora: '', duracion_minutos: 60, motivo: '', prestacion_id: '', estado: 'programado', notas: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  useEffect(() => { load() }, [weekStart])

  async function load() {
    setLoading(true)
    const [ts, ps, prests] = await Promise.all([
      api.turnos.list({ from: weekStart.toISOString(), to: weekEnd.toISOString() }),
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
    setError('')
    setModal(true)
  }

  function openEdit(t) {
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
    setError('')
    setModal(true)
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSave(e) {
    e.preventDefault()
    if (!form.paciente_id || !form.fecha_hora) { setError('Paciente y fecha/hora son requeridos'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form, duracion_minutos: Number(form.duracion_minutos) || 60 }
      if (!payload.prestacion_id) delete payload.prestacion_id
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

  async function handleCancel(id) {
    if (!confirm('¿Cancelar este turno?')) return
    await api.turnos.cancel(id)
    setTurnos(prev => prev.filter(t => t.id !== id))
    setModal(false)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Agenda</div>
          <div className="page-sub">
            {format(weekStart, "d 'de' MMMM", { locale: es })} — {format(weekEnd, "d 'de' MMMM, yyyy", { locale: es })}
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(w => subWeeks(w, 1))}>← Anterior</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Hoy</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(w => addWeeks(w, 1))}>Siguiente →</button>
          <button className="btn btn-primary btn-sm" onClick={() => openNew(new Date(), new Date().getHours() || 9)}>+ Turno</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 40 }}><span className="spinner" /></div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <div className="agenda-grid" style={{ minWidth: 700 }}>
              {/* Header días */}
              <div className="agenda-day-header" style={{ gridColumn: 1 }} />
              {days.map((d, i) => (
                <div key={i} className={`agenda-day-header${isSameDay(d, new Date()) ? ' today' : ''}`}>
                  <div className="day-name">{format(d, 'EEE', { locale: es })}</div>
                  <div className="day-num">{format(d, 'd')}</div>
                </div>
              ))}

              {/* Slots por hora */}
              {HOURS.map(hour => (
                <React.Fragment key={hour}>
                  <div className="agenda-cell time-col">{String(hour).padStart(2,'0')}:00</div>
                  {days.map((day, di) => {
                    const slots = getTurnosForSlot(day, hour)
                    return (
                      <div key={`${di}-${hour}`} className="agenda-cell"
                        onClick={() => slots.length === 0 && openNew(day, hour)}
                        style={{ cursor: slots.length === 0 ? 'pointer' : 'default', minHeight: 50 }}>
                        {slots.map(t => (
                          <div key={t.id} className={`turno-chip ${t.estado}`} onClick={e => { e.stopPropagation(); openEdit(t) }}>
                            <div className="tc-time">{format(parseISO(t.fecha_hora), 'HH:mm')}</div>
                            <div className="tc-name">{t.paciente_nombre ?? 'Paciente'}</div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal turno */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{selected ? '✏️ Editar turno' : '📅 Nuevo turno'}</span>
              <button className="btn-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Paciente <span className="req">*</span></label>
                  <select className="form-input" required value={form.paciente_id} onChange={set('paciente_id')}>
                    <option value="">Seleccioná un paciente...</option>
                    {pacientes.map(p => <option key={p.id} value={p.id}>{p.apellido}, {p.nombre}</option>)}
                  </select>
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
                <div style={{ flex: 1 }} />
                <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cerrar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : selected ? 'Actualizar' : 'Crear turno'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
