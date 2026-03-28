import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function LoginPage() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // login | register
  const [form, setForm] = useState({ email: '', password: '', nombre: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = mode === 'login'
      ? await login(form.email, form.password)
      : await register(form.email, form.password, form.nombre)
    setLoading(false)
    if (err) { setError(mode === 'login' ? 'Email o contraseña incorrectos. Si olvidaste tu contraseña, contactá al soporte.' : err); return }
    navigate('/')
  }

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="login-brand">
          <div className="brand-icon">🦷</div>
          <h1>DentalSys</h1>
          <p>Sistema de Gestión para Consultorios Odontológicos</p>
          <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left', maxWidth: 300 }}>
            {['Historia clínica y odontograma interactivo', 'Agenda y turnos en tiempo real', 'Presupuestos y caja integrados', 'Inventario de insumos'].map(f => (
              <div key={f} style={{ display: 'flex', gap: 10, color: 'rgba(255,255,255,.75)', fontSize: '.88rem' }}>
                <span style={{ color: '#34D399' }}>✓</span> {f}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="login-right">
        <form className="login-form" onSubmit={handleSubmit}>
          <h2>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h2>
          <p className="login-sub">
            {mode === 'login' ? 'Bienvenido de nuevo' : 'Configurá tu consultorio en minutos'}
          </p>

          <div className="login-fields">
            {mode === 'register' && (
              <div className="form-group">
                <label className="form-label">Nombre del profesional</label>
                <input className="form-input" placeholder="Dr. García" value={form.nombre} onChange={set('nombre')} />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Email <span className="req">*</span></label>
              <input className="form-input" type="email" placeholder="dr@consultorio.com" value={form.email} onChange={set('email')} required />
            </div>
            <div className="form-group">
              <label className="form-label">Contraseña <span className="req">*</span></label>
              <input className="form-input" type="password" placeholder={mode === 'register' ? 'Mínimo 8 caracteres' : '••••••••'} value={form.password} onChange={set('password')} required minLength={8} />
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
              {loading ? <><span className="spinner" style={{width:16,height:16}} /> Procesando...</> : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
            </button>

            <div style={{ textAlign: 'center', fontSize: '.83rem', color: 'var(--c-text-3)' }}>
              {mode === 'login' ? '¿No tenés cuenta?' : '¿Ya tenés cuenta?'}{' '}
              <button type="button" style={{ background: 'none', border: 'none', color: 'var(--c-primary)', fontWeight: 600, cursor: 'pointer', fontSize: 'inherit' }}
                onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError('') }}>
                {mode === 'login' ? 'Registrate' : 'Iniciá sesión'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
