import { ok, created, err, notFound, cors } from '../../_lib/response.js'
import { findOne, insert, update, newId } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

export async function onRequestGet({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]

  if (id) {
    const c = await findOne(env.DB, 'convenios', { where: { id, tenant_id: user.sub } })
    if (!c) return notFound('Convenio')
    return ok(c)
  }

  // Puede filtrar por nombre_os
  const url = new URL(request.url)
  const nombre_os = url.searchParams.get('nombre_os')

  let sql = `
    SELECT cv.*, pr.nombre as prestacion_nombre
    FROM convenios cv
    LEFT JOIN prestaciones pr ON pr.id = cv.prestacion_id
    WHERE cv.tenant_id = ?1
  `
  const values = [user.sub]
  let idx = 2

  if (nombre_os) { sql += ` AND cv.nombre_os = ?${idx++}`; values.push(nombre_os) }

  sql += ` ORDER BY cv.nombre_os ASC, cv.created_at ASC`
  const result = await env.DB.prepare(sql).bind(...values).all()
  return ok(result?.results ?? [])
}

export async function onRequestPost({ request, data, env }) {
  const { user } = data
  const body = await request.json()
  const { nombre_os } = body
  if (!nombre_os) return err('nombre_os es requerido')

  const c = await insert(env.DB, 'convenios', {
    id: newId(),
    tenant_id: user.sub,
    nombre_os,
    prestacion_id: body.prestacion_id ?? null,
    monto_os: Number(body.monto_os) || 0,
    monto_copago: Number(body.monto_copago) || 0,
    activo: 1,
  })
  return created(c)
}

export async function onRequestPatch({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  const body = await request.json()

  const allowed = ['nombre_os', 'prestacion_id', 'monto_os', 'monto_copago', 'activo']
  const clean = {}
  for (const k of allowed) {
    if (k in body) clean[k] = body[k]
  }

  const updated = await update(env.DB, 'convenios', id, clean, user.sub)
  if (!updated) return notFound('Convenio')
  return ok(updated)
}

export async function onRequestDelete({ data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  // Soft delete
  const updated = await update(env.DB, 'convenios', id, { activo: 0 }, user.sub)
  if (!updated) return notFound('Convenio')
  return ok({ mensaje: 'Convenio desactivado' })
}
