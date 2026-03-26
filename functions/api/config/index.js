import { ok, err, cors } from '../../_lib/response.js'
import { findOne, update, pick } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

export async function onRequestGet({ data, env }) {
  const { user } = data
  const config = await findOne(env.DB, 'configuracion', { where: { tenant_id: user.sub } })
  return ok(config)
}

export async function onRequestPatch({ request, data, env }) {
  const { user } = data
  const body = await request.json()
  delete body.id; delete body.tenant_id

  const config = await findOne(env.DB, 'configuracion', { where: { tenant_id: user.sub } })
  if (!config) return err('Configuración no encontrada', 404)

  const updated = await update(env.DB, 'configuracion', config.id, pick('configuracion', body), user.sub)
  return ok(updated)
}
