import { ok, created, err, notFound, cors } from '../../_lib/response.js'
import { findMany, findOne, insert, update, newId } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

export async function onRequestGet({ request, data, env, params }) {
  const { user } = data
  const url = new URL(request.url)
  const pacienteId = url.searchParams.get('paciente_id') ?? params?.id?.[0]
  if (!pacienteId) return err('paciente_id requerido')

  const piezas = await findMany(env.DB, 'odontograma', {
    where: { paciente_id: pacienteId, tenant_id: user.sub }
  })
  return ok(piezas)
}

export async function onRequestPost({ request, data, env }) {
  const { user } = data
  const body = await request.json()
  const { paciente_id, numero_pieza, estado } = body
  if (!paciente_id || !numero_pieza) return err('paciente_id y numero_pieza requeridos')

  // Upsert por paciente_id + numero_pieza (con tenant_id para seguridad)
  const existing = await env.DB.prepare(
    `SELECT id FROM odontograma WHERE paciente_id = ?1 AND numero_pieza = ?2 AND tenant_id = ?3`
  ).bind(paciente_id, numero_pieza, user.sub).first()

  let result
  if (existing) {
    result = await update(env.DB, 'odontograma', existing.id, {
      estado: estado ?? 'sano',
      caras_afectadas: body.caras_afectadas ?? '[]',
      notas: body.notas ?? null,
    }, user.sub)
  } else {
    result = await insert(env.DB, 'odontograma', {
      id: newId(),
      tenant_id: user.sub,
      paciente_id,
      numero_pieza,
      estado: estado ?? 'sano',
      caras_afectadas: body.caras_afectadas ?? '[]',
      notas: body.notas ?? null,
    })
  }

  return ok(result)
}
