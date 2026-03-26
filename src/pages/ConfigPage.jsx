import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'

export default function ConfigPage() {
  const { configuracion, updateConfiguracion } = useAuth()
  const [form, setForm] = useState({
    nombre_consultorio: '', nombre_profesional: '', matricula: '',
    especialidad: 'Odontología General', telefono: '', email: '',
    direccion: '', ciudad: 'Buenos Aires', cuit: '',
    duracion_turno_default: 60, horario_inicio: '08:00', horario_fin: '20:00',
  })
  const [prestaciones, setPrestaciones] = useState([])
  const [tab, setTab] = useState('general')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [prestModal, setPrestModal] = useState(false)
  const [prestForm, setPrestForm] = useState({ nombre: '', precio: '', duracion_minutos: 60, categoria: 'general', codigo: '' })
  const [prestSaving, setPrestSaving] = useState(false)

  const CATEGORIAS = ['diagnostico','preventiva','restauraciones','endodoncia','cirugia','protesis','implantes','estetica','ortodoncia','periodoncia','general']

  useEffect(() => {
    if (configuracion) setForm(f => ({ ...f, ...configuracion }))
    api.prestaciones.list().then(setPrestaciones).catch(() => {})
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

  async function handlePrestSave(e) {
    e.preventDefault()
    setPrestSaving(true)
    try {
      const p = await api.prestaciones.create({ ...prestForm, precio: Number(prestForm.precio), duracion_minutos: Number(prestForm.duracion_minutos) })
      setPrestaciones(prev => [...prev, p])
      setPrestModal(false)
      setPrestForm({ nombre: '', precio: '', duracion_minutos: 60, categoria: 'general', codigo: '' })
    } catch (e) { console.error('Error creando prestación:', e) }
    finally { setPrestSaving(false) }
  }

  async function togglePrest(id, activo) {
    await api.prestaciones.update(id, { activo: activo ? 0 : 1 })
    setPrestaciones(prev => prev.map(p => p.id === id ? { ...p, activo: activo ? 0 : 1 } : p))
  }

  const fmt = n => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0)

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Configuración</div>
      </div>

      <div className="tabs">
        {[['general', '🏥 Consultorio'], ['prestaciones', '🔧 Prestaciones'], ['agenda', '📅 Agenda']].map(([k, l]) => (
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
              {saved && <div className="alert alert-success">✓ Configuración guardada</div>}
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
            <button className="btn btn-primary btn-sm" onClick={() => setPrestModal(true)}>+ Nueva prestación</button>
          </div>
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Código</th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Duración</th><th>Activo</th></tr></thead>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
              {saved && <div className="alert alert-success">✓ Configuración guardada</div>}
              <div>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Modal nueva prestación */}
      {prestModal && (
        <div className="modal-overlay" onClick={() => setPrestModal(false)}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">🔧 Nueva Prestación</span>
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
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setPrestModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={prestSaving}>{prestSaving ? 'Guardando...' : 'Crear'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
