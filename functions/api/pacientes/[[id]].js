import { ok, created, err, notFound, cors } from '../../_lib/response.js'
import { findOne, insert, update, newId, pick } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

export async function onRequestGet({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]

  if (id) {
    const paciente = await findOne(env.DB, 'pacientes', { where: { id, tenant_id: user.sub } })
    if (!paciente) return notFound('Paciente')
    return ok(paciente)
  }

  const url = new URL(request.url)
  const search = url.searchParams.get('q') ?? ''
  const estado = url.searchParams.get('estado') ?? 'activo'

  let sql = `SELECT * FROM pacientes WHERE tenant_id = ?1 AND estado = ?2`
  const values = [user.sub, estado]

  if (search.trim()) {
    sql += ` AND (apellido LIKE ?3 OR nombre LIKE ?3 OR dni LIKE ?3)`
    values.push(`%${search}%`)
  }

  sql += ` ORDER BY apellido ASC`
  const result = await env.DB.prepare(sql).bind(...values).all()
  return ok(result?.results ?? [])
}

export async function onRequestPost({ request, data, env }) {
  const { user } = data
  const body = await request.json()
  if (!body.nombre || !body.apellido) return err('Nombre y apellido son requeridos')

  const paciente = await insert(env.DB, 'pacientes', {
    id: newId(),
    tenant_id: user.sub,
    ...pick('pacientes', body),
  })
  return created(paciente)
}

export async function onRequestPatch({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')

  const body = await request.json()
  const updated = await update(env.DB, 'pacientes', id, pick('pacientes', body), user.sub)
  if (!updated) return notFound('Paciente')
  return ok(updated)
}

export async function onRequestDelete({ data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')

  // Soft delete
  const updated = await update(env.DB, 'pacientes', id, { estado: 'archivado' }, user.sub)
  if (!updated) return notFound('Paciente')
  return ok({ mensaje: 'Paciente archivado' })
}
