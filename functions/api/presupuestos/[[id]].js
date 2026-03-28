import { ok, created, err, notFound, cors } from '../../_lib/response.js'
import { findOne, insert, update, newId } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

export async function onRequestGet({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]

  if (id) {
    const presup = await findOne(env.DB, 'presupuestos', { where: { id, tenant_id: user.sub } })
    if (!presup) return notFound('Presupuesto')
    const items = await env.DB.prepare(
      `SELECT * FROM presupuesto_items WHERE presupuesto_id = ?1 ORDER BY orden ASC`
    ).bind(id).all()
    return ok({ ...presup, items: items?.results ?? [] })
  }

  const url = new URL(request.url)
  const pacienteId = url.searchParams.get('paciente_id')

  let sql = `
    SELECT pr.*, p.nombre || ' ' || p.apellido as paciente_nombre
    FROM presupuestos pr
    LEFT JOIN pacientes p ON p.id = pr.paciente_id
    WHERE pr.tenant_id = ?1
  `
  const values = [user.sub]
  if (pacienteId) { sql += ` AND pr.paciente_id = ?2`; values.push(pacienteId) }
  sql += ` ORDER BY pr.created_at DESC`

  const result = await env.DB.prepare(sql).bind(...values).all()
  return ok(result?.results ?? [])
}

export async function onRequestPost({ request, data, env }) {
  const { user } = data
  const body = await request.json()
  const { paciente_id, items = [] } = body
  if (!paciente_id) return err('Paciente requerido')

  // Calcular total
  const total = items.reduce((acc, item) => acc + (item.cantidad ?? 1) * (item.precio_unitario ?? 0), 0)

  // Número correlativo
  const lastNum = await env.DB.prepare(
    `SELECT MAX(numero) as max_num FROM presupuestos WHERE tenant_id = ?1`
  ).bind(user.sub).first()
  const numero = (lastNum?.max_num ?? 0) + 1

  const presup = await insert(env.DB, 'presupuestos', {
    id: newId(),
    tenant_id: user.sub,
    paciente_id,
    numero,
    total,
    estado: body.estado ?? 'pendiente',
    notas: body.notas ?? null,
    fecha_vencimiento: body.fecha_vencimiento ?? null,
  })

  // Insertar items
  if (items.length > 0) {
    const stmt = env.DB.prepare(
      `INSERT INTO presupuesto_items (id, presupuesto_id, prestacion_id, descripcion, pieza_dental, cantidad, precio_unitario, subtotal, orden)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
    )
    const batch = items.map((item, i) =>
      stmt.bind(
        newId(), presup.id,
        item.prestacion_id ?? null,
        item.descripcion,
        item.pieza_dental ?? null,
        item.cantidad ?? 1,
        item.precio_unitario ?? 0,
        (item.cantidad ?? 1) * (item.precio_unitario ?? 0),
        i
      )
    )
    await env.DB.batch(batch)
  }

  return created({ ...presup, items })
}

export async function onRequestPatch({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  const body = await request.json()
  const items = body.items
  delete body.id; delete body.tenant_id; delete body.items

  const presup = await findOne(env.DB, 'presupuestos', { where: { id, tenant_id: user.sub } })
  if (!presup) return notFound('Presupuesto')

  // Actualizar campos del presupuesto
  const cleanBody = {}
  const allowed = ['estado','notas','fecha_vencimiento','total_pagado','total']
  for (const k of allowed) {
    if (k in body) cleanBody[k] = body[k]
  }

  let updated = presup
  if (Object.keys(cleanBody).length > 0) {
    updated = await update(env.DB, 'presupuestos', id, cleanBody, user.sub)
  }

  // Si vienen items, reemplazarlos
  if (items !== undefined) {
    await env.DB.prepare(`DELETE FROM presupuesto_items WHERE presupuesto_id = ?1`).bind(id).run()
    if (items.length > 0) {
      const total = items.reduce((acc, item) => acc + (item.cantidad ?? 1) * (item.precio_unitario ?? 0), 0)
      const stmt = env.DB.prepare(
        `INSERT INTO presupuesto_items (id, presupuesto_id, prestacion_id, descripcion, pieza_dental, cantidad, precio_unitario, subtotal, orden)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
      )
      const batch = items.map((item, i) =>
        stmt.bind(newId(), id, item.prestacion_id ?? null, item.descripcion, item.pieza_dental ?? null,
          item.cantidad ?? 1, item.precio_unitario ?? 0,
          (item.cantidad ?? 1) * (item.precio_unitario ?? 0), i)
      )
      await env.DB.batch(batch)
      // Actualizar total
      await update(env.DB, 'presupuestos', id, { total }, user.sub)
    }
    const newItems = await env.DB.prepare(`SELECT * FROM presupuesto_items WHERE presupuesto_id = ?1 ORDER BY orden ASC`).bind(id).all()
    return ok({ ...updated, items: newItems?.results ?? [] })
  }

  return ok(updated)
}
