import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

const EMPTY_FORM = {
  nombre: '', apellido: '', dni: '', fecha_nacimiento: '',
  sexo: '', telefono: '', email: '', obra_social: '',
  numero_afiliado: '', plan_obra_social: '', notas: '',
}

export default function PacientesPage() {
  const navigate = useNavigate()
  const [pacientes, setPacientes] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load('') }, [])

  async function load(q) {
    setLoading(true)
    const data = await api.pacientes.list(q).catch(() => [])
    setPacientes(data)
    setLoading(false)
  }

  function handleSearch(e) {
    const q = e.target.value
    setSearch(q)
    clearTimeout(window._searchTimer)
    window._searchTimer = setTimeout(() => load(q), 300)
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
      navigate(`/pacientes/${p.id}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function openModal() { setForm(EMPTY_FORM); setError(''); setModal(true) }

  const calcEdad = (fn) => {
    if (!fn) return null
    const diff = Date.now() - new Date(fn).getTime()
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Pacientes</div>
          <div className="page-sub">{pacientes.length} pacientes activos</div>
        </div>
        <div className="page-actions">
          <div className="search-bar">
            <span className="search-icon">🔍</span>
            <input placeholder="Buscar por nombre, apellido o DNI..." value={search} onChange={handleSearch} />
          </div>
          <button className="btn btn-primary" onClick={openModal}>+ Nuevo paciente</button>
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
                          {p.apellido[0]}{p.nombre[0]}
                        </div>
                        <div>
                          <div className="td-main">{p.apellido}, {p.nombre}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-sm text-muted">{p.dni || '—'}</td>
                    <td className="text-sm">{calcEdad(p.fecha_nacimiento) != null ? `${calcEdad(p.fecha_nacimiento)} años` : '—'}</td>
                    <td className="text-sm">{p.telefono || '—'}</td>
                    <td>{p.obra_social ? <span className="badge badge-info">{p.obra_social}</span> : <span className="text-muted text-sm">Particular</span>}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/pacientes/${p.id}`)}>Ver ficha →</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal nuevo paciente */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
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
                    <input className="form-input" placeholder="30.000.000" value={form.dni} onChange={set('dni')} />
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
                    <input className="form-input" placeholder="11-5555-0000" value={form.telefono} onChange={set('telefono')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-input" type="email" value={form.email} onChange={set('email')} />
                  </div>
                </div>
                <div className="form-row cols-3">
                  <div className="form-group">
                    <label className="form-label">Obra social</label>
                    <input className="form-input" placeholder="OSDE, Swiss Medical..." value={form.obra_social} onChange={set('obra_social')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">N° afiliado</label>
                    <input className="form-input" value={form.numero_afiliado} onChange={set('numero_afiliado')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Plan</label>
                    <input className="form-input" placeholder="210, Gold, Premium..." value={form.plan_obra_social} onChange={set('plan_obra_social')} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Notas / Antecedentes</label>
                  <textarea className="form-input" rows={3} value={form.notas} onChange={set('notas')} placeholder="Alergias, medicación, antecedentes relevantes..." />
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
