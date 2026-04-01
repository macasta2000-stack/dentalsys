// ============================================================
// POST /api/auth/register-public
// Registro público de nuevos clientes (sin admin)
// Siempre crea la cuenta en estado trial — el SuperAdmin
// activa el plan manualmente después de la venta por WhatsApp.
// ============================================================
import { created, err, cors } from '../../_lib/response.js'
import { createTenant } from '../../_lib/provisioning.js'
import { signJWT } from '../../_lib/auth.js'

export async function onRequestOptions() { return cors() }

const REG_MAX = 5           // max registrations per IP per window
const REG_WINDOW = 60 * 60  // 1 hour

export async function onRequestPost({ request, env }) {
  // ── Registro público DESHABILITADO ──
  // Las cuentas se crean únicamente desde el panel de administración (superadmin).
  // Para solicitar una cuenta, contactar por WhatsApp.
  return err('El registro público está deshabilitado. Contactanos por WhatsApp para crear tu cuenta.', 403)

  // Rate limit by IP — prevent mass account creation
  const ip = request.headers.get('cf-connecting-ip') ||
              request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (env.RATE_LIMIT) {
    const key = `register:${ip}`
    const raw = await env.RATE_LIMIT.get(key)
    const entry = raw ? JSON.parse(raw) : { count: 0 }
    if (entry.count >= REG_MAX) {
      return err('Demasiados registros desde esta IP. Intentá más tarde.', 429)
    }
    entry.count++
    await env.RATE_LIMIT.put(key, JSON.stringify(entry), { expirationTtl: REG_WINDOW })
  }

  try {
    const body = await request.json()
    const {
      email,
      password,
      nombre,
      nombre_consultorio,
      plan_id = 'plan_starter',
      ciclo = 'mensual',
    } = body

    // Validaciones básicas
    if (!email || !email.includes('@')) return err('Email inválido')
    if (!password || password.length < 8) return err('La contraseña debe tener al menos 8 caracteres')
    if (!nombre?.trim()) return err('El nombre es requerido')

    // Siempre creamos en trial — el plan se activa manualmente por el SuperAdmin
    const tenant = await createTenant(env, {
      email,
      password,
      nombre: nombre.trim(),
      nombre_consultorio: nombre_consultorio?.trim() || `Consultorio ${nombre.trim()}`,
      estado: 'trial',
      trial_dias: 7,
      plan_id: 'plan_starter',
      ciclo,
      send_welcome: true,
      password_temp: null,
    })

    const token = await signJWT(
      { sub: tenant.id, email: tenant.email, rol: 'tenant' },
      env.JWT_SECRET
    )
    return created({
      action: 'redirect_app',
      token,
      user: { id: tenant.id, email: tenant.email, nombre: tenant.nombre, rol: 'tenant', estado: 'trial' },
      redirect_url: env.APP_URL ?? 'https://clingest.app',
    })
  } catch (e) {
    if (e.message === 'El email ya está registrado') return err(e.message, 409)
    console.error('[register-public] Error:', e?.message)
    return err('No se pudo crear la cuenta. Intentá de nuevo.', 500)
  }
}
