import { ok, created, err, notFound, forbidden, cors } from '../../_lib/response.js'
import { findOne, newId, pick } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

// Financial payment records:
// - recepcionista CAN register (create) payments for patients — that is their primary checkout task
// - recepcionista CANNOT void/delete payments (anti-fraud: only privileged roles can reverse money)
// - recepcionista CANNOT read the global payment list (financial report) — must scope by paciente_id
const CAN_CREATE_PAGOS = new Set(['tenant', 'superadmin', 'admin', 'profesional', 'recepcionista'])
const CAN_DELETE_PAGOS = new Set(['tenant', 'superadmin', 'admin', 'profesional'])
const CAN_READ_GLOBAL_PAGOS = new Set(['tenant', 'superadmin', 'admin'])

export async function onRequestGet({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]

  if (id) {
    // Any authenticated user of this tenant can read a specific payment record
    const pago = await findOne(env.DB, 'pagos', { where: { id, tenant_id: user.sub } })
    if (!pago) return notFound('Pago')
    return ok(pago)
  }

  // Listing all payments without a patient filter is a financial report — restricted
  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const pacienteId = url.searchParams.get('paciente_id')

  // recepcionista may only list payments scoped to a specific patient
  if (!CAN_READ_GLOBAL_PAGOS.has(user.rol) && !pacienteId) {
    return forbidden('Necesitás especificar un paciente para ver sus pagos')
  }

  let sql = `
    SELECT pg.*, p.nombre || ' ' || p.apellido as paciente_nombre,
           p.obra_social as paciente_obra_social
    FROM pagos pg
    LEFT JOIN pacientes p ON p.id = pg.paciente_id
    WHERE pg.tenant_id = ?1
  `
  const values = [user.sub]
  let idx = 2

  // Use SUBSTR for date comparison to correctly handle both 'YYYY-MM-DD' and 'YYYY-MM-DD HH:MM:SS' formats
  if (from) { sql += ` AND SUBSTR(pg.fecha, 1, 10) >= ?${idx++}`; values.push(from.substring(0, 10)) }
  if (to) { sql += ` AND SUBSTR(pg.fecha, 1, 10) <= ?${idx++}`; values.push(to.substring(0, 10)) }
  if (pacienteId) { sql += ` AND pg.paciente_id = ?${idx++}`; values.push(pacienteId) }

  sql += ` ORDER BY pg.fecha DESC`
  const result = await env.DB.prepare(sql).bind(...values).all()
  return ok(result?.results ?? [])
}

export async function onRequestPost({ request, data, env }) {
  const { user } = data

  if (!CAN_CREATE_PAGOS.has(user.rol)) {
    return forbidden('No tenés permisos para registrar pagos')
  }

  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }
  const { paciente_id, monto, metodo_pago } = body
  if (!paciente_id || monto === undefined || monto === null || monto === '' || !metodo_pago) return err('Paciente, monto y método de pago son requeridos')
  if (!monto || Number(monto) <= 0) return err('El monto debe ser mayor a cero')

  // Verificar que el paciente pertenece a este tenant (evitar cross-tenant data leak)
  const pacienteOwner = await env.DB.prepare(
    `SELECT id FROM pacientes WHERE id = ?1 AND tenant_id = ?2`
  ).bind(paciente_id, user.sub).first()
  if (!pacienteOwner) return err('Paciente no encontrado', 404)

  const pagoData = {
    id: newId(),
    tenant_id: user.sub,
    ...pick('pagos', body),
    monto: Number(monto),
  }

  // Calcular monto_os y monto_copago si viene en el body
  if (body.monto_os !== undefined) pagoData.monto_os = Number(body.monto_os) || 0
  if (body.monto_copago !== undefined) pagoData.monto_copago = Number(body.monto_copago) || 0
  if (body.turno_id) pagoData.turno_id = body.turno_id

  // Usar batch() para atomicidad: INSERT pago + UPDATE saldo en una sola transacción
  const keys = Object.keys(pagoData)
  const placeholders = keys.map((_, i) => `?${i + 1}`).join(', ')
  const stmtInsert = env.DB.prepare(
    `INSERT INTO pagos (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`
  ).bind(...Object.values(pagoData))

  const stmtSaldo = env.DB.prepare(
    `UPDATE pacientes SET saldo = saldo + ?1, updated_at = datetime('now') WHERE id = ?2 AND tenant_id = ?3`
  ).bind(Number(monto), paciente_id, user.sub)

  const [insertResult] = await env.DB.batch([stmtInsert, stmtSaldo])
  const pago = insertResult.results?.[0] ?? null

  return created(pago)
}

export async function onRequestDelete({ data, env, params }) {
  const { user } = data

  // Voiding a payment is a financial operation — restricted to privileged roles (not recepcionista)
  if (!CAN_DELETE_PAGOS.has(user.rol)) {
    return forbidden('No tenés permisos para anular pagos')
  }

  const id = params?.id?.[0]
  if (!id) return err('ID requerido')

  const pago = await findOne(env.DB, 'pagos', { where: { id, tenant_id: user.sub } })
  if (!pago) return notFound('Pago')

  // Verificar que el paciente del pago pertenece a este tenant antes de revertir saldo
  const pacienteOwner = await env.DB.prepare(
    `SELECT id FROM pacientes WHERE id = ?1 AND tenant_id = ?2`
  ).bind(pago.paciente_id, user.sub).first()

  // Usar batch() para atomicidad: anular pago + revertir saldo en una sola transacción
  const stmtAnular = env.DB.prepare(
    `UPDATE pagos SET anulado = 1 WHERE id = ?1 AND tenant_id = ?2`
  ).bind(id, user.sub)

  const stmtRevertir = pacienteOwner ? env.DB.prepare(
    `UPDATE pacientes SET saldo = saldo - ?1, updated_at = datetime('now') WHERE id = ?2 AND tenant_id = ?3`
  ).bind(Number(pago.monto), pago.paciente_id, user.sub) : null

  const stmts = stmtRevertir ? [stmtAnular, stmtRevertir] : [stmtAnular]
  await env.DB.batch(stmts)

  return ok({ mensaje: 'Pago anulado' })
}
