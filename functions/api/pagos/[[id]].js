import { ok, created, err, notFound, cors } from '../../_lib/response.js'
import { findOne, insert, newId, pick } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

export async function onRequestGet({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]

  if (id) {
    const pago = await findOne(env.DB, 'pagos', { where: { id, tenant_id: user.sub } })
    if (!pago) return notFound('Pago')
    return ok(pago)
  }

  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const pacienteId = url.searchParams.get('paciente_id')

  let sql = `
    SELECT pg.*, p.nombre || ' ' || p.apellido as paciente_nombre
    FROM pagos pg
    LEFT JOIN pacientes p ON p.id = pg.paciente_id
    WHERE pg.tenant_id = ?1
  `
  const values = [user.sub]
  let idx = 2

  if (from) { sql += ` AND pg.fecha >= ?${idx++}`; values.push(from) }
  if (to) { sql += ` AND pg.fecha <= ?${idx++}`; values.push(to) }
  if (pacienteId) { sql += ` AND pg.paciente_id = ?${idx++}`; values.push(pacienteId) }

  sql += ` ORDER BY pg.fecha DESC`
  const result = await env.DB.prepare(sql).bind(...values).all()
  return ok(result?.results ?? [])
}

export async function onRequestPost({ request, data, env }) {
  const { user } = data
  const body = await request.json()
  const { paciente_id, monto, metodo_pago } = body
  if (!paciente_id || !monto || !metodo_pago) return err('Paciente, monto y método de pago son requeridos')

  const pago = await insert(env.DB, 'pagos', {
    id: newId(),
    tenant_id: user.sub,
    ...pick('pagos', body),
    monto: Number(monto),
  })

  // Actualizar saldo del paciente
  await env.DB.prepare(
    `UPDATE pacientes SET saldo = saldo + ?1, updated_at = datetime('now') WHERE id = ?2 AND tenant_id = ?3`
  ).bind(Number(monto), paciente_id, user.sub).run()

  return created(pago)
}
