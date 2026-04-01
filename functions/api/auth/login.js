import { signJWT, verifyPassword } from '../../_lib/auth.js'
import { ok, err, cors } from '../../_lib/response.js'
import { findOne } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

// ── Rate limiting distribuido con Cloudflare KV ──────────────────────────────
// Usa KV para persistir contadores entre isolates/data-centers.
// La Map en memoria era reseteada en cada request en producción distribuida.
const MAX_ATTEMPTS = 15
const WINDOW_SECS = 10 * 60 // 10 minutos en segundos

async function checkRateLimit(kv, ip) {
  if (!kv) {
    console.warn('[SECURITY] RATE_LIMIT KV not configured — rate limiting disabled')
    return { allowed: true, remaining: 5, blocked: false }
  }
  const key = `ratelimit:${ip}`
  const raw = await kv.get(key)
  if (!raw) return { blocked: false }
  const entry = JSON.parse(raw)
  if (entry.attempts >= MAX_ATTEMPTS) {
    const elapsed = Math.floor(Date.now() / 1000) - entry.firstAttempt
    const retryAfter = WINDOW_SECS - elapsed
    if (retryAfter > 0) return { blocked: true, retryAfter }
    // La ventana ya expiró (KV debería haberla purgado, pero por si acaso)
    await kv.delete(key)
  }
  return { blocked: false }
}

async function recordFailedAttempt(kv, ip) {
  if (!kv) return
  const key = `ratelimit:${ip}`
  const raw = await kv.get(key)
  let entry
  if (raw) {
    entry = JSON.parse(raw)
    entry.attempts++
  } else {
    entry = { attempts: 1, firstAttempt: Math.floor(Date.now() / 1000) }
  }
  // TTL = WINDOW_SECS: KV expira la key automáticamente
  await kv.put(key, JSON.stringify(entry), { expirationTtl: WINDOW_SECS })
}

async function clearAttempts(kv, ip) {
  if (!kv) return
  await kv.delete(`ratelimit:${ip}`)
}

export async function onRequestPost({ request, env }) {
  try {
    // Obtener IP del cliente
    const ip = request.headers.get('cf-connecting-ip') ||
                request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                'unknown'

    const { blocked, retryAfter } = await checkRateLimit(env.RATE_LIMIT, ip)
    if (blocked) {
      return new Response(
        JSON.stringify({ ok: false, error: `Demasiados intentos fallidos. Intentá de nuevo en ${Math.ceil(retryAfter / 60)} minuto(s).` }),
        { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) } }
      )
    }

    const { email, password } = await request.json()
    if (!email || !password) return err('Email y contraseña requeridos')

    const emailLower = email.toLowerCase()

    // ── 1. Intentar login como owner (tabla usuarios) ──────────
    const user = await findOne(env.DB, 'usuarios', { where: { email: emailLower } })

    if (user) {
      const valid = await verifyPassword(password, user.password_hash)
      if (!valid) {
        await recordFailedAttempt(env.RATE_LIMIT, ip)
        return err('Credenciales incorrectas', 401)
      }

      // Suspendido: bloqueo total
      if (user.estado === 'suspendido') {
        return err('Tu cuenta fue suspendida. Contactanos por WhatsApp para reactivarla.', 403)
      }

      // Login exitoso: limpiar intentos fallidos
      await clearAttempts(env.RATE_LIMIT, ip)

      // Trial vencido: permitir login (la app maneja el banner y modo lectura)
      const token = await signJWT({ sub: user.id, email: user.email, rol: user.rol ?? 'tenant', token_version: user.token_version ?? 1 }, env.JWT_SECRET)

      // Registrar último acceso (fire-and-forget, no bloquea el login)
      env.DB.prepare(`UPDATE usuarios SET last_login_at = datetime('now') WHERE id = ?1`)
        .bind(user.id).run().catch(() => {})

      // Cargar configuración del consultorio
      const config = await findOne(env.DB, 'configuracion', { where: { tenant_id: user.id } })

      // Cargar suscripción activa con features del plan
      let suscripcion = null
      try {
        const sub = await env.DB.prepare(`
          SELECT ts.*, sp.nombre as plan_nombre, sp.precio_mensual, sp.precio_anual, sp.plan_features
          FROM tenant_subscriptions ts
          JOIN subscription_plans sp ON ts.plan_id = sp.id
          WHERE ts.tenant_id = ?1 AND ts.estado = 'activo'
          ORDER BY ts.created_at DESC LIMIT 1
        `).bind(user.id).first()

        if (sub) {
          suscripcion = {
            ...sub,
            plan_features: sub.plan_features ? JSON.parse(sub.plan_features) : null,
          }
        }
      } catch (_) { /* sin suscripción activa */ }

      return ok({
        token,
        user: {
          id: user.id, email: user.email, nombre: user.nombre,
          rol: user.rol ?? 'tenant', estado: user.estado ?? 'activo',
          trial_hasta: user.trial_hasta ?? null,
        },
        configuracion: config,
        suscripcion,
      })
    }

    // ── 2. Intentar login como colaborador ──────────────────────
    const colab = await env.DB.prepare(
      `SELECT * FROM colaboradores WHERE email = ?1 AND activo = 1`
    ).bind(emailLower).first()

    if (!colab) {
      await recordFailedAttempt(env.RATE_LIMIT, ip)
      return err('Credenciales incorrectas', 401)
    }

    if (!colab.password_hash) {
      return err('Este colaborador no tiene contraseña configurada. Contactá al administrador del consultorio.', 401)
    }

    const validColab = await verifyPassword(password, colab.password_hash)
    if (!validColab) {
      await recordFailedAttempt(env.RATE_LIMIT, ip)
      return err('Credenciales incorrectas', 401)
    }

    // El sub del token es el tenant_id del dueño → todas las APIs funcionan igual
    const token = await signJWT({
      sub: colab.tenant_id,
      email: colab.email,
      rol: colab.rol,           // 'profesional' | 'recepcionista' | 'admin'
      colab_id: colab.id,
    }, env.JWT_SECRET)

    // Login exitoso como colaborador: limpiar intentos fallidos
    await clearAttempts(env.RATE_LIMIT, ip)

    // Cargar configuración del dueño
    const config = await findOne(env.DB, 'configuracion', { where: { tenant_id: colab.tenant_id } })

    return ok({
      token,
      user: {
        id: colab.id,
        email: colab.email,
        nombre: [colab.nombre, colab.apellido].filter(Boolean).join(' '),
        rol: colab.rol,
        estado: 'activo',
        trial_hasta: null,
      },
      configuracion: config,
      suscripcion: null,
    })
  } catch (e) {
    console.error('Login error:', e?.message ?? e)
    return err('Error al iniciar sesión. Intentá nuevamente.', 500)
  }
}
