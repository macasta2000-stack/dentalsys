import { ok, created, err, notFound, cors } from '../../_lib/response.js'
import { findOne, insert, update, newId, pick } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

export async function onRequestGet({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]

  if (id) {
    const insumo = await findOne(env.DB, 'insumos', { where: { id, tenant_id: user.sub } })
    if (!insumo) return notFound('Insumo')
    const movs = await env.DB.prepare(
      `SELECT * FROM movimientos_insumos WHERE insumo_id = ?1 ORDER BY fecha DESC LIMIT 20`
    ).bind(id).all()
    return ok({ ...insumo, movimientos: movs?.results ?? [] })
  }

  const result = await env.DB.prepare(
    `SELECT * FROM insumos WHERE tenant_id = ?1 AND activo = 1 ORDER BY nombre ASC`
  ).bind(user.sub).all()
  return ok(result?.results ?? [])
}

export async function onRequestPost({ request, data, env }) {
  const { user } = data
  const body = await request.json()
  if (!body.nombre) return err('Nombre es requerido')
  const insumo = await insert(env.DB, 'insumos', {
    id: newId(),
    tenant_id: user.sub,
    ...pick('insumos', body),
  })
  return created(insumo)
}

export async function onRequestPatch({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  const body = await request.json()

  // Si viene ajuste de stock, crear movimiento
  if (body._movimiento) {
    const { tipo, cantidad, motivo, descripcion } = body._movimiento
    if (tipo === 'ajuste') {
      // Para ajuste, obtener stock actual y calcular delta para llegar al nuevo valor
      const insumoActual = await findOne(env.DB, 'insumos', { where: { id, tenant_id: user.sub } })
      const stockActual = insumoActual ? Number(insumoActual.stock_actual) : 0
      const delta = Number(cantidad) - stockActual
      await insert(env.DB, 'movimientos_insumos', {
        id: newId(), tenant_id: user.sub, insumo_id: id,
        tipo, cantidad: Number(cantidad), motivo: motivo ?? null, descripcion: descripcion ?? null,
      })
      await env.DB.prepare(
        `UPDATE insumos SET stock_actual = ?1, updated_at = datetime('now') WHERE id = ?2 AND tenant_id = ?3`
      ).bind(Number(cantidad), id, user.sub).run()
    } else {
      const delta = tipo === 'entrada' ? Number(cantidad) : -Number(cantidad)
      await insert(env.DB, 'movimientos_insumos', {
        id: newId(), tenant_id: user.sub, insumo_id: id,
        tipo, cantidad: Number(cantidad), motivo: motivo ?? null, descripcion: descripcion ?? null,
      })
      await env.DB.prepare(
        `UPDATE insumos SET stock_actual = stock_actual + ?1, updated_at = datetime('now') WHERE id = ?2 AND tenant_id = ?3`
      ).bind(delta, id, user.sub).run()
    }
  }

  const cleanBody = pick('insumos', body)
  if (Object.keys(cleanBody).length > 0) {
    await update(env.DB, 'insumos', id, cleanBody, user.sub)
  }

  const updated = await findOne(env.DB, 'insumos', { where: { id, tenant_id: user.sub } })
  return ok(updated)
}

export async function onRequestDelete({ data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  const updated = await update(env.DB, 'insumos', id, { activo: 0 }, user.sub)
  if (!updated) return notFound('Insumo')
  return ok({ mensaje: 'Insumo desactivado' })
}
