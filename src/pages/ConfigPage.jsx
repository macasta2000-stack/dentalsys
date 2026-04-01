import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { usePlanFeatures } from '../hooks/usePlanFeatures'
import { ROLE_DEFAULTS } from '../hooks/useRoleAccess'
import { api } from '../lib/api'
import SignaturePad from '../components/SignaturePad'
import { PRESETS_ESPECIALIDADES, ESPECIALIDADES_LISTA } from '../data/prestaciones-presets'

const fmt = n => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0)

const PERMISOS_MODULES = [
  { key: 'pacientes',     label: '👤 Pacientes',         planFeature: null },
  { key: 'agenda',        label: '📅 Agenda',             planFeature: null },
  { key: 'caja',          label: '💵 Caja',               planFeature: null },
  { key: 'crm',           label: '💬 CRM',                planFeature: 'crm' },
  { key: 'reportes',      label: '📊 Reportes',           planFeature: 'reportes_avanzados' },
  { key: 'insumos',       label: '📦 Insumos',            planFeature: 'insumos' },
  { key: 'recetas',       label: '📋 Recetas / Órdenes',  planFeature: null },
]

export default function ConfigPage() {
  const { configuracion, updateConfiguracion } = useAuth()
  const addToast = useToast()
  const { hasFeature } = usePlanFeatures()
  const [form, setForm] = useState({
    nombre_consultorio: '', nombre_profesional: '', matricula: '',
    especialidad: '', telefono: '', email: '',
    direccion: '', ciudad: 'Buenos Aires', cuit: '',
    duracion_turno_default: 60, horario_inicio: '08:00', horario_fin: '20:00',
    firma_digital: '',
  })
  const [modalConfirm, setModalConfirm] = useState(null) // { tipo, id, msg, onConfirm }
  const [confirmando, setConfirmando] = useState(false)
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

  // Preset carga
  const [presetSeleccionado, setPresetSeleccionado] = useState('')
  const [loadingPreset, setLoadingPreset] = useState(false)

  // Convenio: nueva/editar
  const [convenioModal, setConvenioModal] = useState(false)
  const [editConvenio, setEditConvenio] = useState(null)
  const [convenioForm, setConvenioForm] = useState({ nombre_os: '', prestacion_nombre: '', monto_os: '', monto_copago: '' })
  const [convenioSaving, setConvenioSaving] = useState(false)

  // Equipo / colaboradores
  const [colaboradores, setColaboradores] = useState([])
  const [equipoModal, setEquipoModal] = useState(false)
  const [editColab, setEditColab] = useState(null)
  const [equipoForm, setEquipoForm] = useState({ nombre: '', apellido: '', rol: 'profesional', email: '', telefono: '', matricula: '', especialidad: '', porcentaje_comision: 0, duracion_default: 30, firma_digital: '', password: '', confirmar_password: '' })
  const [equipoSaving, setEquipoSaving] = useState(false)
  // Modal de acceso (contraseña)
  const [accesoModal, setAccesoModal] = useState(false)
  const [accesoColab, setAccesoColab] = useState(null)
  const [accesoForm, setAccesoForm] = useState({ password: '', confirmar: '' })
  const [accesoSaving, setAccesoSaving] = useState(false)

  const CATEGORIAS = ['consulta','diagnostico','procedimiento','cirugia','estudios','internacion','rehabilitacion','estetica','preventiva','pediatria','geriatria','urgencia','general']

  useEffect(() => {
    if (configuracion) {
      setForm(f => ({ ...f, ...configuracion }))
      if (configuracion.permisos_roles) {
        try {
          const parsed = typeof configuracion.permisos_roles === 'string'
            ? JSON.parse(configuracion.permisos_roles)
            : configuracion.permisos_roles
          setPermisosRoles(prev => ({ ...prev, ...parsed }))
        } catch {}
      }
    }
    api.prestaciones.list().then(setPrestaciones).catch(() => {})
    api.convenios.list().then(setConvenios).catch(() => {})
    api.colaboradores.list().then(setColaboradores).catch(() => {})
  }, [configuracion])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await updateConfiguracion(form)
    setSaving(false)
    if (error) { addToast(error, 'error'); return }
    setSaved(true)
    addToast('Configuración guardada correctamente', 'success')
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
    } catch (e) { addToast(e.message || 'Error al guardar la prestación', 'error') }
    finally { setPrestSaving(false) }
  }

  async function togglePrest(id, activo) {
    try {
      await api.prestaciones.update(id, { activo: activo ? 0 : 1 })
      setPrestaciones(prev => prev.map(p => p.id === id ? { ...p, activo: activo ? 0 : 1 } : p))
    } catch { addToast('Error al actualizar la prestación', 'error') }
  }

  async function cargarPreset() {
    if (!presetSeleccionado) return
    const preset = PRESETS_ESPECIALIDADES[presetSeleccionado]
    if (!preset) return
    if (!confirm(`¿Cargar el preset de "${preset.label}"?\n\nEsto REEMPLAZARÁ todas las prestaciones actuales con las ${preset.prestaciones.length} prestaciones del preset.`)) return
    setLoadingPreset(true)
    try {
      await api.onboarding.cargarPreset(presetSeleccionado)
      const refreshed = await api.prestaciones.list()
      setPrestaciones(refreshed ?? [])
      addToast(`${preset.prestaciones.length} prestaciones de "${preset.label}" cargadas correctamente`, 'success')
    } catch (e) {
      addToast(e.message ?? 'Error al cargar el preset', 'error')
    } finally {
      setLoadingPreset(false)
    }
  }

  // Convenios
  function openNewConvenio() {
    setEditConvenio(null)
    setConvenioForm({ nombre_os: '', prestacion_nombre: '', monto_os: '', monto_copago: '' })
    setConvenioModal(true)
  }

  function openEditConvenio(c) {
    setEditConvenio(c)
    setConvenioForm({ nombre_os: c.nombre_os, prestacion_nombre: c.prestacion_nombre ?? '', monto_os: String(c.monto_os ?? 0), monto_copago: String(c.monto_copago ?? 0) })
    setConvenioModal(true)
  }

  async function handleConvenioSave(e) {
    e.preventDefault()
    setConvenioSaving(true)
    try {
      const prestMatch = prestaciones.find(p => p.nombre.toLowerCase() === convenioForm.prestacion_nombre.trim().toLowerCase())
      const payload = {
        nombre_os: convenioForm.nombre_os,
        prestacion_id: prestMatch?.id ?? null,
        monto_os: Number(convenioForm.monto_os) || 0,
        monto_copago: Number(convenioForm.monto_copago) || 0,
      }
      if (editConvenio) {
        await api.convenios.update(editConvenio.id, payload)
      } else {
        await api.convenios.create(payload)
      }
      // Reload list to get prestacion_nombre from JOIN
      const refreshed = await api.convenios.list().catch(() => convenios)
      setConvenios(refreshed)
      setConvenioModal(false)
    } catch (e) { addToast(e.message || 'Error al guardar el convenio', 'error') }
    finally { setConvenioSaving(false) }
  }

  function desactivarConvenio(id) {
    setModalConfirm({
      msg: '¿Desactivar este convenio? Podés reactivarlo cuando quieras.',
      onConfirm: async () => {
        // Soft delete: solo marca como inactivo, NO elimina
        await api.convenios.update(id, { activo: 0 })
        setConvenios(prev => prev.map(c => c.id === id ? { ...c, activo: 0 } : c))
        addToast('Convenio desactivado', 'success')
      }
    })
  }

  async function reactivarConvenio(id) {
    await api.convenios.update(id, { activo: 1 })
    setConvenios(prev => prev.map(c => c.id === id ? { ...c, activo: 1 } : c))
  }

  // Equipo
  function openNewColab() {
    setEditColab(null)
    setEquipoForm({ nombre: '', apellido: '', rol: 'profesional', email: '', telefono: '', matricula: '', especialidad: '', porcentaje_comision: 0, duracion_default: 30, firma_digital: '', password: '', confirmar_password: '' })
    setEquipoModal(true)
  }
  function openEditColab(c) {
    setEditColab(c)
    setEquipoForm({ nombre: c.nombre, apellido: c.apellido ?? '', rol: c.rol ?? 'profesional', email: c.email ?? '', telefono: c.telefono ?? '', matricula: c.matricula ?? '', especialidad: c.especialidad ?? '', porcentaje_comision: c.porcentaje_comision ?? 0, duracion_default: c.duracion_default ?? 30, firma_digital: c.firma_digital ?? '', password: '', confirmar_password: '' })
    setEquipoModal(true)
  }
  async function handleEquipoSave(e) {
    e.preventDefault()
    // Validar contraseñas si se ingresaron
    if (equipoForm.password && equipoForm.password !== equipoForm.confirmar_password) {
      addToast('Las contraseñas no coinciden', 'error')
      return
    }
    if (equipoForm.password && equipoForm.password.length < 8) {
      addToast('La contraseña debe tener al menos 8 caracteres', 'error')
      return
    }
    setEquipoSaving(true)
    try {
      // No enviar confirmar_password al backend
      const { confirmar_password, ...payload } = equipoForm
      // Solo enviar password si se ingresó uno
      if (!payload.password) delete payload.password
      if (editColab) {
        const updated = await api.colaboradores.update(editColab.id, payload)
        setColaboradores(prev => prev.map(c => c.id === editColab.id ? { ...c, ...updated } : c))
        addToast('Colaborador actualizado correctamente', 'success')
      } else {
        const c = await api.colaboradores.create(payload)
        setColaboradores(prev => [...prev, c])
        addToast('Colaborador agregado correctamente', 'success')
      }
      setEquipoModal(false)
    } catch (e) {
      addToast(e.message ?? 'No se pudo guardar el colaborador', 'error')
      console.error(e)
    } finally { setEquipoSaving(false) }
  }
  function deleteColab(id, nombre) {
    setModalConfirm({
      msg: `¿Eliminar a ${nombre} del equipo?`,
      onConfirm: async () => {
        await api.colaboradores.delete(id)
        setColaboradores(prev => prev.filter(c => c.id !== id))
        addToast('Colaborador eliminado', 'success')
      }
    })
  }

  function openAccesoModal(c) {
    setAccesoColab(c)
    setAccesoForm({ password: '', confirmar: '' })
    setAccesoModal(true)
  }

  async function handleAccesoSave(e) {
    e.preventDefault()
    if (!accesoForm.password) { addToast('Ingresá una contraseña', 'error'); return }
    if (accesoForm.password.length < 8) { addToast('La contraseña debe tener al menos 8 caracteres', 'error'); return }
    if (accesoForm.password !== accesoForm.confirmar) { addToast('Las contraseñas no coinciden', 'error'); return }
    setAccesoSaving(true)
    try {
      const updated = await api.colaboradores.update(accesoColab.id, { password: accesoForm.password })
      setColaboradores(prev => prev.map(c => c.id === accesoColab.id ? { ...c, ...updated } : c))
      addToast(`Acceso configurado para ${accesoColab.nombre}. Ya puede iniciar sesión.`, 'success')
      setAccesoModal(false)
    } catch (e) {
      addToast(e.message ?? 'No se pudo guardar la contraseña', 'error')
    } finally { setAccesoSaving(false) }
  }

  async function handleRevocarAcceso(c) {
    setModalConfirm({
      msg: `¿Revocar el acceso al sistema de ${c.nombre} ${c.apellido ?? ''}? No podrá iniciar sesión hasta que le asignés una nueva contraseña.`,
      onConfirm: async () => {
        await api.colaboradores.update(c.id, { revocar_acceso: true })
        setColaboradores(prev => prev.map(col => col.id === c.id ? { ...col, tiene_acceso: false } : col))
        addToast(`Acceso revocado para ${c.nombre}`, 'success')
      }
    })
  }

  // Permisos por rol
  const [permisosRoles, setPermisosRoles] = useState(ROLE_DEFAULTS)
  const [permisosSaving, setPermisosSaving] = useState(false)

  async function handlePermisosSave() {
    setPermisosSaving(true)
    const { error } = await updateConfiguracion({ permisos_roles: JSON.stringify(permisosRoles) })
    setPermisosSaving(false)
    if (error) addToast(error, 'error')
    else addToast('Permisos guardados correctamente', 'success')
  }

  function togglePermiso(rol, modulo, value) {
    setPermisosRoles(prev => ({
      ...prev,
      [rol]: { ...prev[rol], [modulo]: value },
    }))
  }

  const ROL_LABEL = { admin: 'Administrador', profesional: 'Profesional', recepcionista: 'Recepcionista' }

  // API Keys
  const [apiKeys, setApiKeys] = useState([])
  const [apiKeysLoaded, setApiKeysLoaded] = useState(false)
  const [apiKeyCreating, setApiKeyCreating] = useState(false)
  const [newKeyNombre, setNewKeyNombre] = useState('')
  const [newKeyResult, setNewKeyResult] = useState(null) // { full_key, nombre }
  const [apiKeyDeleting, setApiKeyDeleting] = useState(null)
  const [apiKeyCopied, setApiKeyCopied] = useState(false)

  useEffect(() => {
    if (tab === 'api' && !apiKeysLoaded && hasFeature('api_access')) {
      api.developer.listKeys().then(keys => { setApiKeys(keys ?? []); setApiKeysLoaded(true) }).catch(() => setApiKeysLoaded(true))
    }
  }, [tab, apiKeysLoaded, hasFeature])

  async function handleCreateKey(e) {
    e.preventDefault()
    setApiKeyCreating(true)
    try {
      const result = await api.developer.createKey(newKeyNombre || 'Mi API Key')
      setApiKeys(prev => [{ id: result.id, nombre: result.nombre, key_prefix: result.key_prefix, activo: 1, created_at: result.created_at }, ...prev])
      setNewKeyResult(result)
      setNewKeyNombre('')
    } catch (err) { addToast(err.message || 'Error al crear la clave', 'error') }
    finally { setApiKeyCreating(false) }
  }

  async function handleDeleteKey(id) {
    setApiKeyDeleting(id)
    try {
      await api.developer.deleteKey(id)
      setApiKeys(prev => prev.filter(k => k.id !== id))
      addToast('Clave revocada correctamente', 'success')
    } catch (e) { addToast(e.message || 'Error al revocar la clave', 'error') }
    finally { setApiKeyDeleting(null) }
  }

  function copyKey(key) {
    navigator.clipboard.writeText(key).then(() => { setApiKeyCopied(true); setTimeout(() => setApiKeyCopied(false), 2000) }).catch(() => {})
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Configuración</div>
      </div>

      <div className="tabs">
        {[['general','Consultorio'], ['prestaciones','Prestaciones'], ['obras_sociales','Obras Sociales'], ['agenda','Agenda'], ['equipo','Equipo'], ['permisos','Permisos'], ['workflow','Flujo de Atención'], ['recetas_config','Recetas y Fármacos'], ['notificaciones','Notificaciones'], ['api','🔌 API']].map(([k, l]) => (
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
                  <input className="form-input" placeholder="" value={form.nombre_profesional} onChange={set('nombre_profesional')} />
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
                <input className="form-input" placeholder="" value={form.cuit} onChange={set('cuit')} style={{ maxWidth: 220 }} />
              </div>

              {/* ── Firma digital ── */}
              <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 20, marginTop: 8 }}>
                <div style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: 4 }}>Firma digital del profesional</div>
                <div style={{ fontSize: '.82rem', color: 'var(--c-text-3)', marginBottom: 12 }}>
                  Esta firma aparece automáticamente en las recetas y documentos que emitís desde el sistema.
                </div>
                <SignaturePad
                  value={form.firma_digital}
                  onChange={v => setForm(f => ({ ...f, firma_digital: v }))}
                  height={150}
                />
              </div>

              {saved && <div className="alert alert-success">✅ Configuración guardada</div>}
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

          {/* Carga de preset por especialidad */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface-2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.82rem', color: 'var(--c-text-2)', fontWeight: 600, flexShrink: 0 }}>📥 Cargar preset:</span>
            <select
              className="form-input"
              style={{ flex: 1, minWidth: 200, maxWidth: 320, padding: '6px 10px', fontSize: '.84rem' }}
              value={presetSeleccionado}
              onChange={e => setPresetSeleccionado(e.target.value)}
            >
              <option value="">— Seleccioná una especialidad —</option>
              {ESPECIALIDADES_LISTA.map(e => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </select>
            <button
              className="btn btn-ghost btn-sm"
              disabled={!presetSeleccionado || loadingPreset}
              onClick={cargarPreset}
              style={{ flexShrink: 0 }}
            >
              {loadingPreset ? 'Cargando...' : '📥 Cargar prestaciones'}
            </button>
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
                      <td className="td-main">
                        {c.nombre_os}
                        {(!c.monto_os && !c.monto_copago) && (
                          <span style={{background:'#78350f', color:'#fde68a', padding:'2px 8px', borderRadius:'4px', fontSize:'0.7rem', fontWeight:'700', marginLeft: 8}}>
                            ⚠️ Sin precio
                          </span>
                        )}
                      </td>
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

      {/* TAB: EQUIPO */}
      {tab === 'equipo' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Equipo del consultorio</span>
            <button className="btn btn-primary btn-sm" onClick={openNewColab}>+ Agregar integrante</button>
          </div>

          {/* Info sobre accesos */}
          <div style={{ padding: '12px 20px', background: '#F0F9FF', borderBottom: '1px solid #BAE6FD', fontSize: '.82rem', color: '#0369A1', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🔐</span>
            <span>Los integrantes con <strong>acceso activo</strong> pueden iniciar sesión en <strong>Clingest</strong> con su email y contraseña.</span>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            {colaboradores.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--c-text-3)' }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>👥</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Sin integrantes registrados</div>
                <div className="text-sm">Agregá los profesionales y recepcionistas de tu consultorio.</div>
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Rol</th>
                    <th>Email</th>
                    <th>Teléfono</th>
                    <th>Acceso al sistema</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {colaboradores.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.apellido ? `${c.apellido}, ${c.nombre}` : c.nombre}</td>
                      <td>
                        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 100, fontSize: '.75rem', fontWeight: 600,
                          background: c.rol === 'admin' ? '#EFF6FF' : c.rol === 'profesional' ? '#F0FDF4' : '#FFF7ED',
                          color: c.rol === 'admin' ? '#1D4ED8' : c.rol === 'profesional' ? '#15803D' : '#C2410C' }}>
                          {ROL_LABEL[c.rol] ?? c.rol}
                        </span>
                      </td>
                      <td className="text-sm">{c.email || '—'}</td>
                      <td className="text-sm">{c.especialidad || c.telefono || '—'}</td>

                      {/* ── Columna de Acceso ── */}
                      <td>
                        {c.tiene_acceso ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#DCFCE7', color: '#15803D', padding: '3px 10px', borderRadius: 100, fontSize: '.73rem', fontWeight: 700 }}>
                              ✓ Activo
                            </span>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: '.72rem', color: 'var(--c-text-3)' }}
                              title="Cambiar contraseña"
                              onClick={() => openAccesoModal(c)}>
                              🔑 Cambiar
                            </button>
                          </div>
                        ) : (
                          <button
                            className="btn btn-sm"
                            style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', fontWeight: 600, fontSize: '.78rem' }}
                            onClick={() => openAccesoModal(c)}>
                            🔐 Dar acceso
                          </button>
                        )}
                      </td>

                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEditColab(c)}>Editar</button>
                          {c.tiene_acceso && (
                            <button className="btn btn-ghost btn-sm" style={{ color: '#d97706', fontSize: '.75rem' }} title="Revocar acceso al sistema" onClick={() => handleRevocarAcceso(c)}>🚫</button>
                          )}
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--c-danger)' }} onClick={() => deleteColab(c.id, `${c.nombre} ${c.apellido ?? ''}`.trim())}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'permisos' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Permisos por rol</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{ color: 'var(--c-text-2)', fontSize: '.875rem', margin: 0 }}>
              Configurá qué módulos puede ver y usar cada rol en tu consultorio.
              Los módulos no incluidos en tu plan aparecen bloqueados.
            </p>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--c-border)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--c-text-3)', fontWeight: 700, fontSize: '.78rem', textTransform: 'uppercase' }}>Módulo</th>
                    <th style={{ padding: '10px 20px', textAlign: 'center', color: 'var(--c-text-3)', fontWeight: 700, fontSize: '.78rem', textTransform: 'uppercase' }}>🩺 Profesional</th>
                    <th style={{ padding: '10px 20px', textAlign: 'center', color: 'var(--c-text-3)', fontWeight: 700, fontSize: '.78rem', textTransform: 'uppercase' }}>📋 Recepcionista</th>
                  </tr>
                </thead>
                <tbody>
                  {PERMISOS_MODULES.map(({ key, label, planFeature }) => {
                    const planLocked = planFeature && !hasFeature(planFeature)
                    return (
                      <tr key={key} style={{ borderBottom: '1px solid var(--c-border)' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 500 }}>
                          {label}
                          {planLocked && <span style={{ marginLeft: 8, fontSize: '.72rem', background: '#e2e8f0', color: '#64748b', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>PRO</span>}
                        </td>
                        {['profesional', 'recepcionista'].map(rol => {
                          // Recetas para profesional: siempre ON, no se puede cambiar
                          const forcedOn = key === 'recetas' && rol === 'profesional'
                          const disabled = planLocked || forcedOn
                          const checked = forcedOn ? true : (permisosRoles[rol]?.[key] ?? ROLE_DEFAULTS[rol]?.[key] ?? false)
                          return (
                            <td key={rol} style={{ padding: '12px 20px', textAlign: 'center' }}>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={disabled}
                                  onChange={e => togglePermiso(rol, key, e.target.checked)}
                                  style={{ width: 16, height: 16, cursor: disabled ? 'not-allowed' : 'pointer' }}
                                />
                                {forcedOn && <span style={{ fontSize: '.7rem', color: 'var(--c-primary)', fontWeight: 600 }}>siempre</span>}
                              </label>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingTop: 8 }}>
              <button className="btn btn-primary" disabled={permisosSaving} onClick={handlePermisosSave}>
                {permisosSaving ? 'Guardando...' : 'Guardar permisos'}
              </button>
              <span style={{ fontSize: '.8rem', color: 'var(--c-text-3)' }}>
                Los cambios aplican inmediatamente para los colaboradores.
              </span>
            </div>
          </div>
        </div>
      )}

      {tab === 'workflow' && (
        <WorkflowTab form={form} set={set} handleSave={handleSave} saving={saving} saved={saved} />
      )}

      {tab === 'recetas_config' && (
        <RecetasConfigTab form={form} set={set} setForm={setForm} handleSave={handleSave} saving={saving} />
      )}

      {tab === 'notificaciones' && (
        <NotificacionesTab form={form} set={set} handleSave={handleSave} saving={saving} saved={saved} />
      )}

      {tab === 'api' && (
        !hasFeature('api_access') ? (
          <div className="card" style={{ textAlign: 'center', padding: '52px 32px' }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔌</div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>Acceso API — Plan Clínica</h3>
            <p style={{ color: 'var(--c-text-2)', maxWidth: 460, margin: '0 auto 24px', fontSize: '.9rem' }}>
              Conectá Clingest con tu sistema de laboratorio, facturación electrónica, o cualquier herramienta externa vía REST API con tu clave privada.
            </p>
            <a href="/suscripcion" className="btn btn-primary">Ver planes →</a>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Introducción */}
            <div className="card" style={{ padding: '20px 24px', background: 'var(--c-primary-light)', border: '1px solid var(--c-primary-light)' }}>
              <div style={{ fontWeight: 700, fontSize: '.9rem', color: 'var(--c-primary-dark)', marginBottom: 8 }}>🔌 Cómo usar la API</div>
              <p style={{ fontSize: '.84rem', color: 'var(--c-primary-dark)', margin: '0 0 10px' }}>
                Autenticá tus requests con el header <code style={{ background: 'rgba(0,0,0,.08)', padding: '1px 5px', borderRadius: 3 }}>X-Api-Key</code>:
              </p>
              <code style={{ display: 'block', background: 'rgba(0,0,0,.1)', padding: '10px 14px', borderRadius: 6, fontSize: '.8rem', color: 'var(--c-primary-dark)', wordBreak: 'break-all' }}>
                curl -H "X-Api-Key: msy_..." https://tu-consultorio.pages.dev/api/pacientes
              </code>
              <div style={{ fontSize: '.78rem', color: 'var(--c-primary-dark)', marginTop: 10, opacity: .75 }}>
                Todos los endpoints de /api/pacientes, /api/turnos, /api/pagos, /api/evoluciones, etc. aceptan autenticación por API key.
              </div>
            </div>

            {/* Claves existentes */}
            <div className="card">
              <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="card-title">Claves API</span>
                <span style={{ fontSize: '.8rem', color: 'var(--c-text-3)' }}>{apiKeys.length} clave{apiKeys.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                {apiKeys.length === 0 ? (
                  <div style={{ padding: '28px 24px', textAlign: 'center', color: 'var(--c-text-3)', fontSize: '.875rem' }}>
                    No tenés claves creadas todavía
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface-2)' }}>
                        <th style={{ padding: '9px 16px', textAlign: 'left', fontSize: '.75rem', fontWeight: 700, color: 'var(--c-text-3)', textTransform: 'uppercase' }}>Nombre</th>
                        <th style={{ padding: '9px 16px', textAlign: 'left', fontSize: '.75rem', fontWeight: 700, color: 'var(--c-text-3)', textTransform: 'uppercase' }}>Prefijo</th>
                        <th style={{ padding: '9px 16px', textAlign: 'left', fontSize: '.75rem', fontWeight: 700, color: 'var(--c-text-3)', textTransform: 'uppercase' }}>Último uso</th>
                        <th style={{ padding: '9px 16px', textAlign: 'left', fontSize: '.75rem', fontWeight: 700, color: 'var(--c-text-3)', textTransform: 'uppercase' }}>Creada</th>
                        <th style={{ padding: '9px 16px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {apiKeys.map(k => (
                        <tr key={k.id} style={{ borderBottom: '1px solid var(--c-border)' }}>
                          <td style={{ padding: '10px 16px', fontWeight: 600 }}>{k.nombre}</td>
                          <td style={{ padding: '10px 16px' }}>
                            <code style={{ background: 'var(--c-surface-2)', padding: '2px 7px', borderRadius: 4, fontSize: '.8rem' }}>{k.key_prefix}...</code>
                          </td>
                          <td style={{ padding: '10px 16px', color: 'var(--c-text-3)', fontSize: '.8rem' }}>
                            {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString('es-AR') : 'Nunca'}
                          </td>
                          <td style={{ padding: '10px 16px', color: 'var(--c-text-3)', fontSize: '.8rem' }}>
                            {k.created_at ? new Date(k.created_at).toLocaleDateString('es-AR') : '—'}
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                            <button className="btn btn-sm btn-danger" disabled={apiKeyDeleting === k.id}
                              onClick={() => handleDeleteKey(k.id)}>
                              {apiKeyDeleting === k.id ? '...' : 'Revocar'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Formulario para crear nueva clave */}
                <div style={{ padding: '16px 20px', borderTop: apiKeys.length > 0 ? '1px solid var(--c-border)' : 'none' }}>
                  <form onSubmit={handleCreateKey} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ flex: 1, margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '.8rem' }}>Nombre de la clave (para identificarla)</label>
                      <input className="form-input" value={newKeyNombre}
                        onChange={e => setNewKeyNombre(e.target.value)} />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={apiKeyCreating} style={{ whiteSpace: 'nowrap' }}>
                      {apiKeyCreating ? 'Generando...' : '+ Generar clave'}
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* Modal: nueva clave generada */}
            {newKeyResult && (
              <div className="modal-overlay">
                <div className="modal modal-md" onClick={e => e.stopPropagation()}>
                  <div className="modal-header">
                    <span className="modal-title">✅ Clave generada — {newKeyResult.nombre}</span>
                    <button className="btn-close" onClick={() => setNewKeyResult(null)}>✕</button>
                  </div>
                  <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="alert alert-danger" style={{ margin: 0 }}>
                      ⚠️ <strong>Guardá esta clave ahora.</strong> No podrás verla de nuevo — solo se muestra una vez.
                    </div>
                    <div style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 8, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <code style={{ flex: 1, fontSize: '.82rem', wordBreak: 'break-all', color: 'var(--c-text)', fontFamily: 'monospace' }}>
                        {newKeyResult.full_key}
                      </code>
                      <button className="btn btn-sm btn-ghost" onClick={() => copyKey(newKeyResult.full_key)} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {apiKeyCopied ? '✅ Copiado' : '📋 Copiar'}
                      </button>
                    </div>
                    <p style={{ fontSize: '.82rem', color: 'var(--c-text-3)', margin: 0 }}>
                      Usala en el header <code>X-Api-Key</code> de tus requests. Podés crear múltiples claves para distintas integraciones.
                    </p>
                  </div>
                  <div className="modal-footer">
                    <button className="btn btn-primary" onClick={() => setNewKeyResult(null)}>Listo, la guardé</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* Modal nueva/editar prestación */}
      {prestModal && (
        <div className="modal-overlay">
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
                    <input className="form-input" placeholder="" value={prestForm.codigo} onChange={e => setPrestForm(f => ({ ...f, codigo: e.target.value }))} />
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

      {/* Modal nuevo/editar colaborador */}
      {equipoModal && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editColab ? 'Editar integrante' : 'Nuevo integrante'}</span>
              <button className="btn-close" onClick={() => setEquipoModal(false)}>✕</button>
            </div>
            <form onSubmit={handleEquipoSave}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Nombre <span className="req">*</span></label>
                    <input className="form-input" required value={equipoForm.nombre} onChange={e => setEquipoForm(f => ({ ...f, nombre: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Apellido</label>
                    <input className="form-input" value={equipoForm.apellido} onChange={e => setEquipoForm(f => ({ ...f, apellido: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Rol</label>
                  <select className="form-input" value={equipoForm.rol} onChange={e => setEquipoForm(f => ({ ...f, rol: e.target.value }))}>
                    <option value="profesional">Profesional de la Salud</option>
                    <option value="recepcionista">Recepcionista</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-input" type="email" value={equipoForm.email} onChange={e => setEquipoForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input className="form-input" value={equipoForm.telefono} onChange={e => setEquipoForm(f => ({ ...f, telefono: e.target.value }))} />
                  </div>
                </div>

                {equipoForm.rol === 'profesional' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Especialidad</label>
                      <input className="form-input" placeholder="Ej: Odontología general, Ortodoncia..."
                        value={equipoForm.especialidad} onChange={e => setEquipoForm(f => ({ ...f, especialidad: e.target.value }))} />
                    </div>
                    <div className="form-row cols-2">
                      <div className="form-group">
                        <label className="form-label">Matrícula</label>
                        <input className="form-input" value={equipoForm.matricula} onChange={e => setEquipoForm(f => ({ ...f, matricula: e.target.value }))} placeholder="" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Duración de turno (min)</label>
                        <select className="form-input" value={equipoForm.duracion_default ?? 30} onChange={e => setEquipoForm(f => ({ ...f, duracion_default: parseInt(e.target.value) }))}>
                          <option value={15}>15 min</option>
                          <option value={20}>20 min</option>
                          <option value={30}>30 min</option>
                          <option value={45}>45 min</option>
                          <option value={60}>60 min</option>
                          <option value={90}>90 min</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">% Comisión sobre prestaciones</label>
                      <input className="form-input" type="number" min="0" max="100" step="0.1"
                        placeholder="0" value={equipoForm.porcentaje_comision}
                        onChange={e => setEquipoForm(f => ({ ...f, porcentaje_comision: parseFloat(e.target.value) || 0 }))} />
                      <div style={{ fontSize: '.75rem', color: 'var(--c-text-3)', marginTop: 4 }}>
                        Porcentaje sobre lo facturado en prestaciones. 0 = sin comisión.
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Firma digital</label>
                      <p style={{ fontSize: '.78rem', color: 'var(--c-text-3)', marginBottom: 6 }}>Esta firma aparecerá automáticamente en las recetas emitidas por este profesional.</p>
                      <SignaturePad
                        value={equipoForm.firma_digital}
                        onChange={v => setEquipoForm(f => ({ ...f, firma_digital: v }))}
                        height={120}
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setEquipoModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={equipoSaving}>{equipoSaving ? 'Guardando...' : editColab ? 'Guardar cambios' : 'Agregar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Dar / Cambiar acceso al sistema ── */}
      {accesoModal && accesoColab && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                {accesoColab.tiene_acceso ? '🔑 Cambiar contraseña' : '🔐 Dar acceso al sistema'}
              </span>
              <button className="btn-close" onClick={() => setAccesoModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAccesoSave}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Info del colaborador */}
                <div style={{ background: 'var(--c-surface-2)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--c-primary-light)', color: 'var(--c-primary-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '.9rem', flexShrink: 0 }}>
                    {(accesoColab.nombre?.[0] ?? '') + (accesoColab.apellido?.[0] ?? '')}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '.9rem' }}>{accesoColab.apellido ? `${accesoColab.apellido}, ${accesoColab.nombre}` : accesoColab.nombre}</div>
                    <div style={{ fontSize: '.78rem', color: 'var(--c-text-3)' }}>{accesoColab.email}</div>
                  </div>
                </div>

                {!accesoColab.tiene_acceso && (
                  <div style={{ fontSize: '.82rem', color: '#0369A1', background: '#F0F9FF', borderRadius: 8, padding: '10px 12px', lineHeight: 1.5 }}>
                    Con esta contraseña, <strong>{accesoColab.nombre}</strong> podrá iniciar sesión en el sistema usando su email <strong>{accesoColab.email}</strong>.
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">{accesoColab.tiene_acceso ? 'Nueva contraseña' : 'Contraseña'} <span className="req">*</span></label>
                  <input
                    className="form-input"
                    type="password"
                    placeholder=""
                    value={accesoForm.password}
                    onChange={e => setAccesoForm(f => ({ ...f, password: e.target.value }))}
                    autoFocus
                    autoComplete="new-password"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirmar contraseña <span className="req">*</span></label>
                  <input
                    className="form-input"
                    type="password"
                    placeholder=""
                    value={accesoForm.confirmar}
                    onChange={e => setAccesoForm(f => ({ ...f, confirmar: e.target.value }))}
                    autoComplete="new-password"
                  />
                  {accesoForm.confirmar && accesoForm.password !== accesoForm.confirmar && (
                    <div style={{ fontSize: '.75rem', color: 'var(--c-danger)', marginTop: 4 }}>Las contraseñas no coinciden</div>
                  )}
                  {accesoForm.confirmar && accesoForm.password === accesoForm.confirmar && accesoForm.password.length >= 8 && (
                    <div style={{ fontSize: '.75rem', color: '#15803D', marginTop: 4 }}>✓ Contraseñas coinciden</div>
                  )}
                </div>

                <div style={{ fontSize: '.78rem', color: 'var(--c-text-3)', background: 'var(--c-surface-2)', borderRadius: 8, padding: '8px 12px' }}>
                  💡 Compartí las credenciales con el integrante de forma segura (mensaje privado o en persona). No las envíes por email.
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setAccesoModal(false)}>Cancelar</button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={accesoSaving || !accesoForm.password || accesoForm.password !== accesoForm.confirmar}>
                  {accesoSaving ? 'Guardando...' : accesoColab.tiene_acceso ? 'Cambiar contraseña' : '🔐 Activar acceso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal nuevo/editar convenio */}
      {convenioModal && (
        <div className="modal-overlay">
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
                    placeholder="" />
                </div>
                <div className="form-group">
                  <label className="form-label">Servicio / Prestación asociada</label>
                  <input className="form-input" list="conv-prestaciones-list"
                    value={convenioForm.prestacion_nombre}
                    onChange={e => setConvenioForm(f => ({ ...f, prestacion_nombre: e.target.value }))}
                    placeholder="" />
                  <datalist id="conv-prestaciones-list">
                    {prestaciones.filter(p => p.activo).map(p => (
                      <option key={p.id} value={p.nombre} />
                    ))}
                  </datalist>
                  <span className="form-hint">Dejá vacío para que aplique a todos los servicios</span>
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

      {/* ── Modal confirmación genérico ── */}
      {modalConfirm && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">⚠️ Confirmar acción</span>
              <button className="btn-close" onClick={() => setModalConfirm(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '.95rem' }}>{modalConfirm.msg}</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModalConfirm(null)}>Cancelar</button>
              <button className="btn btn-danger" disabled={confirmando} onClick={async () => {
                setConfirmando(true)
                try { await modalConfirm.onConfirm() } catch (e) { addToast(e.message || 'Error al confirmar la acción', 'error') }
                finally { setConfirmando(false); setModalConfirm(null) }
              }}>
                {confirmando ? 'Procesando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-componentes de Config ─────────────────────────────

function WorkflowTab({ form, set, handleSave, saving, saved }) {
  const ETAPAS = [
    { id: 'recepcion', label: 'Recepción', desc: 'El paciente es recibido en mostrador', emoji: '🚪' },
    { id: 'validacion', label: 'Validación', desc: 'Verificación de cobertura/documentación', emoji: '✅' },
    { id: 'cobro_adelantado', label: 'Cobro adelantado', desc: 'Cobrar antes de pasar al consultorio', emoji: '💳' },
    { id: 'sala_espera', label: 'Sala de espera', desc: 'El paciente espera su turno', emoji: '🪑' },
    { id: 'consultorio', label: 'Consultorio', desc: 'Consulta con el profesional (siempre activo)', emoji: '🩺' },
    { id: 'cobro', label: 'Cobro', desc: 'Cobrar al salir del consultorio', emoji: '💰' },
    { id: 'salida', label: 'Salida', desc: 'Confirmación de egreso del paciente', emoji: '👋' },
  ]

  const workflowActual = (() => {
    try { return JSON.parse(form.workflow_etapas || '["consultorio"]') } catch { return ['consultorio'] }
  })()

  function toggleEtapa(id) {
    if (id === 'consultorio') return // Siempre activo
    const nuevo = workflowActual.includes(id)
      ? workflowActual.filter(e => e !== id)
      : [...workflowActual, id]
    // Mantener orden lógico
    const ordenado = ETAPAS.map(e => e.id).filter(e => nuevo.includes(e))
    set('workflow_etapas')({ target: { value: JSON.stringify(ordenado) } })
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Flujo de atención configurable</span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ color: 'var(--c-text-3)', fontSize: '.88rem', margin: 0 }}>
          Activá las etapas que usa tu centro. El consultorio siempre está activo.
        </p>
        {ETAPAS.map(etapa => {
          const activa = workflowActual.includes(etapa.id)
          const fija = etapa.id === 'consultorio'
          return (
            <div key={etapa.id} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 16px', borderRadius: 10,
              background: activa ? 'rgba(59,130,246,.06)' : 'var(--c-bg-2)',
              border: `1px solid ${activa ? 'rgba(59,130,246,.3)' : 'var(--c-border)'}`,
              opacity: fija ? 0.9 : 1,
            }}>
              <span style={{ fontSize: '1.4rem' }}>{etapa.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '.92rem' }}>{etapa.label}</div>
                <div style={{ color: 'var(--c-text-3)', fontSize: '.8rem' }}>{etapa.desc}</div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: fija ? 'default' : 'pointer' }}>
                <input
                  type="checkbox"
                  checked={activa}
                  disabled={fija}
                  onChange={() => toggleEtapa(etapa.id)}
                  style={{ width: 18, height: 18, accentColor: '#3b82f6' }}
                />
                <span style={{ fontSize: '.85rem', color: activa ? 'var(--c-primary)' : 'var(--c-text-3)' }}>
                  {fija ? 'Siempre activo' : activa ? 'Activo' : 'Desactivado'}
                </span>
              </label>
            </div>
          )
        })}

        <div style={{ paddingTop: 8, borderTop: '1px solid var(--c-border)', marginTop: 4 }}>
          <div style={{ fontSize: '.82rem', color: 'var(--c-text-3)', marginBottom: 12 }}>
            Vista previa del flujo actual:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {ETAPAS.filter(e => workflowActual.includes(e.id)).map((e, i, arr) => (
              <span key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="badge badge-info">{e.emoji} {e.label}</span>
                {i < arr.length - 1 && <span style={{ color: 'var(--c-text-3)' }}>→</span>}
              </span>
            ))}
          </div>
        </div>

        {saved && <div className="alert alert-success">✅ Guardado</div>}
        <button onClick={handleSave} className="btn btn-primary" disabled={saving} style={{ width: 'fit-content' }}>
          {saving ? 'Guardando...' : 'Guardar workflow'}
        </button>
      </div>
    </div>
  )
}

function RecetasConfigTab({ form, set, setForm, handleSave, saving }) {
  const [nuevoFarmaco, setNuevoFarmaco] = useState('')
  const [nuevaPlantilla, setNuevaPlantilla] = useState({ titulo: '', texto: '' })

  const safeParse = (val, fallback = []) => {
    if (!val) return fallback
    if (Array.isArray(val) || typeof val === 'object') return val
    try { return JSON.parse(val) } catch { return fallback }
  }
  const farmacos = safeParse(form.catalogo_farmacos)
  const plantillas = safeParse(form.plantillas_evoluciones)

  function agregarFarmaco() {
    if (!nuevoFarmaco.trim()) return
    const nuevo = [...farmacos, nuevoFarmaco.trim()]
    setForm(f => ({ ...f, catalogo_farmacos: JSON.stringify(nuevo) }))
    setNuevoFarmaco('')
  }

  function quitarFarmaco(i) {
    const nuevo = farmacos.filter((_, idx) => idx !== i)
    setForm(f => ({ ...f, catalogo_farmacos: JSON.stringify(nuevo) }))
  }

  function agregarPlantilla() {
    if (!nuevaPlantilla.titulo.trim()) return
    const nuevo = [...plantillas, { ...nuevaPlantilla, id: Date.now() }]
    setForm(f => ({ ...f, plantillas_evoluciones: JSON.stringify(nuevo) }))
    setNuevaPlantilla({ titulo: '', texto: '' })
  }

  function quitarPlantilla(id) {
    const nuevo = plantillas.filter(p => p.id !== id)
    setForm(f => ({ ...f, plantillas_evoluciones: JSON.stringify(nuevo) }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Catálogo de fármacos */}
      <div className="card">
        <div className="card-header"><span className="card-title">💊 Catálogo de fármacos</span></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: 'var(--c-text-3)', fontSize: '.88rem', margin: 0 }}>
            Medicamentos frecuentes para autocompletar en las recetas.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-input" style={{ flex: 1 }}
              placeholder=""
              value={nuevoFarmaco}
              onChange={e => setNuevoFarmaco(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && agregarFarmaco()}
            />
            <button className="btn btn-primary btn-sm" onClick={agregarFarmaco}>+ Agregar</button>
          </div>
          {farmacos.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {farmacos.map((f, i) => (
                <span key={i} className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {f}
                  <button onClick={() => quitarFarmaco(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, fontSize: '.85rem' }}>✕</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Plantillas de evoluciones */}
      <div className="card">
        <div className="card-header"><span className="card-title">📝 Plantillas de evoluciones</span></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: 'var(--c-text-3)', fontSize: '.88rem', margin: 0 }}>
            Textos pre-armados para registrar evoluciones frecuentes con un clic.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              className="form-input"
              placeholder=""
              value={nuevaPlantilla.titulo}
              onChange={e => setNuevaPlantilla(p => ({ ...p, titulo: e.target.value }))}
            />
            <textarea
              className="form-input"
              placeholder=""
              rows={3}
              value={nuevaPlantilla.texto}
              onChange={e => setNuevaPlantilla(p => ({ ...p, texto: e.target.value }))}
              style={{ resize: 'vertical' }}
            />
            <button className="btn btn-primary btn-sm" onClick={agregarPlantilla} style={{ width: 'fit-content' }}>
              + Agregar plantilla
            </button>
          </div>
          {plantillas.map(p => (
            <div key={p.id} style={{
              padding: '12px 14px', background: 'var(--c-bg-2)',
              borderRadius: 8, border: '1px solid var(--c-border)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontWeight: 600, fontSize: '.9rem' }}>📋 {p.titulo}</div>
                <button className="btn btn-danger btn-sm" onClick={() => quitarPlantilla(p.id)}>Eliminar</button>
              </div>
              {p.texto && <div style={{ color: 'var(--c-text-3)', fontSize: '.82rem', marginTop: 6 }}>{p.texto}</div>}
            </div>
          ))}
        </div>
      </div>

      <button onClick={handleSave} className="btn btn-primary" disabled={saving} style={{ width: 'fit-content' }}>
        {saving ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </div>
  )
}

function NotificacionesTab({ form, set, handleSave, saving, saved }) {
  return (
    <div className="card">
      <div className="card-header"><span className="card-title">🔔 Notificaciones</span></div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ color: 'var(--c-text-3)', fontSize: '.88rem', margin: 0 }}>
          Configurá cómo y cuándo notificar a tus pacientes.
        </p>

        {/* Email */}
        <div style={{ padding: '16px', background: 'var(--c-bg-2)', borderRadius: 10, border: '1px solid var(--c-border)' }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>📧 Notificaciones por email</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { key: 'notif_email_turno', label: 'Confirmar turno al paciente' },
              { key: 'notif_email_cancelacion', label: 'Avisar cancelación de turno' },
            ].map(({ key, label }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!form[key]}
                  onChange={e => set(key)({ target: { value: e.target.checked ? 1 : 0 } })}
                  style={{ width: 18, height: 18, accentColor: '#3b82f6' }}
                />
                <span style={{ fontSize: '.9rem' }}>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Agendamiento Online */}
        <div style={{ padding: '16px', background: 'var(--c-bg-2)', borderRadius: 10, border: '1px solid var(--c-border)' }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>🌐 Agendamiento online</div>
          <div style={{ color: 'var(--c-text-3)', fontSize: '.85rem', marginBottom: 12 }}>
            Permite que tus pacientes soliciten turnos desde un link publico. Vos confirmas o rechazas desde la agenda.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!form.booking_activo} onChange={e => set('booking_activo')({ target: { value: e.target.checked ? 1 : 0 } })} />
              <span style={{ fontWeight: 600, fontSize: '.85rem' }}>Activar agendamiento online</span>
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: '.85rem', color: 'var(--c-text-2)' }}>Link:</span>
            <code style={{ background: 'var(--c-surface)', padding: '4px 10px', borderRadius: 6, fontSize: '.82rem', border: '1px solid var(--c-border)' }}>
              {window.location.origin}/book/
            </code>
            <input
              className="form-input"
              placeholder="mi-consultorio"
              value={form.booking_slug ?? ''}
              onChange={e => set('booking_slug')({ target: { value: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') } })}
              style={{ maxWidth: 200, fontSize: '.85rem' }}
            />
          </div>
          {form.booking_slug && form.booking_activo ? (
            <div style={{ marginTop: 8, padding: '8px 12px', background: '#F0FDF4', borderRadius: 8, fontSize: '.82rem', color: '#15803D' }}>
              ✅ Link activo: <a href={`${window.location.origin}/book/${form.booking_slug}`} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, color: '#0369A1' }}>{window.location.origin}/book/{form.booking_slug}</a>
              <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/book/${form.booking_slug}`); }} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: '.8rem' }}>📋 Copiar</button>
            </div>
          ) : null}
        </div>

        {/* WhatsApp */}
        <div style={{ padding: '16px', background: 'var(--c-bg-2)', borderRadius: 10, border: '1px solid var(--c-border)' }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>💬 WhatsApp Business</div>
          <div style={{ color: 'var(--c-text-3)', fontSize: '.85rem', marginBottom: 12 }}>
            Número de WhatsApp Business para enviar recordatorios automáticos.
          </div>
          <input
            className="form-input"
            placeholder="+54 9 11 1234-5678"
            value={form.notif_whatsapp_numero ?? ''}
            onChange={set('notif_whatsapp_numero')}
            style={{ maxWidth: 260 }}
          />
          <div style={{ marginTop: 8, fontSize: '.78rem', color: 'var(--c-text-3)' }}>
            💡 Requiere cuenta de WhatsApp Business API (próximamente integración nativa)
          </div>
        </div>

        {saved && <div className="alert alert-success">✅ Guardado</div>}
        <button onClick={handleSave} className="btn btn-primary" disabled={saving} style={{ width: 'fit-content' }}>
          {saving ? 'Guardando...' : 'Guardar notificaciones'}
        </button>
      </div>
    </div>
  )
}
