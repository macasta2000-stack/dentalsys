import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'

const fmt = n => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0)

export default function ConfigPage() {
  const { configuracion, updateConfiguracion } = useAuth()
  const [form, setForm] = useState({
    nombre_consultorio: '', nombre_profesional: '', matricula: '',
    especialidad: 'Odontología General', telefono: '', email: '',
    direccion: '', ciudad: 'Buenos Aires', cuit: '',
    duracion_turno_default: 60, horario_inicio: '08:00', horario_fin: '20:00',
  })
  const [prestaciones, setPrestaciones] = useState([])
  const [convenios, setConvenios] = useState([])
  const [tab, setTab] = useState('general')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Prestación: nueva/editar
  const [prestModal, setPrestModal] = useState(false)
  const [editPrest, setEditPrest] = useState(null)
  const [prestForm, setPrestForm] = useState({ nombre: '', precio: '', duracion_minutos: 60, categoria: 'general', codigo: '', descripcion: '' })
  const [prestSaving, setPrestSaving] = useState(false)

  // Convenio: nueva/editar
  const [convenioModal, setConvenioModal] = useState(false)
  const [editConvenio, setEditConvenio] = useState(null)
  const [convenioForm, setConvenioForm] = useState({ nombre_os: '', prestacion_id: '', monto_os: '', monto_copago: '' })
  const [convenioSaving, setConvenioSaving] = useState(false)

  const CATEGORIAS = ['diagnostico','preventiva','restauraciones','endodoncia','cirugia','protesis','implantes','estetica','ortodoncia','periodoncia','general']

  useEffect(() => {
    if (configuracion) setForm(f => ({ ...f, ...configuracion }))
    api.prestaciones.list().then(setPrestaciones).catch(() => {})
    api.convenios.list().then(setConvenios).catch(() => {})
  }, [configuracion])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    await updateConfiguracion(form)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  // Prestaciones
  function openNewPrest() {
    setEditPrest(null)
    setPrestForm({ nombre: '', precio: '', duracion_minutos: 60, categoria: 'general', codigo: '', descripcion: '' })
    setPrestModal(true)
  }

  function openEditPrest(p) {
    setEditPrest(p)
    setPrestForm({ nombre: p.nombre, precio: String(p.precio), duracion_minutos: p.duracion_minutos, categoria: p.categoria, codigo: p.codigo ?? '', descripcion: p.descripcion ?? '' })
    setPrestModal(true)
  }

  async function handlePrestSave(e) {
    e.preventDefault()
    setPrestSaving(true)
    try {
      const payload = { ...prestForm, precio: Number(prestForm.precio), duracion_minutos: Number(prestForm.duracion_minutos) }
      if (editPrest) {
        const updated = await api.prestaciones.update(editPrest.id, payload)
        setPrestaciones(prev => prev.map(p => p.id === editPrest.id ? { ...p, ...updated } : p))
      } else {
        const p = await api.prestaciones.create(payload)
        setPrestaciones(prev => [...prev, p])
      }
      setPrestModal(false)
    } catch (e) { console.error('Error guardando prestación:', e) }
    finally { setPrestSaving(false) }
  }

  async function togglePrest(id, activo) {
    await api.prestaciones.update(id, { activo: activo ? 0 : 1 })
    setPrestaciones(prev => prev.map(p => p.id === id ? { ...p, activo: activo ? 0 : 1 } : p))
  }

  // Convenios
  function openNewConvenio() {
    setEditConvenio(null)
    setConvenioForm({ nombre_os: '', prestacion_id: '', monto_os: '', monto_copago: '' })
    setConvenioModal(true)
  }

  function openEditConvenio(c) {
    setEditConvenio(c)
    setConvenioForm({ nombre_os: c.nombre_os, prestacion_id: c.prestacion_id ?? '', monto_os: String(c.monto_os ?? 0), monto_copago: String(c.monto_copago ?? 0) })
    setConvenioModal(true)
  }

  async function handleConvenioSave(e) {
    e.preventDefault()
    setConvenioSaving(true)
    try {
      const payload = {
        nombre_os: convenioForm.nombre_os,
        prestacion_id: convenioForm.prestacion_id || null,
        monto_os: Number(convenioForm.monto_os) || 0,
        monto_copago: Number(convenioForm.monto_copago) || 0,
      }
      if (editConvenio) {
        const updated = await api.convenios.update(editConvenio.id, payload)
        setConvenios(prev => prev.map(c => c.id === editConvenio.id ? { ...c, ...updated } : c))
      } else {
        const c = await api.convenios.create(payload)
        setConvenios(prev => [...prev, c])
      }
      setConvenioModal(false)
    } catch (e) { console.error('Error guardando convenio:', e) }
    finally { setConvenioSaving(false) }
  }

  async function desactivarConvenio(id) {
    if (!confirm('¿Desactivar este convenio?')) return
    await api.convenios.delete(id)
    setConvenios(prev => prev.map(c => c.id === id ? { ...c, activo: 0 } : c))
  }

  async function reactivarConvenio(id) {
    await api.convenios.update(id, { activo: 1 })
    setConvenios(prev => prev.map(c => c.id === id ? { ...c, activo: 1 } : c))
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Configuración</div>
      </div>

      <div className="tabs">
        {[['general','Consultorio'], ['prestaciones','Prestaciones'], ['obras_sociales','Obras Sociales'], ['agenda','Agenda']].map(([k, l]) => (
          <button key={k} className={`tab-btn${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'general' && (
        <div className="card">
          <div className="card-header"><span className="card-title">Datos del consultorio</span></div>
          <form onSubmit={handleSave}>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-row cols-2">
                <div className="form-group">
                  <label className="form-label">Nombre del consultorio</label>
                  <input className="form-input" value={form.nombre_consultorio} onChange={set('nombre_consultorio')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Especialidad</label>
                  <input className="form-input" value={form.especialidad} onChange={set('especialidad')} />
                </div>
              </div>
              <div className="form-row cols-2">
                <div className="form-group">
                  <label className="form-label">Nombre del profesional</label>
                  <input className="form-input" placeholder="Dr./Dra." value={form.nombre_profesional} onChange={set('nombre_profesional')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Matrícula profesional</label>
                  <input className="form-input" value={form.matricula} onChange={set('matricula')} />
                </div>
              </div>
              <div className="form-row cols-2">
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input className="form-input" value={form.telefono} onChange={set('telefono')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email del consultorio</label>
                  <input className="form-input" type="email" value={form.email} onChange={set('email')} />
                </div>
              </div>
              <div className="form-row cols-2">
                <div className="form-group">
                  <label className="form-label">Dirección</label>
                  <input className="form-input" value={form.direccion} onChange={set('direccion')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Ciudad</label>
                  <input className="form-input" value={form.ciudad} onChange={set('ciudad')} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">CUIT</label>
                <input className="form-input" placeholder="20-12345678-9" value={form.cuit} onChange={set('cuit')} style={{ maxWidth: 220 }} />
              </div>
              {saved && <div className="alert alert-success">Configuración guardada</div>}
              <div>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {tab === 'prestaciones' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Catálogo de prestaciones ({prestaciones.length})</span>
            <button className="btn btn-primary btn-sm" onClick={openNewPrest}>+ Nueva prestación</button>
          </div>
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Código</th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Duración</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {prestaciones.map(p => (
                  <tr key={p.id}>
                    <td className="text-sm text-muted">{p.codigo || '—'}</td>
                    <td className="td-main">{p.nombre}</td>
                    <td><span className="badge badge-neutral">{p.categoria}</span></td>
                    <td className="font-semibold">{fmt(p.precio)}</td>
                    <td className="text-sm">{p.duracion_minutos} min</td>
                    <td>
                      <button className={`btn btn-sm ${p.activo ? 'btn-success' : 'btn-ghost'}`} onClick={() => togglePrest(p.id, p.activo)}>
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEditPrest(p)}>Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'obras_sociales' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Convenios con Obras Sociales ({convenios.filter(c => c.activo).length} activos)</span>
            <button className="btn btn-primary btn-sm" onClick={openNewConvenio}>+ Nuevo convenio</button>
          </div>
          {convenios.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🏥</div>
              <div className="empty-title">Sin convenios registrados</div>
              <div className="empty-sub">Agregá convenios con obras sociales para agilizar la facturación</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Obra Social</th><th>Prestación</th><th>Monto OS</th><th>Copago</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  {convenios.map(c => (
                    <tr key={c.id} style={{ opacity: c.activo ? 1 : .5 }}>
                      <td className="td-main">{c.nombre_os}</td>
                      <td className="text-sm">{c.prestacion_nombre || '—'}</td>
                      <td className="font-semibold">{fmt(c.monto_os)}</td>
                      <td className="text-sm">{fmt(c.monto_copago)}</td>
                      <td><span className={`badge ${c.activo ? 'badge-success' : 'badge-neutral'}`}>{c.activo ? 'Activo' : 'Inactivo'}</span></td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEditConvenio(c)}>Editar</button>
                        {c.activo
                          ? <button className="btn btn-danger btn-sm" onClick={() => desactivarConvenio(c.id)}>Desactivar</button>
                          : <button className="btn btn-success btn-sm" onClick={() => reactivarConvenio(c.id)}>Reactivar</button>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'agenda' && (
        <div className="card">
          <div className="card-header"><span className="card-title">Configuración de agenda</span></div>
          <form onSubmit={handleSave}>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-row cols-3">
                <div className="form-group">
                  <label className="form-label">Horario de inicio</label>
                  <input className="form-input" type="time" value={form.horario_inicio} onChange={set('horario_inicio')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Horario de fin</label>
                  <input className="form-input" type="time" value={form.horario_fin} onChange={set('horario_fin')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Duración default del turno</label>
                  <select className="form-input" value={form.duracion_turno_default} onChange={set('duracion_turno_default')}>
                    {[15,20,30,45,60,90,120].map(d => <option key={d} value={d}>{d} minutos</option>)}
                  </select>
                </div>
              </div>
              {saved && <div className="alert alert-success">Configuración guardada</div>}
              <div>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Modal nueva/editar prestación */}
      {prestModal && (
        <div className="modal-overlay" onClick={() => setPrestModal(false)}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editPrest ? 'Editar Prestación' : 'Nueva Prestación'}</span>
              <button className="btn-close" onClick={() => setPrestModal(false)}>✕</button>
            </div>
            <form onSubmit={handlePrestSave}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Nombre <span className="req">*</span></label>
                    <input className="form-input" required value={prestForm.nombre} onChange={e => setPrestForm(f => ({ ...f, nombre: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Código</label>
                    <input className="form-input" placeholder="0101" value={prestForm.codigo} onChange={e => setPrestForm(f => ({ ...f, codigo: e.target.value }))} />
                  </div>
                </div>
                <div className="form-row cols-3">
                  <div className="form-group">
                    <label className="form-label">Precio (ARS)</label>
                    <input className="form-input" type="number" min="0" value={prestForm.precio} onChange={e => setPrestForm(f => ({ ...f, precio: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Duración (min)</label>
                    <select className="form-input" value={prestForm.duracion_minutos} onChange={e => setPrestForm(f => ({ ...f, duracion_minutos: e.target.value }))}>
                      {[15,20,30,45,60,90,120].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Categoría</label>
                    <select className="form-input" value={prestForm.categoria} onChange={e => setPrestForm(f => ({ ...f, categoria: e.target.value }))}>
                      {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Descripción</label>
                  <textarea className="form-input" rows={2} value={prestForm.descripcion} onChange={e => setPrestForm(f => ({ ...f, descripcion: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setPrestModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={prestSaving}>{prestSaving ? 'Guardando...' : editPrest ? 'Guardar cambios' : 'Crear'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal nuevo/editar convenio */}
      {convenioModal && (
        <div className="modal-overlay" onClick={() => setConvenioModal(false)}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editConvenio ? 'Editar Convenio' : 'Nuevo Convenio'}</span>
              <button className="btn-close" onClick={() => setConvenioModal(false)}>✕</button>
            </div>
            <form onSubmit={handleConvenioSave}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Nombre de la Obra Social <span className="req">*</span></label>
                  <input className="form-input" required value={convenioForm.nombre_os}
                    onChange={e => setConvenioForm(f => ({ ...f, nombre_os: e.target.value }))}
                    placeholder="OSDE, Swiss Medical, IOMA..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Prestación asociada</label>
                  <select className="form-input" value={convenioForm.prestacion_id}
                    onChange={e => setConvenioForm(f => ({ ...f, prestacion_id: e.target.value }))}>
                    <option value="">Aplica a todas las prestaciones</option>
                    {prestaciones.filter(p => p.activo).map(p => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Monto que paga la OS</label>
                    <input className="form-input" type="number" min="0" value={convenioForm.monto_os}
                      onChange={e => setConvenioForm(f => ({ ...f, monto_os: e.target.value }))} placeholder="$0" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Copago del paciente</label>
                    <input className="form-input" type="number" min="0" value={convenioForm.monto_copago}
                      onChange={e => setConvenioForm(f => ({ ...f, monto_copago: e.target.value }))} placeholder="$0" />
                  </div>
                </div>
                {(Number(convenioForm.monto_os) > 0 || Number(convenioForm.monto_copago) > 0) && (
                  <div className="alert alert-info" style={{ fontSize: '.82rem' }}>
                    Total: {fmt(Number(convenioForm.monto_os) + Number(convenioForm.monto_copago))}
                    (OS: {fmt(convenioForm.monto_os)}, copago: {fmt(convenioForm.monto_copago)})
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setConvenioModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={convenioSaving}>{convenioSaving ? 'Guardando...' : editConvenio ? 'Guardar cambios' : 'Crear convenio'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
