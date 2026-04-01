import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../contexts/ToastContext'
import { api } from '../lib/api'
import { request as rawRequest } from '../lib/httpClient'

export default function LoginPage() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const addToast = useToast()
  const [mode, setMode] = useState('login') // login only — registration disabled (admin-only)

  useEffect(() => {
    if (sessionStorage.getItem('session_expired')) {
      sessionStorage.removeItem('session_expired')
      addToast('Tu sesión expiró. Por favor ingresá nuevamente.', 'error')
    }
  }, [])
  const savedEmail = localStorage.getItem('ds_remember_email') || ''
  const [form, setForm] = useState({ email: savedEmail, password: '', nombre: '' })
  const [rememberMe, setRememberMe] = useState(!!savedEmail)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Forgot password state
  const [showForgot, setShowForgot] = useState(false)
  const [forgotStep, setForgotStep] = useState(1) // 1 = enter email, 2 = enter code + new password
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotToken, setForgotToken] = useState('')
  const [forgotNewPassword, setForgotNewPassword] = useState('')
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState('')

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = mode === 'login'
      ? await login(form.email, form.password)
      : await register({ email: form.email, password: form.password, nombre: form.nombre })
    setLoading(false)
    if (err) { setError(mode === 'login' ? 'Email o contraseña incorrectos.' : err); return }
    if (rememberMe) localStorage.setItem('ds_remember_email', form.email)
    else localStorage.removeItem('ds_remember_email')
    navigate('/')
  }

  function openForgot() {
    setShowForgot(true)
    setForgotStep(1)
    setForgotEmail('')
    setForgotToken('')
    setForgotNewPassword('')
    setForgotConfirmPassword('')
    setForgotError('')
  }

  function closeForgot() {
    setShowForgot(false)
    setForgotError('')
  }

  async function handleForgotStep1(e) {
    e.preventDefault()
    if (!forgotEmail.trim()) { setForgotError('Ingresá tu email'); return }
    setForgotLoading(true)
    setForgotError('')
    try {
      await rawRequest('POST', '/auth/forgot-password', { email: forgotEmail.trim() })
      setForgotStep(2)
      addToast('Si el email existe, recibirás un código en minutos.', 'info')
    } catch (e) {
      setForgotError(e.message || 'No se pudo enviar el código. Intentá nuevamente.')
    } finally {
      setForgotLoading(false)
    }
  }

  async function handleForgotStep2(e) {
    e.preventDefault()
    setForgotError('')
    if (!forgotToken.trim()) { setForgotError('Ingresá el código que recibiste'); return }
    if (!forgotNewPassword) { setForgotError('Ingresá la nueva contraseña'); return }
    if (forgotNewPassword.length < 8) { setForgotError('La contraseña debe tener al menos 8 caracteres'); return }
    if (forgotNewPassword !== forgotConfirmPassword) { setForgotError('Las contraseñas no coinciden'); return }
    setForgotLoading(true)
    try {
      await rawRequest('POST', '/auth/reset-password', {
        email: forgotEmail.trim(),
        token: forgotToken.trim(),
        nueva_password: forgotNewPassword,
      })
      addToast('Contraseña actualizada correctamente. Ya podés iniciar sesión.', 'success')
      closeForgot()
    } catch (e) {
      setForgotError(e.message || 'Código inválido o expirado. Solicitá uno nuevo.')
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="login-brand">
          <div className="brand-icon">🏥</div>
          <h1>Clingest</h1>
          <p>Sistema de Gestión para Consultorios Médicos</p>
          <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left', maxWidth: 300 }}>
            {['Historia clínica digital completa', 'Agenda y turnos en tiempo real', 'Presupuestos, caja y cobros', 'Inventario de insumos y stock'].map(f => (
              <div key={f} style={{ display: 'flex', gap: 10, color: 'rgba(255,255,255,.75)', fontSize: '.88rem' }}>
                <span style={{ color: '#34D399' }}>✓</span> {f}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="login-right">
        <form className="login-form" onSubmit={handleSubmit}>
          <h2>Iniciar sesión</h2>
          <p className="login-sub">Bienvenido de nuevo</p>

          <div className="login-fields">
            <div className="form-group">
              <label className="form-label">Email <span className="req">*</span></label>
              <input className="form-input" type="email" placeholder="" value={form.email} onChange={set('email')} required />
            </div>
            <div className="form-group">
              <label className="form-label">Contraseña <span className="req">*</span></label>
              <input className="form-input" type="password" placeholder="" value={form.password} onChange={set('password')} required minLength={8} />
            </div>

            {mode === 'login' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '.85rem', color: 'var(--c-text-2)' }}>
                <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} style={{ accentColor: '#0369a1' }} />
                Recordar mi email
              </label>
            )}

            {error && <div className="alert alert-danger">{error}</div>}

            <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
              {loading ? <><span className="spinner" style={{width:16,height:16}} /> Procesando...</> : 'Ingresar'}
            </button>

            <div style={{ textAlign: 'center' }}>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--c-text-3)', fontSize: '.8rem', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={openForgot}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            <div style={{ textAlign: 'center', fontSize: '.83rem', color: 'var(--c-text-3)' }}>
              ¿Querés Clingest para tu consultorio?{' '}
              <a href="https://wa.me/5491144755339?text=Hola%2C%20quiero%20info%20sobre%20Clingest"
                target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--c-primary)', fontWeight: 600, textDecoration: 'none' }}>
                Contactanos
              </a>
            </div>
          </div>
        </form>
      </div>

      {/* ── Modal: Olvidé mi contraseña ── */}
      {showForgot && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={closeForgot}
        >
          <div
            style={{ background: 'var(--c-surface, #fff)', borderRadius: 14, width: '100%', maxWidth: 420, boxShadow: '0 8px 40px rgba(0,0,0,.18)', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--c-border, #e2e8f0)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--c-text, #0f172a)' }}>
                  {forgotStep === 1 ? 'Olvidé mi contraseña' : 'Ingresar código'}
                </div>
                <div style={{ fontSize: '.8rem', color: 'var(--c-text-3, #94a3b8)', marginTop: 2 }}>
                  {forgotStep === 1
                    ? 'Te enviaremos un código de verificación'
                    : `Código enviado a ${forgotEmail}`}
                </div>
              </div>
              <button
                onClick={closeForgot}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--c-text-3, #94a3b8)', padding: 4, lineHeight: 1 }}
              >✕</button>
            </div>

            {/* Body */}
            <div style={{ padding: '24px' }}>
              {forgotStep === 1 ? (
                <form onSubmit={handleForgotStep1}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="form-group">
                      <label className="form-label">Email de tu cuenta <span className="req">*</span></label>
                      <input
                        className="form-input"
                        type="email"
                        required
                        placeholder="tu@email.com"
                        value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        autoFocus
                      />
                    </div>
                    {forgotError && <div className="alert alert-danger">{forgotError}</div>}
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      <button type="button" className="btn btn-ghost" onClick={closeForgot}>Cancelar</button>
                      <button type="submit" className="btn btn-primary" disabled={forgotLoading}>
                        {forgotLoading ? <><span className="spinner" style={{width:14,height:14}} /> Enviando...</> : 'Enviar código'}
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleForgotStep2}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ background: 'var(--c-surface-2, #f8fafc)', border: '1px solid var(--c-border, #e2e8f0)', borderRadius: 8, padding: '10px 14px', fontSize: '.84rem', color: 'var(--c-text-2, #334155)' }}>
                      Revisá tu casilla de email. Si la cuenta existe, recibirás un código de 6 dígitos.
                    </div>
                    <div className="form-group">
                      <label className="form-label">Código de 6 dígitos <span className="req">*</span></label>
                      <input
                        className="form-input"
                        type="text"
                        required
                        placeholder="123456"
                        maxLength={6}
                        value={forgotToken}
                        onChange={e => setForgotToken(e.target.value.replace(/\D/g, ''))}
                        style={{ letterSpacing: '.2rem', fontWeight: 700, fontSize: '1.1rem', textAlign: 'center' }}
                        autoFocus
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
                        value={forgotNewPassword}
                        onChange={e => setForgotNewPassword(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Confirmar contraseña <span className="req">*</span></label>
                      <input
                        className="form-input"
                        type="password"
                        required
                        minLength={8}
                        placeholder="Repetí la contraseña"
                        value={forgotConfirmPassword}
                        onChange={e => setForgotConfirmPassword(e.target.value)}
                      />
                    </div>
                    {forgotError && <div className="alert alert-danger">{forgotError}</div>}
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', color: 'var(--c-primary)', fontSize: '.83rem', cursor: 'pointer', padding: 0 }}
                        onClick={() => { setForgotStep(1); setForgotError('') }}
                      >
                        ← Cambiar email
                      </button>
                      <button type="submit" className="btn btn-primary" disabled={forgotLoading}>
                        {forgotLoading ? <><span className="spinner" style={{width:14,height:14}} /> Guardando...</> : 'Cambiar contraseña'}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
