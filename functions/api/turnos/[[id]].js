import { ok, created, err, notFound, cors } from '../../_lib/response.js'
import { findOne, insert, update, newId, pick } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

export async function onRequestGet({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]

  if (id) {
    const t = await findOne(env.DB, 'turnos', { where: { id, tenant_id: user.sub } })
    if (!t) return notFound('Turno')
    return ok(t)
  }

  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const pacienteId = url.searchParams.get('paciente_id')

  let sql = `
    SELECT t.*, p.nombre || ' ' || p.apellido as paciente_nombre,
           p.telefono as paciente_telefono, p.obra_social as paciente_obra_social
    FROM turnos t
    LEFT JOIN pacientes p ON p.id = t.paciente_id
    WHERE t.tenant_id = ?1 AND t.estado != 'cancelado'
  `
  const values = [user.sub]
  let idx = 2

  if (from) { sql += ` AND t.fecha_hora >= ?${idx++}`; values.push(from) }
  if (to) { sql += ` AND t.fecha_hora <= ?${idx++}`; values.push(to) }
  if (pacienteId) { sql += ` AND t.paciente_id = ?${idx++}`; values.push(pacienteId) }

  sql += ` ORDER BY t.fecha_hora ASC`
  const result = await env.DB.prepare(sql).bind(...values).all()
  return ok(result?.results ?? [])
}

export async function onRequestPost({ request, data, env }) {
  const { user } = data
  const body = await request.json()
  if (!body.paciente_id || !body.fecha_hora) return err('Paciente y fecha/hora son requeridos')

  const turno = await insert(env.DB, 'turnos', {
    id: newId(),
    tenant_id: user.sub,
    ...pick('turnos', body),
    duracion_minutos: Number(body.duracion_minutos) || 60,
  })
  return created(turno)
}

export async function onRequestPatch({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  const body = await request.json()
  const updated = await update(env.DB, 'turnos', id, pick('turnos', body), user.sub)
  if (!updated) return notFound('Turno')
  return ok(updated)
}

export async function onRequestDelete({ data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  const updated = await update(env.DB, 'turnos', id, { estado: 'cancelado' }, user.sub)
  if (!updated) return notFound('Turno')
  return ok({ mensaje: 'Turno cancelado' })
}
