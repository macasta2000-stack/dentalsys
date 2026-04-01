import { getAuthUser, getApiKeyUser } from './_lib/auth.js'
import { unauthorized, forbidden, err, cors } from './_lib/response.js'

// Rutas públicas (no requieren JWT)
const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/register-public',   // Registro self-service
  '/api/auth/forgot-password',   // Recuperación de contraseña — no requiere JWT
  '/api/auth/reset-password',    // Reset con token — no requiere JWT
  '/api/config/sistema',         // Config pública (WhatsApp, etc.) — GET es público
  '/api/landing/config',         // Config de la landing — password propio, no JWT
]

export async function onRequest(context) {
  const { request, env, next } = context

  // OPTIONS preflight
  if (request.method === 'OPTIONS') return cors()

  const url = new URL(request.url)

  // Rutas públicas — solo GET es público para config/sistema
  if (url.pathname === '/api/config/sistema' && request.method === 'GET') {
    return next()
  }
  if (PUBLIC_ROUTES.filter(r => r !== '/api/config/sistema').some(r => url.pathname === r)) {
    return next()
  }

  // Booking público — /api/booking/* no requiere auth
  if (url.pathname.startsWith('/api/booking/')) {
    return next()
  }

  // Encuestas públicas — responder encuesta por token
  if (url.pathname.startsWith('/api/encuestas/') && request.method === 'PATCH') {
    // Allow public survey responses (they authenticate via token in body)
  }

  // Solo aplica middleware a /api/*
  if (!url.pathname.startsWith('/api/')) {
    return next()
  }

  // Verificar JWT primero, luego API Key
  let user = await getAuthUser(request, env)
  if (!user) user = await getApiKeyUser(request, env)
  if (!user) return unauthorized()

  // Verificar estado de la cuenta
  if (user.estado === 'suspendido') {
    return err('Tu cuenta fue suspendida. Contactá con nosotros para reactivarla.', 403)
  }

  // Trial vencido: solo lectura (GET pasa, escrituras bloqueadas)
  if (user.estado === 'trial' && user.trial_hasta) {
    const hoy = new Date().toISOString().split('T')[0]
    if (hoy > user.trial_hasta && request.method !== 'GET' && request.method !== 'OPTIONS') {
      return err('Tu período de prueba expiró. Contactanos por WhatsApp para activar tu plan.', 402)
    }
  }

  // Rutas de admin: solo superadmin
  if (url.pathname.startsWith('/api/admin/')) {
    if (user.rol !== 'superadmin') return forbidden()
  }

  // Protect SaaS-critical fields: no non-superadmin may set plan_id, features_override,
  // estado or trial_hasta via any mutating request body.
  // We inspect the body for PATCH/POST/PUT requests on non-admin routes.
  if (
    user.rol !== 'superadmin' &&
    !url.pathname.startsWith('/api/admin/') &&
    ['PATCH', 'POST', 'PUT'].includes(request.method)
  ) {
    // Clone the request so the body can be read again downstream
    const cloned = request.clone()
    try {
      const contentType = request.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        const body = await cloned.json()
        const FORBIDDEN_FIELDS = ['plan_id', 'features_override', 'estado', 'trial_hasta']
        const hasForbiddenField = FORBIDDEN_FIELDS.some(f => f in body)
        // Special case: 'estado' is a valid field for many records (e.g. turnos, pacientes).
        // We only block it when the request is targeting the configuracion or usuarios tables
        // (detected by path). For general resource routes, 'estado' is a normal field.
        const isSensitivePath = url.pathname.startsWith('/api/config') ||
                                url.pathname.startsWith('/api/suscripcion') ||
                                url.pathname.startsWith('/api/auth/register')
        if (isSensitivePath && hasForbiddenField) {
          const blocked = FORBIDDEN_FIELDS.filter(f => f in body)
          return forbidden(`Campo(s) no permitido(s): ${blocked.join(', ')}`)
        }
        // Regardless of path, plan_id, features_override and trial_hasta are ALWAYS forbidden
        const alwaysForbidden = ['plan_id', 'features_override', 'trial_hasta']
        const hasAlwaysForbidden = alwaysForbidden.some(f => f in body)
        if (hasAlwaysForbidden) {
          const blocked = alwaysForbidden.filter(f => f in body)
          return forbidden(`Campo(s) no permitido(s): ${blocked.join(', ')}`)
        }
      }
    } catch {
      // If we can't parse the body, let the handler deal with it
    }
  }

  context.data.user = user
  return next()
}
