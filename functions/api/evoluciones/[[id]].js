import { ok, created, err, notFound, cors } from '../../_lib/response.js'
import { findOne, insert, update, newId, pick } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

export async function onRequestGet({ request, data, env, params }) {
  const { user } = data
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

  const result = await env.DB.prepare(
    `SELECT e.*, pr.nombre as prestacion_nombre_cat
     FROM evoluciones e
     LEFT JOIN prestaciones pr ON pr.id = e.prestacion_id
     WHERE e.paciente_id = ?1 AND e.tenant_id = ?2
     ORDER BY e.fecha DESC LIMIT 100`
  ).bind(pacienteId, user.sub).all()

  return ok(result?.results ?? [])
}

export async function onRequestPost({ request, data, env }) {
  const { user } = data
  const body = await request.json()
  const { paciente_id, descripcion } = body
  if (!paciente_id || !descripcion) return err('Paciente y descripción son requeridos')

  const ev = await insert(env.DB, 'evoluciones', {
    id: newId(),
    tenant_id: user.sub,
    ...pick('evoluciones', body),
    fecha: body.fecha ?? new Date().toISOString(),
  })

  return created(ev)
}

export async function onRequestPatch({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  const body = await request.json()
  const updated = await update(env.DB, 'evoluciones', id, pick('evoluciones', body), user.sub)
  if (!updated) return notFound('Evolución')
  return ok(updated)
}
