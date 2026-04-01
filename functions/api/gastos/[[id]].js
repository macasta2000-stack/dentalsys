import { ok, created, err, notFound, cors } from '../../_lib/response.js'
import { findOne, findMany, insert, update, remove, newId, pick } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

export async function onRequestGet({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]

  if (id) {
    const gasto = await findOne(env.DB, 'gastos', { where: { id, tenant_id: user.sub } })
    if (!gasto) return notFound('Gasto')
    return ok(gasto)
  }

  const url = new URL(request.url)
  const desde = url.searchParams.get('desde') || url.searchParams.get('from')
  const hasta = url.searchParams.get('hasta') || url.searchParams.get('to')
  const categoria = url.searchParams.get('categoria')

  let sql = `SELECT * FROM gastos WHERE tenant_id = ?1`
  const values = [user.sub]
  let idx = 2

  if (desde) { sql += ` AND fecha >= ?${idx++}`; values.push(desde) }
  if (hasta) { sql += ` AND fecha <= ?${idx++}`; values.push(hasta) }
  if (categoria && categoria !== 'todas') { sql += ` AND categoria = ?${idx++}`; values.push(categoria) }

  sql += ` ORDER BY fecha DESC, created_at DESC`
  const result = await env.DB.prepare(sql).bind(...values).all()
  return ok(result?.results ?? [])
}

export async function onRequestPost({ request, data, env }) {
  const { user } = data
  let body
  try { body = await request.json() } catch { return err('Body inválido', 400) }

  if (!body.descripcion) return err('La descripción es requerida')
  if (!body.monto || Number(body.monto) <= 0) return err('El monto debe ser mayor a 0')
  if (body.descripcion?.length > 500) return err('La descripción es demasiado larga (máx 500)')

  const picked = pick('gastos', body)
  picked.monto = Number(picked.monto)

  try {
    const gasto = await insert(env.DB, 'gastos', {
      id: newId(),
      tenant_id: user.sub,
      ...picked,
    })
    return created(gasto)
  } catch (e) {
    console.error('gastos POST error:', e?.message)
    return err('No se pudo registrar el gasto', 500)
  }
}

export async function onRequestPatch({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')

  let body
  try { body = await request.json() } catch { return err('Body inválido', 400) }

  if (body.monto !== undefined && Number(body.monto) <= 0) return err('El monto debe ser mayor a 0')

  const picked = pick('gastos', body)
  if (picked.monto) picked.monto = Number(picked.monto)
  const updated = await update(env.DB, 'gastos', id, picked, user.sub)
  if (!updated) return notFound('Gasto')
  return ok(updated)
}

export async function onRequestDelete({ data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')

  const exists = await findOne(env.DB, 'gastos', { where: { id, tenant_id: user.sub } })
  if (!exists) return notFound('Gasto')

  await remove(env.DB, 'gastos', id, user.sub)
  return ok({ mensaje: 'Gasto eliminado' })
}
