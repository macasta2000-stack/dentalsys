import { ok, created, err, notFound, forbidden, cors } from '../../_lib/response.js'
import { findOne, insert, update, newId, pick } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

// Insumos (stock management) is off-limits to recepcionista and profesional
const CAN_ACCESS_INSUMOS = new Set(['tenant', 'superadmin', 'admin'])

export async function onRequestGet({ request, data, env, params }) {
  const { user } = data

  if (!CAN_ACCESS_INSUMOS.has(user.rol)) {
    return forbidden('No tenés permisos para acceder a los insumos')
  }
  const id = params?.id?.[0]

  if (id) {
    const insumo = await findOne(env.DB, 'insumos', { where: { id, tenant_id: user.sub } })
    if (!insumo) return notFound('Insumo')
    const movs = await env.DB.prepare(
      `SELECT * FROM movimientos_insumos WHERE insumo_id = ?1 AND tenant_id = ?2 ORDER BY created_at DESC LIMIT 20`
    ).bind(id, user.sub).all()
    return ok({ ...insumo, movimientos: movs?.results ?? [] })
  }

  const result = await env.DB.prepare(
    `SELECT * FROM insumos WHERE tenant_id = ?1 AND activo = 1 ORDER BY nombre ASC`
  ).bind(user.sub).all()
  return ok(result?.results ?? [])
}

export async function onRequestPost({ request, data, env }) {
  const { user } = data

  if (!CAN_ACCESS_INSUMOS.has(user.rol)) {
    return forbidden('No tenés permisos para crear insumos')
  }

  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }
  if (!body.nombre) return err('Nombre es requerido')
  if (body.precio !== undefined && body.precio !== null && Number(body.precio) < 0) return err('El precio no puede ser negativo')
  if (body.precio_unitario !== undefined && body.precio_unitario !== null && Number(body.precio_unitario) < 0) return err('El precio no puede ser negativo')
  const picked = pick('insumos', body)
  // Accept 'stock' as alias for 'stock_actual'
  if (body.stock !== undefined && picked.stock_actual === undefined) {
    picked.stock_actual = body.stock
  }
  const insumo = await insert(env.DB, 'insumos', {
    id: newId(),
    tenant_id: user.sub,
    ...picked,
  })
  return created(insumo)
}

export async function onRequestPatch({ request, data, env, params }) {
  const { user } = data

  if (!CAN_ACCESS_INSUMOS.has(user.rol)) {
    return forbidden('No tenés permisos para modificar insumos')
  }

  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }

  // Si viene ajuste de stock, crear movimiento
  if (body._movimiento) {
    const { tipo, cantidad, motivo } = body._movimiento
    if (tipo === 'ajuste') {
      if (Number(cantidad) < 0) return err('La cantidad de ajuste no puede ser negativa', 400)
      // Para ajuste, obtener stock actual y calcular delta para llegar al nuevo valor
      const insumoActual = await findOne(env.DB, 'insumos', { where: { id, tenant_id: user.sub } })
      const stockActual = insumoActual ? Number(insumoActual.stock_actual) : 0
      const delta = Number(cantidad) - stockActual
      await insert(env.DB, 'movimientos_insumos', {
        id: newId(), tenant_id: user.sub, insumo_id: id,
        tipo, cantidad: Number(cantidad), motivo: motivo ?? null,
      })
      await env.DB.prepare(
        `UPDATE insumos SET stock_actual = ?1, updated_at = datetime('now') WHERE id = ?2 AND tenant_id = ?3`
      ).bind(Number(cantidad), id, user.sub).run()
    } else {
      const delta = tipo === 'entrada' ? Number(cantidad) : -Number(cantidad)
      // Verificar que no quede stock negativo en salidas
      if (tipo === 'salida') {
        const insumoActual = await findOne(env.DB, 'insumos', { where: { id, tenant_id: user.sub } })
        if (insumoActual && Number(insumoActual.stock_actual) + delta < 0) {
          return err(`Stock insuficiente. Stock actual: ${insumoActual.stock_actual}, cantidad solicitada: ${cantidad}`, 400)
        }
      }
      await insert(env.DB, 'movimientos_insumos', {
        id: newId(), tenant_id: user.sub, insumo_id: id,
        tipo, cantidad: Number(cantidad), motivo: motivo ?? null,
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

  if (!CAN_ACCESS_INSUMOS.has(user.rol)) {
    return forbidden('No tenés permisos para eliminar insumos')
  }

  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  const updated = await update(env.DB, 'insumos', id, { activo: 0 }, user.sub)
  if (!updated) return notFound('Insumo')
  return ok({ mensaje: 'Insumo desactivado' })
}
