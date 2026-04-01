import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { api } from '../lib/api'

const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0)
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const ROL_LABELS = {
  tenant: 'Titular / Dueño',
  superadmin: 'Super Administrador',
  admin: 'Administrador',
  profesional: 'Profesional',
  recepcionista: 'Recepcionista',
}

export default function PerfilPage() {
  const { user, configuracion, refreshUser } = useAuth()
  const addToast = useToast()

  // Nombre display
  const [nombreForm, setNombreForm] = useState(configuracion?.nombre_profesional ?? user?.nombre ?? '')
  const [nombreSaving, setNombreSaving] = useState(false)

  // Cambio de contraseña
  const [pwForm, setPwForm] = useState({ password_actual: '', nueva_password: '', confirmar: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState('')

  const setPw = (k) => (e) => setPwForm(f => ({ ...f, [k]: e.target.value }))

  const isColab = !!user?.colab_id
  const isProf = user?.rol === 'profesional'

  // Comisiones para profesionales
  const now = new Date()
  const [comAnio, setComAnio] = useState(now.getFullYear())
  const [comMes, setComMes] = useState(now.getMonth() + 1)
  const [comData, setComData] = useState(null)
  const [comLoading, setComLoading] = useState(false)

  useEffect(() => {
    if (!isProf) return
    setComLoading(true)
    api.reportes.comisiones(comAnio, comMes)
      .then(d => {
        // Filtrar solo los datos del profesional actual
        const profesionales = d?.profesionales ?? []
        const mine = profesionales.find(p =>
          p.nombre && user?.nombre && p.nombre.toLowerCase().includes(user.nombre.toLowerCase().split(' ')[0].toLowerCase())
        ) ?? profesionales[0] ?? null
        setComData({ ...d, miComision: mine })
      })
      .catch(() => setComData(null))
      .finally(() => setComLoading(false))
  }, [isProf, comAnio, comMes])

  async function handleNombreSubmit(e) {
    e.preventDefault()
    if (!nombreForm.trim()) { addToast('El nombre no puede estar vacío', 'error'); return }
    setNombreSaving(true)
    try {
      await api.config.update({ nombre_profesional: nombreForm.trim() })
      if (refreshUser) await refreshUser()
      addToast('Nombre actualizado correctamente', 'success')
    } catch (err) {
      addToast(err.message || 'No se pudo actualizar el nombre', 'error')
    } finally {
      setNombreSaving(false)
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault()
    setPwError('')
    const { password_actual, nueva_password, confirmar } = pwForm
    if (!password_actual) { setPwError('Ingresá tu contraseña actual'); return }
    if (!nueva_password) { setPwError('Ingresá la nueva contraseña'); return }
    if (nueva_password.length < 8) { setPwError('La nueva contraseña debe tener al menos 8 caracteres'); return }
    if (nueva_password !== confirmar) { setPwError('Las contraseñas no coinciden'); return }
    setPwSaving(true)
    try {
      await api.config.update({ password_actual, nueva_password })
      addToast('Contraseña actualizada correctamente', 'success')
      setPwForm({ password_actual: '', nueva_password: '', confirmar: '' })
    } catch (err) {
      setPwError(err.message || 'No se pudo cambiar la contraseña')
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Info de usuario ── */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--c-primary-light)', color: 'var(--c-primary-dark)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: '1.4rem', flexShrink: 0,
          }}>
            {(user?.nombre || user?.email || '?')[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--c-text)' }}>
              {user?.nombre || 'Sin nombre'}
            </div>
            <div style={{ fontSize: '.85rem', color: 'var(--c-text-3)', marginTop: 2 }}>{user?.email}</div>
            <div style={{ marginTop: 4 }}>
              <span style={{
                display: 'inline-block', fontSize: '.72rem', fontWeight: 700,
                background: 'var(--c-primary-light)', color: 'var(--c-primary-dark)',
                borderRadius: 6, padding: '2px 8px', letterSpacing: '.02em',
              }}>
                {ROL_LABELS[user?.rol] ?? user?.rol ?? 'Usuario'}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', fontSize: '.85rem' }}>
          <div>
            <div style={{ color: 'var(--c-text-3)', marginBottom: 2, fontSize: '.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Email</div>
            <div style={{ color: 'var(--c-text-2)', fontWeight: 500 }}>{user?.email ?? '—'}</div>
          </div>
          <div>
            <div style={{ color: 'var(--c-text-3)', marginBottom: 2, fontSize: '.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Rol</div>
            <div style={{ color: 'var(--c-text-2)', fontWeight: 500 }}>{ROL_LABELS[user?.rol] ?? user?.rol ?? '—'}</div>
          </div>
          {configuracion?.nombre_consultorio && (
            <div>
              <div style={{ color: 'var(--c-text-3)', marginBottom: 2, fontSize: '.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Consultorio</div>
              <div style={{ color: 'var(--c-text-2)', fontWeight: 500 }}>{configuracion.nombre_consultorio}</div>
            </div>
          )}
          {user?.especialidad && (
            <div>
              <div style={{ color: 'var(--c-text-3)', marginBottom: 2, fontSize: '.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Especialidad</div>
              <div style={{ color: 'var(--c-text-2)', fontWeight: 500 }}>{user.especialidad}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Cambiar nombre (solo titulares/admin, no colaboradores) ── */}
      {!isColab && (
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ margin: '0 0 18px', fontSize: '1rem', fontWeight: 700, color: 'var(--c-text)' }}>
            Nombre de visualización
          </h3>
          <form onSubmit={handleNombreSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">
                  {user?.rol === 'profesional' ? 'Nombre del profesional' : 'Nombre de visualización'}
                </label>
                <input
                  className="form-input"
                  value={nombreForm}
                  onChange={e => setNombreForm(e.target.value)}
                  placeholder="Dr. Juan Pérez"
                  required
                />
                <div style={{ marginTop: 5, fontSize: '.78rem', color: 'var(--c-text-3)' }}>
                  {user?.rol === 'profesional'
                    ? 'Este nombre aparece en recetas, agenda y notificaciones.'
                    : 'Este nombre aparece en la agenda y notificaciones.'}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" disabled={nombreSaving}>
                  {nombreSaving ? 'Guardando...' : 'Guardar nombre'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── Comisiones (solo profesionales) ── */}
      {isProf && (
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: 'var(--c-text)' }}>
            Mis comisiones
          </h3>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Año</label>
              <select className="form-input" value={comAnio} onChange={e => setComAnio(Number(e.target.value))}>
                {[now.getFullYear(), now.getFullYear()-1, now.getFullYear()-2].map(y =>
                  <option key={y} value={y}>{y}</option>
                )}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Mes</label>
              <select className="form-input" value={comMes} onChange={e => setComMes(Number(e.target.value))}>
                {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
          </div>
          {comLoading ? (
            <div style={{ color: 'var(--c-text-3)', fontSize: '.85rem' }}>Cargando...</div>
          ) : comData?.miComision ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
              {[
                { label: 'Prestaciones', value: comData.miComision.total_prestaciones ?? 0, color: 'var(--c-primary)' },
                { label: 'Facturado', value: fmt(comData.miComision.total_facturado ?? 0), color: '#16A34A' },
                { label: '% Comisión', value: `${comData.miComision.porcentaje_comision ?? 0}%`, color: '#D97706' },
                { label: 'A cobrar', value: fmt(comData.miComision.comision_monto ?? 0), color: '#7C3AED' },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--c-surface-2)', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--c-text-3)', marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{s.label}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '.85rem', color: 'var(--c-text-3)' }}>
              Sin actividad registrada en {MESES[comMes-1]} {comAnio}.
            </div>
          )}
        </div>
      )}

      {/* ── Cambiar contraseña ── */}
      {!isColab ? (
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ margin: '0 0 18px', fontSize: '1rem', fontWeight: 700, color: 'var(--c-text)' }}>
            Cambiar contraseña
          </h3>
          <form onSubmit={handlePasswordSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Contraseña actual <span className="req">*</span></label>
                <input
                  className="form-input"
                  type="password"
                  required
                  placeholder="Tu contraseña actual"
                  value={pwForm.password_actual}
                  onChange={setPw('password_actual')}
                  autoComplete="current-password"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Nueva contraseña <span className="req">*</span></label>
                <input
                  className="form-input"
                  type="password"
                  required
                  minLength={8}
                  placeholder="Mínimo 8 caracteres"
                  value={pwForm.nueva_password}
                  onChange={setPw('nueva_password')}
                  autoComplete="new-password"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Confirmar nueva contraseña <span className="req">*</span></label>
                <input
                  className="form-input"
                  type="password"
                  required
                  minLength={8}
                  placeholder="Repetí la nueva contraseña"
                  value={pwForm.confirmar}
                  onChange={setPw('confirmar')}
                  autoComplete="new-password"
                />
              </div>
              {pwError && <div className="alert alert-danger">{pwError}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" disabled={pwSaving}>
                  {pwSaving ? 'Guardando...' : 'Cambiar contraseña'}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : (
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: '1rem', fontWeight: 700, color: 'var(--c-text)' }}>
            Cambiar contraseña
          </h3>
          <div style={{ fontSize: '.88rem', color: 'var(--c-text-3)' }}>
            Para cambiar tu contraseña, contactá al administrador del consultorio.
          </div>
        </div>
      )}
    </div>
  )
}
