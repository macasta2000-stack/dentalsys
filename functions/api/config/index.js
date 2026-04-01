import { ok, err, forbidden, cors } from '../../_lib/response.js'
import { findOne, update, pick } from '../../_lib/db.js'
import { verifyPassword, hashPassword } from '../../_lib/auth.js'

export async function onRequestOptions() { return cors() }

// Roles that may READ tenant configuration
const CAN_READ_CONFIG = new Set(['tenant', 'superadmin', 'admin'])
// Roles that may WRITE tenant configuration
const CAN_WRITE_CONFIG = new Set(['tenant', 'superadmin', 'admin'])

export async function onRequestGet({ data, env }) {
  const { user } = data

  // recepcionista and profesional must not access tenant configuration settings
  if (!CAN_READ_CONFIG.has(user.rol)) {
    return forbidden('No tenés permisos para acceder a la configuración')
  }

  const config = await findOne(env.DB, 'configuracion', { where: { tenant_id: user.sub } })

  // Strip features_override and plan fields from non-superadmin responses
  if (config && user.rol !== 'superadmin') {
    const { features_override, ...safeConfig } = config
    return ok(safeConfig)
  }

  return ok(config)
}

export async function onRequestPatch({ request, data, env }) {
  const { user } = data

  // recepcionista and profesional must not modify tenant configuration
  if (!CAN_WRITE_CONFIG.has(user.rol)) {
    return forbidden('No tenés permisos para modificar la configuración')
  }

  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }
  delete body.id; delete body.tenant_id

  // ── Password change: handled separately, not via configuracion table ──────
  if (body.nueva_password !== undefined || body.password_actual !== undefined) {
    const { password_actual, nueva_password } = body

    if (!password_actual || !nueva_password) {
      return err('Se requiere la contraseña actual y la nueva contraseña')
    }
    if (nueva_password.length < 8) {
      return err('La nueva contraseña debe tener al menos 8 caracteres')
    }

    // Colaboradores cannot change their password via this endpoint
    if (user.colab_id) {
      return forbidden('Los colaboradores deben contactar al administrador para cambiar su contraseña')
    }

    const dbUser = await env.DB.prepare(
      `SELECT id, password_hash FROM usuarios WHERE id = ?1`
    ).bind(user.sub).first()

    if (!dbUser) return err('Usuario no encontrado', 404)

    const valid = await verifyPassword(password_actual, dbUser.password_hash)
    if (!valid) return err('La contraseña actual es incorrecta')

    const new_hash = await hashPassword(nueva_password)
    await env.DB.prepare(
      `UPDATE usuarios SET password_hash = ?1, token_version = COALESCE(token_version, 0) + 1 WHERE id = ?2`
    ).bind(new_hash, dbUser.id).run()

    return ok({ message: 'Contraseña actualizada correctamente.' })
  }

  // Non-superadmin cannot set sensitive SaaS fields via this endpoint
  if (user.rol !== 'superadmin') {
    delete body.features_override
    delete body.plan_id
    delete body.estado
    delete body.trial_hasta
  }

  const config = await findOne(env.DB, 'configuracion', { where: { tenant_id: user.sub } })
  if (!config) return err('Configuración no encontrada', 404)

  const updated = await update(env.DB, 'configuracion', config.id, pick('configuracion', body), user.sub)
  return ok(updated)
}
