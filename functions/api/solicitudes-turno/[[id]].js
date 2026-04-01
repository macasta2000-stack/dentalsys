import { ok, err, notFound, cors } from '../../_lib/response.js'
import { findOne, update, newId, insert, pick } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

export async function onRequestGet({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]

  if (id) {
    const sol = await findOne(env.DB, 'solicitudes_turno', { where: { id, tenant_id: user.sub } })
    if (!sol) return notFound('Solicitud')
    return ok(sol)
  }

  const url = new URL(request.url)
  const estado = url.searchParams.get('estado') || 'pendiente'

  let sql = `SELECT * FROM solicitudes_turno WHERE tenant_id = ?1`
  const values = [user.sub]
  let idx = 2

  if (estado !== 'todas') { sql += ` AND estado = ?${idx++}`; values.push(estado) }
  sql += ` ORDER BY created_at DESC LIMIT 100`

  const result = await env.DB.prepare(sql).bind(...values).all()
  return ok(result?.results ?? [])
}

export async function onRequestPatch({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')

  let body
  try { body = await request.json() } catch { return err('Body invalido', 400) }

  const sol = await findOne(env.DB, 'solicitudes_turno', { where: { id, tenant_id: user.sub } })
  if (!sol) return notFound('Solicitud')

  // Aceptar solicitud → crear turno real
  if (body.estado === 'confirmada' && sol.estado === 'pendiente') {
    try {
      // Buscar o crear el paciente por telefono/email
      let pacienteId = null
      if (sol.telefono) {
        const pac = await env.DB.prepare(
          `SELECT id FROM pacientes WHERE tenant_id = ?1 AND telefono = ?2 LIMIT 1`
        ).bind(user.sub, sol.telefono).first()
        pacienteId = pac?.id
      }
      if (!pacienteId && sol.email) {
        const pac = await env.DB.prepare(
          `SELECT id FROM pacientes WHERE tenant_id = ?1 AND email = ?2 LIMIT 1`
        ).bind(user.sub, sol.email).first()
        pacienteId = pac?.id
      }

      // Si no existe, crear paciente nuevo
      if (!pacienteId) {
        const newPac = await insert(env.DB, 'pacientes', {
          id: newId(), tenant_id: user.sub,
          nombre: sol.nombre, apellido: sol.apellido || '',
          telefono: sol.telefono || '', email: sol.email || '',
          motivo_consulta: sol.motivo || 'Turno online',
        })
        pacienteId = newPac?.id
      }

      // Crear turno
      if (pacienteId) {
        await insert(env.DB, 'turnos', {
          id: newId(), tenant_id: user.sub,
          paciente_id: pacienteId,
          fecha_hora: sol.fecha_hora,
          duracion_minutos: sol.duracion_minutos || 30,
          motivo: sol.motivo || 'Turno online',
          profesional_id: sol.profesional_id || null,
          estado: 'confirmado',
        })
      }

      // Marcar solicitud como confirmada
      const updated = await update(env.DB, 'solicitudes_turno', id, { estado: 'confirmada', notas_internas: body.notas_internas || 'Turno creado automaticamente' }, user.sub)
      return ok(updated)
    } catch (e) {
      console.error('solicitud confirm error:', e?.message)
      return err('Error al confirmar la solicitud', 500)
    }
  }

  // Rechazar
  if (body.estado === 'rechazada') {
    const updated = await update(env.DB, 'solicitudes_turno', id, { estado: 'rechazada', notas_internas: body.notas_internas || '' }, user.sub)
    if (!updated) return notFound('Solicitud')
    return ok(updated)
  }

  return err('Accion no permitida', 400)
}
