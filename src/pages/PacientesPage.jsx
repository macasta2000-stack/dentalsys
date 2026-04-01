import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import { formatPhone } from '../lib/utils'

const EMPTY_FORM = {
  nombre: '', apellido: '', dni: '', fecha_nacimiento: '',
  sexo: '', telefono: '', email: '', obra_social: '',
  numero_afiliado: '', plan_obra_social: '', notas: '',
}

export default function PacientesPage() {
  const navigate = useNavigate()
  const addToast = useToast()
  const [pacientes, setPacientes] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const searchTimerRef = useRef(null)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showArchivados, setShowArchivados] = useState(false)
  const [confirmModal, setConfirmModal] = useState(null) // { paciente }

  useEffect(() => { load('') }, [showArchivados])

  const normalizar = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  async function load(q) {
    setLoading(true)
    const estado = showArchivados ? 'archivado' : 'activo'
    const data = await api.pacientes.list(normalizar(q ?? search), estado).catch(() => [])
    setPacientes(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  function handleSearch(e) {
    const q = e.target.value
    setSearch(q)
    clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => load(q), 300)
  }

  async function handleReactivar(p) {
    try {
      await api.pacientes.update(p.id, { estado: 'activo' })
      setPacientes(prev => prev.filter(x => x.id !== p.id))
      addToast(`Paciente ${p.apellido}, ${p.nombre} reactivado`, 'success')
    } catch (e) {
      addToast(e.message || 'No se pudo reactivar el paciente.', 'error')
    }
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSave(e) {
    e.preventDefault()
    if (!form.nombre || !form.apellido) { setError('Nombre y apellido son requeridos'); return }
    setSaving(true); setError('')
    try {
      const p = await api.pacientes.create(form)
      setPacientes(prev => [...prev, p].sort((a, b) => a.apellido.localeCompare(b.apellido)))
      setModal(false); setForm(EMPTY_FORM)
      addToast(`Paciente ${p.apellido}, ${p.nombre} creado correctamente`, 'success')
      navigate(`/pacientes/${p.id}`)
    } catch (e) {
      setError(e.message || 'No se pudo guardar el paciente. Verificá nombre y apellido.')
    } finally {
      setSaving(false)
    }
  }

  function openModal() { setForm(EMPTY_FORM); setError(''); setModal(true) }

  function handleDelete(p) {
    setConfirmModal({ paciente: p })
  }

  async function confirmarArchivar() {
    const p = confirmModal?.paciente
    if (!p) return
    setConfirmModal(null)
    try {
      await api.pacientes.delete(p.id)
      setPacientes(prev => prev.filter(x => x.id !== p.id))
      addToast(`Paciente ${p.apellido}, ${p.nombre} archivado correctamente`, 'success')
    } catch (e) {
      addToast(e.message || 'No se pudo archivar el paciente.', 'error')
    }
  }

  const calcEdad = (fn) => {
    if (!fn) return null
    const nacimiento = new Date(fn)
    if (nacimiento > new Date()) return null // fecha futura — inválida
    const diff = Date.now() - nacimiento.getTime()
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Pacientes</div>
          <div className="page-sub">{pacientes.length} paciente{pacientes.length !== 1 ? 's' : ''} {showArchivados ? 'archivados' : 'activos'}</div>
        </div>
        <div className="page-actions">
          <div className="search-bar">
            <span className="search-icon">🔍</span>
            <input placeholder="Buscar por nombre, apellido, DNI o teléfono..." value={search} onChange={handleSearch} />
          </div>
          <button className={`btn btn-sm ${showArchivados ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => { setShowArchivados(v => !v); setSearch('') }}>
            {showArchivados ? 'Ver activos' : 'Ver archivados'}
          </button>
          {!showArchivados && <button className="btn btn-primary" onClick={openModal}>+ Nuevo paciente</button>}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="card-body" style={{ textAlign: 'center' }}><span className="spinner" /></div>
        ) : pacientes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👤</div>
            <div className="empty-title">{search ? 'Sin resultados' : 'Aún no hay pacientes'}</div>
            <div className="empty-sub">{search ? `Ningún paciente coincide con "${search}"` : 'Registrá tu primer paciente'}</div>
            {!search && <button className="btn btn-primary btn-sm mt-2" onClick={openModal}>Nuevo paciente</button>}
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>DNI</th>
                  <th>Edad</th>
                  <th>Teléfono</th>
                  <th>Obra social</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pacientes.map(p => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/pacientes/${p.id}`)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--c-primary-light)', color: 'var(--c-primary-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '.8rem', fontFamily: 'var(--font-display)', flexShrink: 0 }}>
                          {p.apellido?.[0]}{p.nombre?.[0]}
                        </div>
                        <div>
                          <div className="td-main">{p.apellido}, {p.nombre}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-sm text-muted">{p.dni || '—'}</td>
                    <td className="text-sm">{(() => { const e = calcEdad(p.fecha_nacimiento); return e != null ? `${e} años` : '—' })()}</td>
                    <td className="text-sm">{formatPhone(p.telefono)}</td>
                    <td>{p.obra_social ? <span className="badge badge-info">{p.obra_social}</span> : <span className="text-muted text-sm">Particular</span>}</td>
                    <td onClick={e => e.stopPropagation()}>
                      {showArchivados ? (
                        <button className="btn btn-success btn-sm" onClick={() => handleReactivar(p)}>Reactivar</button>
                      ) : (
                        <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/pacientes/${p.id}`)}>Ver ficha →</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal confirmación archivar */}
      {confirmModal && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Archivar paciente</span>
              <button className="btn-close" onClick={() => setConfirmModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p>¿Archivás a <strong>{confirmModal.paciente.apellido}, {confirmModal.paciente.nombre}</strong>?</p>
              <p className="text-sm text-muted" style={{ marginTop: 6 }}>El paciente queda archivado y puede reactivarse desde "Ver archivados".</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmModal(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={confirmarArchivar}>Archivar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuevo paciente */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">👤 Nuevo Paciente</span>
              <button className="btn-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Nombre <span className="req">*</span></label>
                    <input className="form-input" value={form.nombre} onChange={set('nombre')} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Apellido <span className="req">*</span></label>
                    <input className="form-input" value={form.apellido} onChange={set('apellido')} required />
                  </div>
                </div>
                <div className="form-row cols-3">
                  <div className="form-group">
                    <label className="form-label">DNI</label>
                    <input className="form-input" placeholder="" value={form.dni} onChange={set('dni')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fecha de nacimiento</label>
                    <input className="form-input" type="date" value={form.fecha_nacimiento} onChange={set('fecha_nacimiento')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Sexo</label>
                    <select className="form-input" value={form.sexo} onChange={set('sexo')}>
                      <option value="">Sin especificar</option>
                      <option value="masculino">Masculino</option>
                      <option value="femenino">Femenino</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                </div>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input className="form-input" placeholder="" value={form.telefono} onChange={set('telefono')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-input" type="email" value={form.email} onChange={set('email')} />
                  </div>
                </div>
                <div className="form-row cols-3">
                  <div className="form-group">
                    <label className="form-label">Obra social</label>
                    <input className="form-input" placeholder="" value={form.obra_social} onChange={set('obra_social')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">N° afiliado</label>
                    <input className="form-input" value={form.numero_afiliado} onChange={set('numero_afiliado')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Plan</label>
                    <input className="form-input" placeholder="" value={form.plan_obra_social} onChange={set('plan_obra_social')} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Notas / Antecedentes</label>
                  <textarea className="form-input" rows={3} value={form.notas} onChange={set('notas')} placeholder="" />
                </div>
                {error && <div className="alert alert-danger">{error}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Guardando...' : 'Crear paciente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
