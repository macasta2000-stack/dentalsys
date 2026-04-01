import { ok, created, err, notFound, cors } from '../../_lib/response.js'
import { findOne, insert, update, newId } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

export async function onRequestGet({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]

  if (id) {
    const receta = await findOne(env.DB, 'recetas', { where: { id, tenant_id: user.sub } })
    if (!receta) return notFound('Receta')
    try { receta.medicamentos = JSON.parse(receta.medicamentos ?? '[]') } catch { receta.medicamentos = [] }
    return ok(receta)
  }

  const url = new URL(request.url)
  const pacienteId = url.searchParams.get('paciente_id')

  let sql = `
    SELECT r.*, p.nombre || ' ' || p.apellido as paciente_nombre
    FROM recetas r
    LEFT JOIN pacientes p ON p.id = r.paciente_id
    WHERE r.tenant_id = ?1
  `
  const values = [user.sub]
  let idx = 2
  if (pacienteId) { sql += ` AND r.paciente_id = ?${idx++}`; values.push(pacienteId) }
  // Profesional: solo ve sus propias recetas
  if (user.rol === 'profesional' && user.colab_id) {
    sql += ` AND r.profesional_id = ?${idx++}`
    values.push(user.colab_id)
  }
  sql += ` ORDER BY r.fecha DESC`

  const result = await env.DB.prepare(sql).bind(...values).all()
  const rows = (result?.results ?? []).map(r => {
    try { r.medicamentos = JSON.parse(r.medicamentos ?? '[]') } catch { r.medicamentos = [] }
    return r
  })
  return ok(rows)
}

const ROLES_RECETA = new Set(['profesional', 'admin', 'tenant', 'superadmin'])

export async function onRequestPost({ request, data, env }) {
  const { user } = data
  // Role check MUST happen before any async operation to ensure clean 403
  if (!ROLES_RECETA.has(user.rol)) {
    return err('No tenés permiso para crear recetas', 403)
  }
  let body
  try {
    body = await request.json()
  } catch (e) {
    return err('Cuerpo de la solicitud inválido', 400)
  }
  try {
    const { paciente_id, medicamentos = [], indicaciones = '' } = body
    if (!paciente_id) return err('paciente_id es requerido')

    const receta = await insert(env.DB, 'recetas', {
      id: newId(),
      tenant_id: user.sub,
      paciente_id,
      profesional_id: body.profesional_id ?? null,
      fecha: body.fecha ?? new Date().toISOString().split('T')[0],
      medicamentos: JSON.stringify(medicamentos),
      indicaciones,
      profesional_nombre: body.profesional_nombre ?? null,
      profesional_matricula: body.profesional_matricula ?? null,
    })
    receta.medicamentos = medicamentos
    return created(receta)
  } catch (e) {
    console.error('recetas POST error:', e?.message ?? e)
    return err('No se pudo crear la receta.', 500)
  }
}

export async function onRequestPatch({ request, data, env, params }) {
  const { user } = data
  if (!ROLES_RECETA.has(user.rol)) return err('No tenés permiso para editar recetas', 403)
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }

  const allowed = ['fecha', 'medicamentos', 'indicaciones', 'profesional_id', 'profesional_nombre', 'profesional_matricula']
  const clean = {}
  for (const k of allowed) {
    if (k in body) clean[k] = k === 'medicamentos' ? JSON.stringify(body[k]) : body[k]
  }

  const updated = await update(env.DB, 'recetas', id, clean, user.sub)
  if (!updated) return notFound('Receta')
  try { updated.medicamentos = JSON.parse(updated.medicamentos ?? '[]') } catch { updated.medicamentos = [] }
  return ok(updated)
}

export async function onRequestDelete({ data, env, params }) {
  const { user } = data
  if (!ROLES_RECETA.has(user.rol)) return err('No tenés permiso para eliminar recetas', 403)
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  const receta = await findOne(env.DB, 'recetas', { where: { id, tenant_id: user.sub } })
  if (!receta) return notFound('Receta')
  await env.DB.prepare(`DELETE FROM recetas WHERE id = ?1 AND tenant_id = ?2`).bind(id, user.sub).run()
  return ok({ mensaje: 'Receta eliminada' })
}
