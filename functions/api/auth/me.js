import { ok, err, cors } from '../../_lib/response.js'
import { findOne } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

export async function onRequestGet({ data, env }) {
  try {
    const { user } = data
    const dbUser = await findOne(env.DB, 'usuarios', { where: { id: user.sub }, select: 'id, email, nombre, created_at' })
    if (!dbUser) return err('Usuario no encontrado', 404)
    const config = await findOne(env.DB, 'configuracion', { where: { tenant_id: user.sub } })
    return ok({ user: dbUser, configuracion: config })
  } catch {
    return err('Error interno', 500)
  }
}
