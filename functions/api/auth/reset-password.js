import { ok, err, cors } from '../../_lib/response.js'
import { hashPassword } from '../../_lib/auth.js'

export async function onRequestOptions() { return cors() }

const RESET_MAX = 5           // max attempts per window
const RESET_WINDOW = 15 * 60  // 15 minutes

export async function onRequestPost({ request, env }) {
  try {
    const { email, token, nueva_password } = await request.json()

    // Rate limit by EMAIL — prevents brute-force even with IP rotation
    if (email && env.RATE_LIMIT) {
      const key = `reset:${email.toLowerCase().trim()}`
      const raw = await env.RATE_LIMIT.get(key)
      const entry = raw ? JSON.parse(raw) : { count: 0 }
      if (entry.count >= RESET_MAX) {
        return err('Demasiados intentos. Solicitá un nuevo código.', 429)
      }
      entry.count++
      await env.RATE_LIMIT.put(key, JSON.stringify(entry), { expirationTtl: RESET_WINDOW })
    }

    if (!email || !token || !nueva_password) {
      return err('Email, código y nueva contraseña son requeridos')
    }

    if (nueva_password.length < 8) {
      return err('La contraseña debe tener al menos 8 caracteres')
    }

    // Validate token: must match, belong to this email, and not be expired
    const user = await env.DB.prepare(
      `SELECT id FROM usuarios WHERE email = ?1 AND reset_token = ?2 AND reset_token_expires > datetime('now')`
    ).bind(email.toLowerCase().trim(), String(token)).first()

    if (!user) {
      return err('Token inválido o expirado')
    }

    // Hash new password and clear reset token
    const password_hash = await hashPassword(nueva_password)

    await env.DB.prepare(
      `UPDATE usuarios SET password_hash = ?1, token_version = COALESCE(token_version, 0) + 1, reset_token = NULL, reset_token_expires = NULL WHERE id = ?2`
    ).bind(password_hash, user.id).run()

    return ok({ message: 'Contraseña actualizada correctamente.' })
  } catch (e) {
    console.error('[reset-password] error:', e?.message)
    return err('Error interno del servidor', 500)
  }
}
