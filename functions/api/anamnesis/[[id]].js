import { ok, created, err, notFound, cors } from '../../_lib/response.js'
import { findOne, insert, update, newId } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

export async function onRequestGet({ request, data, env, params }) {
  const { user } = data
  const url = new URL(request.url)
  const pacienteId = url.searchParams.get('paciente_id') ?? params?.id?.[0]
  if (!pacienteId) return err('paciente_id requerido')

  const anamnesis = await findOne(env.DB, 'anamnesis', { where: { paciente_id: pacienteId, tenant_id: user.sub } })
  return ok(anamnesis)
}

export async function onRequestPost({ request, data, env }) {
  const { user } = data
  const body = await request.json()
  const { paciente_id } = body
  if (!paciente_id) return err('paciente_id es requerido')

  // Upsert por paciente_id
  const existing = await findOne(env.DB, 'anamnesis', { where: { paciente_id, tenant_id: user.sub } })

  const fields = {
    motivo_consulta: body.motivo_consulta ?? null,
    enfermedades: typeof body.enfermedades === 'object' ? JSON.stringify(body.enfermedades) : (body.enfermedades ?? '{}'),
    medicacion: Array.isArray(body.medicacion) ? JSON.stringify(body.medicacion) : (body.medicacion ?? '[]'),
    alergias: body.alergias ?? null,
    embarazada: body.embarazada ? 1 : 0,
    fumador: body.fumador ? 1 : 0,
    anticoagulantes: body.anticoagulantes ? 1 : 0,
    ultima_visita_medico: body.ultima_visita_medico ?? null,
    cirugias_previas: body.cirugias_previas ?? null,
    antecedentes_odontologicos: body.antecedentes_odontologicos ?? null,
    firma_fecha: body.firma_fecha ?? null,
  }

  let result
  if (existing) {
    await env.DB.prepare(
      `UPDATE anamnesis SET motivo_consulta=?1, enfermedades=?2, medicacion=?3, alergias=?4,
       embarazada=?5, fumador=?6, anticoagulantes=?7, ultima_visita_medico=?8,
       cirugias_previas=?9, antecedentes_odontologicos=?10, firma_fecha=?11,
       updated_at=datetime('now')
       WHERE paciente_id=?12 AND tenant_id=?13`
    ).bind(
      fields.motivo_consulta, fields.enfermedades, fields.medicacion, fields.alergias,
      fields.embarazada, fields.fumador, fields.anticoagulantes, fields.ultima_visita_medico,
      fields.cirugias_previas, fields.antecedentes_odontologicos, fields.firma_fecha,
      paciente_id, user.sub
    ).run()
    result = await findOne(env.DB, 'anamnesis', { where: { paciente_id, tenant_id: user.sub } })
  } else {
    result = await insert(env.DB, 'anamnesis', {
      id: newId(),
      tenant_id: user.sub,
      paciente_id,
      ...fields,
    })
  }

  return ok(result)
}
