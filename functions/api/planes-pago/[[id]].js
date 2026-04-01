import { ok, created, err, notFound, forbidden, cors } from '../../_lib/response.js'
import { findOne, insert, update, newId } from '../../_lib/db.js'

const CAN_MANAGE_PLANES = new Set(['tenant', 'superadmin', 'admin', 'profesional'])

export async function onRequestOptions() { return cors() }

export async function onRequestGet({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]

  if (id) {
    const plan = await findOne(env.DB, 'planes_pago', { where: { id, tenant_id: user.sub } })
    if (!plan) return notFound('Plan de pago')
    const cuotas = await env.DB.prepare(
      `SELECT * FROM cuotas_pago WHERE plan_id = ?1 AND tenant_id = ?2 ORDER BY numero_cuota ASC`
    ).bind(id, user.sub).all()
    return ok({ ...plan, cuotas: cuotas.results ?? [] })
  }

  const url = new URL(request.url)
  const pacienteId = url.searchParams.get('paciente_id')

  let sql = `
    SELECT pp.*, p.nombre || ' ' || p.apellido as paciente_nombre,
           (SELECT COUNT(*) FROM cuotas_pago WHERE plan_id = pp.id AND estado = 'pagada') as cuotas_pagadas_real
    FROM planes_pago pp
    LEFT JOIN pacientes p ON p.id = pp.paciente_id
    WHERE pp.tenant_id = ?1
  `
  const values = [user.sub]
  if (pacienteId) { sql += ` AND pp.paciente_id = ?2`; values.push(pacienteId) }
  sql += ` ORDER BY pp.created_at DESC`

  const result = await env.DB.prepare(sql).bind(...values).all()
  return ok(result?.results ?? [])
}

export async function onRequestPost({ request, data, env }) {
  const { user } = data
  // Crear un plan de pago es una decisión financiera — recepcionista no puede hacerlo
  if (!CAN_MANAGE_PLANES.has(user.rol)) {
    return forbidden('No tenés permisos para crear planes de pago')
  }
  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }
  const { paciente_id, concepto, monto_total, cuotas } = body

  if (!paciente_id || !concepto || !monto_total || !cuotas)
    return err('Paciente, concepto, monto total y cantidad de cuotas son requeridos')

  const numCuotas = parseInt(cuotas) || 1
  if (numCuotas < 1 || numCuotas > 60) return err('El número de cuotas debe ser entre 1 y 60')
  const cuotaMonto = Math.ceil(Number(monto_total) / numCuotas * 100) / 100

  // Verificar que el paciente pertenece a este tenant
  const pacienteCheck = await env.DB.prepare(
    `SELECT id FROM pacientes WHERE id = ?1 AND tenant_id = ?2`
  ).bind(paciente_id, user.sub).first()
  if (!pacienteCheck) return notFound('Paciente')

  // Crear plan + todas las cuotas en un batch atómico
  const planId = newId()
  const planFields = {
    id: planId,
    tenant_id: user.sub,
    paciente_id,
    concepto,
    monto_total: Number(monto_total),
    cuotas: numCuotas,
    cuota_monto: cuotaMonto,
    cuotas_pagadas: 0,
    estado: 'activo',
  }
  const planKeys = Object.keys(planFields)
  const stmtPlan = env.DB.prepare(
    `INSERT INTO planes_pago (${planKeys.join(', ')}) VALUES (${planKeys.map((_, i) => `?${i + 1}`).join(', ')}) RETURNING *`
  ).bind(...Object.values(planFields))

  const hoy = new Date()
  const cuotaIds = []
  const cuotaStmts = []
  for (let i = 1; i <= numCuotas; i++) {
    const vencimiento = new Date(hoy)
    vencimiento.setMonth(vencimiento.getMonth() + (i - 1))
    const cuotaId = newId()
    cuotaIds.push({ id: cuotaId, numero_cuota: i, monto: cuotaMonto, estado: 'pendiente' })
    cuotaStmts.push(
      env.DB.prepare(
        `INSERT INTO cuotas_pago (id, plan_id, tenant_id, numero_cuota, monto, fecha_vencimiento, estado) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pendiente')`
      ).bind(cuotaId, planId, user.sub, i, cuotaMonto, vencimiento.toISOString().split('T')[0])
    )
  }

  const [planResult] = await env.DB.batch([stmtPlan, ...cuotaStmts])
  const plan = planResult.results?.[0] ?? planFields

  return created({ ...plan, cuotas: cuotaIds })
}

export async function onRequestPatch({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }

  // Registrar pago de cuota específica en batch atómico (pago_id es opcional)
  if (body.cuota_id) {
    const stmtCuota = env.DB.prepare(`
      UPDATE cuotas_pago SET estado = 'pagada', fecha_pago = datetime('now'), pago_id = ?1
      WHERE id = ?2 AND plan_id = ?3 AND tenant_id = ?4
    `).bind(body.pago_id ?? null, body.cuota_id, id, user.sub)

    // Usar subquery para calcular cuotas_pagadas y estado en la misma sentencia,
    // de modo que el batch sea 100% atómico sin necesidad de un SELECT previo
    const stmtPlan = env.DB.prepare(`
      UPDATE planes_pago SET
        cuotas_pagadas = (SELECT COUNT(*) FROM cuotas_pago WHERE plan_id = ?1 AND tenant_id = ?2 AND estado = 'pagada'),
        estado = CASE
          WHEN (SELECT COUNT(*) FROM cuotas_pago WHERE plan_id = ?1 AND tenant_id = ?2 AND estado = 'pagada') >= cuotas
          THEN 'completado' ELSE 'activo' END,
        updated_at = datetime('now')
      WHERE id = ?1 AND tenant_id = ?2
    `).bind(id, user.sub)

    await env.DB.batch([stmtCuota, stmtPlan])
  }

  const updated = await findOne(env.DB, 'planes_pago', { where: { id, tenant_id: user.sub } })
  return ok(updated)
}

export async function onRequestDelete({ data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  await env.DB.prepare(
    `UPDATE planes_pago SET estado = 'cancelado', updated_at = datetime('now') WHERE id = ?1 AND tenant_id = ?2`
  ).bind(id, user.sub).run()
  return ok({ mensaje: 'Plan cancelado' })
}
