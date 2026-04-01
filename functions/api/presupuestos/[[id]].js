import { ok, created, err, notFound, cors } from '../../_lib/response.js'
import { findOne, insert, update, newId, remove } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

export async function onRequestGet({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]

  if (id) {
    const presup = await findOne(env.DB, 'presupuestos', { where: { id, tenant_id: user.sub } })
    if (!presup) return notFound('Presupuesto')
    const items = await env.DB.prepare(
      `SELECT * FROM presupuesto_items WHERE presupuesto_id = ?1 AND tenant_id = ?2 ORDER BY orden ASC`
    ).bind(id, user.sub).all()
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

const ROLES_PRESUPUESTO = new Set(['tenant', 'superadmin', 'admin', 'profesional'])

export async function onRequestPost({ request, data, env }) {
  const { user } = data
  if (!ROLES_PRESUPUESTO.has(user.rol)) return err('No tenés permiso para crear presupuestos', 403)
  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }
  const { paciente_id, items = [] } = body
  if (!paciente_id) return err('Paciente requerido')

  try {
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

    // Insertar items — descripcion nunca puede ser null/undefined
    if (items.length > 0) {
      const stmt = env.DB.prepare(
        `INSERT INTO presupuesto_items (id, presupuesto_id, tenant_id, prestacion_id, descripcion, pieza_dental, cantidad, precio_unitario, subtotal, orden)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
      )
      const batch = items.map((item, i) =>
        stmt.bind(
          newId(), presup.id, user.sub,
          item.prestacion_id ?? null,
          item.descripcion ?? item.nombre ?? 'Sin descripción',
          item.pieza_dental ?? null,
          item.cantidad ?? 1,
          item.precio_unitario ?? item.precio_unit ?? 0,
          (item.cantidad ?? 1) * (item.precio_unitario ?? item.precio_unit ?? 0),
          i
        )
      )
      await env.DB.batch(batch)
    }

    return created({ ...presup, items })
  } catch (e) {
    console.error('presupuestos POST error:', e?.message ?? e)
    return err('No se pudo crear el presupuesto', 500)
  }
}

export async function onRequestPatch({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }
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
    await env.DB.prepare(`DELETE FROM presupuesto_items WHERE presupuesto_id = ?1 AND tenant_id = ?2`).bind(id, user.sub).run()
    if (items.length > 0) {
      const total = items.reduce((acc, item) => acc + (item.cantidad ?? 1) * (item.precio_unitario ?? 0), 0)
      const stmt = env.DB.prepare(
        `INSERT INTO presupuesto_items (id, presupuesto_id, tenant_id, prestacion_id, descripcion, pieza_dental, cantidad, precio_unitario, subtotal, orden)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
      )
      const batch = items.map((item, i) =>
        stmt.bind(newId(), id, user.sub, item.prestacion_id ?? null, item.descripcion, item.pieza_dental ?? null,
          item.cantidad ?? 1, item.precio_unitario ?? 0,
          (item.cantidad ?? 1) * (item.precio_unitario ?? 0), i)
      )
      await env.DB.batch(batch)
      // Actualizar total
      await update(env.DB, 'presupuestos', id, { total }, user.sub)
    }
    const newItems = await env.DB.prepare(`SELECT * FROM presupuesto_items WHERE presupuesto_id = ?1 AND tenant_id = ?2 ORDER BY orden ASC`).bind(id, user.sub).all()
    return ok({ ...updated, items: newItems?.results ?? [] })
  }

  return ok(updated)
}

export async function onRequestDelete({ data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  const presup = await findOne(env.DB, 'presupuestos', { where: { id, tenant_id: user.sub } })
  if (!presup) return notFound('Presupuesto')
  await update(env.DB, 'presupuestos', id, { estado: 'rechazado' }, user.sub)
  return ok({ mensaje: 'Presupuesto rechazado' })
}
