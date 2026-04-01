import { ok, created, err, notFound, cors } from '../../_lib/response.js'
import { findOne, insert, update, newId, pick } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

export async function onRequestGet({ request, data, env, params }) {
  const { user } = data
  if (user.rol === 'recepcionista') return err('No tenés permiso para ver la historia clínica', 403)
  const id = params?.id?.[0]

  // Si hay id en la URL y parece un UUID, buscar evolución individual
  if (id && id.length >= 32) {
    const ev = await findOne(env.DB, 'evoluciones', { where: { id, tenant_id: user.sub } })
    if (!ev) return notFound('Evolución')
    return ok(ev)
  }

  const url = new URL(request.url)
  const pacienteId = url.searchParams.get('paciente_id')
  if (!pacienteId) return err('paciente_id requerido')

  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500)

  const result = await env.DB.prepare(
    `SELECT e.*, pr.nombre as prestacion_nombre_cat
     FROM evoluciones e
     LEFT JOIN prestaciones pr ON pr.id = e.prestacion_id
     WHERE e.paciente_id = ?1 AND e.tenant_id = ?2
     ORDER BY e.fecha DESC LIMIT ?3`
  ).bind(pacienteId, user.sub, limit).all()

  return ok(result?.results ?? [])
}

export async function onRequestPost({ request, data, env }) {
  const { user } = data
  if (user.rol === 'recepcionista') return err('No tenés permiso para registrar evoluciones', 403)
  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }
  const { paciente_id, descripcion, tipo, notas } = body
  if (!paciente_id || !descripcion) return err('Paciente y descripción son requeridos')

  // Verificar que el paciente pertenece a este tenant
  const pacienteCheck = await env.DB.prepare(
    `SELECT id FROM pacientes WHERE id = ?1 AND tenant_id = ?2`
  ).bind(paciente_id, user.sub).first()
  if (!pacienteCheck) return err('Paciente no encontrado', 404)

  const evData = {
    id: newId(),
    tenant_id: user.sub,
    ...pick('evoluciones', body),
    tipo: tipo ?? 'consulta',
    ...(notas !== undefined ? { notas } : {}),
    fecha: body.fecha ?? new Date().toISOString(),
  }

  const monto = Number(body.monto) || 0

  if (monto > 0) {
    // Usar batch() para atomicidad: INSERT evolución + UPDATE saldo en una sola transacción
    const keys = Object.keys(evData)
    const placeholders = keys.map((_, i) => `?${i + 1}`).join(', ')
    const stmtInsert = env.DB.prepare(
      `INSERT INTO evoluciones (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`
    ).bind(...Object.values(evData))
    const stmtSaldo = env.DB.prepare(
      `UPDATE pacientes SET saldo = saldo - ?1, updated_at = datetime('now') WHERE id = ?2 AND tenant_id = ?3`
    ).bind(monto, paciente_id, user.sub)
    const [insertResult] = await env.DB.batch([stmtInsert, stmtSaldo])
    return created(insertResult.results?.[0] ?? null)
  }

  const ev = await insert(env.DB, 'evoluciones', evData)
  return created(ev)
}

export async function onRequestPatch({ request, data, env, params }) {
  const { user } = data
  if (user.rol === 'recepcionista') return err('No tenés permiso para editar evoluciones', 403)
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }

  const fields = pick('evoluciones', body)
  if (Object.keys(fields).length === 0) return err('Sin campos para actualizar')

  // Build the evolución UPDATE statement manually so we can batch() it with saldo atomically
  const keys = Object.keys(fields)
  const sets = keys.map((k, i) => `${k} = ?${i + 1}`).join(', ')
  const stmtEv = env.DB.prepare(
    `UPDATE evoluciones SET ${sets}, updated_at = datetime('now') WHERE id = ?${keys.length + 1} AND tenant_id = ?${keys.length + 2} RETURNING *`
  ).bind(...Object.values(fields), id, user.sub)

  // If monto changed, update saldo atomically in the same batch
  if (body.monto !== undefined) {
    const existing = await findOne(env.DB, 'evoluciones', { where: { id, tenant_id: user.sub } })
    if (!existing) return notFound('Evolución')
    const diff = (Number(body.monto) || 0) - (Number(existing.monto) || 0)
    if (diff !== 0) {
      const stmtSaldo = env.DB.prepare(
        `UPDATE pacientes SET saldo = saldo - ?1, updated_at = datetime('now') WHERE id = ?2 AND tenant_id = ?3`
      ).bind(diff, existing.paciente_id, user.sub)
      const [, evResult] = await env.DB.batch([stmtSaldo, stmtEv])
      const updated = evResult.results?.[0] ?? null
      if (!updated) return notFound('Evolución')
      return ok(updated)
    }
  }

  const updated = await stmtEv.first()
  if (!updated) return notFound('Evolución')
  return ok(updated)
}

export async function onRequestDelete({ data, env, params }) {
  const { user } = data
  if (user.rol === 'recepcionista') return err('No tenés permiso para eliminar evoluciones', 403)
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  const existing = await findOne(env.DB, 'evoluciones', { where: { id, tenant_id: user.sub } })
  if (!existing) return notFound('Evolución')

  // Usar batch() para atomicidad: DELETE evolución + revertir saldo en una sola transacción
  const stmtDelete = env.DB.prepare(
    `DELETE FROM evoluciones WHERE id = ?1 AND tenant_id = ?2`
  ).bind(id, user.sub)

  if (existing.monto && Number(existing.monto) > 0) {
    const stmtSaldo = env.DB.prepare(
      `UPDATE pacientes SET saldo = saldo + ?1, updated_at = datetime('now') WHERE id = ?2 AND tenant_id = ?3`
    ).bind(Number(existing.monto), existing.paciente_id, user.sub)
    await env.DB.batch([stmtDelete, stmtSaldo])
  } else {
    await stmtDelete.run()
  }

  return ok({ deleted: id })
}
