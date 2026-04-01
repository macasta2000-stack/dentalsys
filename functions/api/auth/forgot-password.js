import { ok, err, cors } from '../../_lib/response.js'
import { sendEmail } from '../../_lib/email.js'

export async function onRequestOptions() { return cors() }

const FORGOT_MAX = 3          // max requests per window
const FORGOT_WINDOW = 60 * 60 // 1 hour

export async function onRequestPost({ request, env }) {
  try {
    // Rate limit by IP — prevent email flooding
    const ip = request.headers.get('cf-connecting-ip') ||
                request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (env.RATE_LIMIT) {
      const key = `forgot:${ip}`
      const raw = await env.RATE_LIMIT.get(key)
      const entry = raw ? JSON.parse(raw) : { count: 0, first: Math.floor(Date.now() / 1000) }
      if (entry.count >= FORGOT_MAX) {
        return err('Demasiados intentos. Esperá un momento antes de volver a intentarlo.', 429)
      }
      entry.count++
      await env.RATE_LIMIT.put(key, JSON.stringify(entry), { expirationTtl: FORGOT_WINDOW })
    }

    const { email } = await request.json()

    if (!email || typeof email !== 'string') {
      return err('Email requerido')
    }

    // Look up user — use same response regardless of whether user exists
    const user = await env.DB.prepare(
      `SELECT id, email, nombre FROM usuarios WHERE email = ?1`
    ).bind(email.toLowerCase().trim()).first()

    if (!user) {
      // Do not reveal whether the email exists
      return ok({ message: 'Si el email existe, recibirás un código en minutos.' })
    }

    // Generate a 6-digit code (rate limiting makes brute-force infeasible)
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    const token = String(100000 + (buf[0] % 900000))

    // Verificar que el servicio de email esté configurado ANTES de guardar el token
    if (!env.RESEND_API_KEY) {
      console.error('[forgot-password] RESEND_API_KEY no configurada — no se puede enviar código')
      return err('El servicio de email no está configurado. Contactá al soporte del consultorio.', 503)
    }

    // Send email FIRST — only store token if email was sent successfully
    const emailResult = await sendEmail(env, 'password_reset', {
      email: user.email,
      nombre: user.nombre || 'Usuario',
      token,
      tenant_id: user.id,
    })

    if (!emailResult?.ok) {
      console.error('[forgot-password] email no enviado:', user.email)
      return err('No se pudo enviar el código. Intentá de nuevo en unos minutos.', 503)
    }

    // Email enviado exitosamente — ahora sí guardar el token en la DB
    await env.DB.prepare(
      `UPDATE usuarios SET reset_token = ?1, reset_token_expires = datetime('now', '+1 hour') WHERE id = ?2`
    ).bind(token, user.id).run()

    return ok({ message: 'Si el email existe, recibirás un código en minutos.' })
  } catch (e) {
    console.error('[forgot-password] error:', e?.message)
    return err('Error interno del servidor', 500)
  }
}
