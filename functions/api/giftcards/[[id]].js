import { ok, created, err, notFound, forbidden, cors } from '../../_lib/response.js'
import { findOne, pick, newId } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

const CAN_WRITE = new Set(['tenant', 'superadmin', 'admin'])

export async function onRequestGet({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]

  if (id) {
    const gc = await findOne(env.DB, 'giftcards', { where: { id, tenant_id: user.sub } })
    if (!gc) return notFound('Giftcard')
    return ok(gc)
  }

  const url = new URL(request.url)
  const codigo = url.searchParams.get('codigo')
  const estado = url.searchParams.get('estado')
  const pacienteId = url.searchParams.get('paciente_id')

  let sql = `SELECT g.*, p.nombre || ' ' || p.apellido as paciente_nombre
             FROM giftcards g
             LEFT JOIN pacientes p ON p.id = g.paciente_id
             WHERE g.tenant_id = ?1`
  const values = [user.sub]
  let idx = 2

  if (codigo) { sql += ` AND g.codigo = ?${idx++}`; values.push(codigo.toUpperCase()) }
  if (estado) { sql += ` AND g.estado = ?${idx++}`; values.push(estado) }
  if (pacienteId) { sql += ` AND g.paciente_id = ?${idx++}`; values.push(pacienteId) }

  sql += ` ORDER BY g.created_at DESC LIMIT 200`
  const result = await env.DB.prepare(sql).bind(...values).all()
  return ok(result?.results ?? [])
}

export async function onRequestPost({ request, data, env }) {
  const { user } = data

  if (!CAN_WRITE.has(user.rol)) return forbidden('No tenés permisos para crear giftcards')

  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }

  const { monto_original } = body
  if (!monto_original || Number(monto_original) <= 0) return err('El monto debe ser mayor a cero')

  // Generar código único si no viene
  const codigo = (body.codigo?.toUpperCase() || generateCode()).replace(/[^A-Z0-9]/g, '').substring(0, 12)
  if (!codigo) return err('Código inválido')

  // Verificar unicidad del código en este tenant
  const existing = await findOne(env.DB, 'giftcards', { where: { codigo, tenant_id: user.sub } })
  if (existing) return err('Ya existe una giftcard con ese código', 409)

  const gcData = {
    id: newId(),
    tenant_id: user.sub,
    codigo,
    monto_original: Number(monto_original),
    monto_restante: Number(monto_original),
    ...pick('giftcards', body),
  }
  // Override codigo after pick (which might not have it)
  gcData.codigo = codigo

  const keys = Object.keys(gcData)
  const placeholders = keys.map((_, i) => `?${i + 1}`).join(', ')
  const result = await env.DB.prepare(
    `INSERT INTO giftcards (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`
  ).bind(...Object.values(gcData)).first()

  return created(result)
}

export async function onRequestPatch({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')

  if (!CAN_WRITE.has(user.rol)) return forbidden('No tenés permisos para modificar giftcards')

  const gc = await findOne(env.DB, 'giftcards', { where: { id, tenant_id: user.sub } })
  if (!gc) return notFound('Giftcard')

  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }

  const fields = {}
  for (const k of ['estado', 'notas', 'fecha_vencimiento', 'paciente_id']) {
    if (body[k] !== undefined) fields[k] = body[k]
  }

  // Aplicar saldo (cobrar con giftcard)
  if (body.aplicar_monto !== undefined) {
    const aplicar = Number(body.aplicar_monto)
    if (aplicar <= 0) return err('El monto a aplicar debe ser mayor a cero')
    if (gc.estado !== 'activo') return err('La giftcard no está activa')
    if (aplicar > gc.monto_restante) return err(`Saldo insuficiente. Disponible: $${gc.monto_restante}`)
    fields.monto_restante = gc.monto_restante - aplicar
    if (fields.monto_restante <= 0) fields.estado = 'usado'
  }

  if (!Object.keys(fields).length) return err('Sin campos a actualizar')

  const keys = Object.keys(fields)
  const sets = keys.map((k, i) => `${k} = ?${i + 1}`).join(', ')
  const updated = await env.DB.prepare(
    `UPDATE giftcards SET ${sets} WHERE id = ?${keys.length + 1} AND tenant_id = ?${keys.length + 2} RETURNING *`
  ).bind(...Object.values(fields), id, user.sub).first()

  return ok(updated)
}

export async function onRequestDelete({ data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')

  if (!CAN_WRITE.has(user.rol)) return forbidden('No tenés permisos para anular giftcards')

  const gc = await findOne(env.DB, 'giftcards', { where: { id, tenant_id: user.sub } })
  if (!gc) return notFound('Giftcard')

  await env.DB.prepare(
    `UPDATE giftcards SET estado = 'anulado' WHERE id = ?1 AND tenant_id = ?2`
  ).bind(id, user.sub).run()

  return ok({ ok: true })
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}
