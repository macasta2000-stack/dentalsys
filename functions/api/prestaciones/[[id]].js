import { ok, created, err, notFound, cors } from '../../_lib/response.js'
import { findOne, insert, update, newId, pick } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

export async function onRequestGet({ data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (id) {
    const p = await findOne(env.DB, 'prestaciones', { where: { id, tenant_id: user.sub } })
    return p ? ok(p) : notFound('Prestación')
  }
  const result = await env.DB.prepare(
    `SELECT * FROM prestaciones WHERE tenant_id = ?1 AND activo = 1 ORDER BY categoria, nombre`
  ).bind(user.sub).all()
  return ok(result?.results ?? [])
}

export async function onRequestPost({ request, data, env }) {
  const { user } = data
  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }
  if (!body.nombre) return err('Nombre es requerido')
  const p = await insert(env.DB, 'prestaciones', {
    id: newId(),
    tenant_id: user.sub,
    ...pick('prestaciones', body),
  })
  return created(p)
}

export async function onRequestPatch({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }
  const updated = await update(env.DB, 'prestaciones', id, pick('prestaciones', body), user.sub)
  if (!updated) return notFound('Prestación')
  return ok(updated)
}

export async function onRequestDelete({ data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  const updated = await update(env.DB, 'prestaciones', id, { activo: 0 }, user.sub)
  if (!updated) return notFound('Prestación')
  return ok({ mensaje: 'Prestación desactivada' })
}
