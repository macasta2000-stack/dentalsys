// ============================================================
// /api/video-sessions
// Genera y gestiona salas de videollamada vía Jitsi Meet.
// No requiere cuenta ni servidor propio — usa meet.jit.si.
// ============================================================
import { ok, created, err, notFound, cors } from '../../_lib/response.js'
import { newId } from '../../_lib/db.js'
import { sendEmail } from '../../_lib/email.js'

export async function onRequestOptions() { return cors() }

// POST /api/video-sessions
// Body: { turno_id?, paciente_id?, send_email_paciente? }
// Crea (o reutiliza) una sala para el turno
export async function onRequestPost({ request, data, env }) {
  const { user } = data
  const body = await request.json().catch(() => ({}))
  const { turno_id, paciente_id, send_email_paciente = false } = body

  // Si ya existe una sesión activa para este turno, devolverla
  if (turno_id) {
    const existing = await env.DB.prepare(
      `SELECT * FROM video_sessions WHERE turno_id = ?1 AND tenant_id = ?2 AND estado = 'activa'`
    ).bind(turno_id, user.sub).first()
    if (existing) return ok(existing)
  }

  // Generar nombre de sala único y seguro
  const sessionId = newId()
  const roomName = `clingest-${sessionId.replace(/-/g, '').slice(0, 16)}`
  const baseUrl = 'https://meet.jit.si'
  const linkPaciente = `${baseUrl}/${roomName}`

  const session = {
    id: sessionId,
    tenant_id: user.sub,
    turno_id: turno_id || null,
    paciente_id: paciente_id || null,
    room_name: roomName,
    estado: 'activa',
    link_paciente: linkPaciente,
  }

  await env.DB.prepare(`
    INSERT INTO video_sessions (id, tenant_id, turno_id, paciente_id, room_name, estado, link_paciente, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, 'activa', ?6, datetime('now'))
  `).bind(sessionId, user.sub, session.turno_id, session.paciente_id, roomName, linkPaciente).run()

  // Actualizar video_link en el turno si aplica
  if (turno_id) {
    await env.DB.prepare(
      `UPDATE turnos SET video_link = ?1 WHERE id = ?2 AND tenant_id = ?3`
    ).bind(linkPaciente, turno_id, user.sub).run().catch(() => {})
  }

  // Enviar link al paciente por email si se solicita
  if (send_email_paciente && paciente_id) {
    try {
      const paciente = await env.DB.prepare(
        `SELECT nombre, apellido, email FROM pacientes WHERE id = ?1 AND tenant_id = ?2`
      ).bind(paciente_id, user.sub).first()

      if (paciente?.email) {
        let fechaStr = 'próximamente'
        if (turno_id) {
          const turno = await env.DB.prepare(`SELECT fecha_hora FROM turnos WHERE id = ?1 AND tenant_id = ?2`).bind(turno_id, user.sub).first()
          if (turno?.fecha_hora) {
            const fecha = new Date(turno.fecha_hora)
            fechaStr = fecha.toLocaleString('es-AR', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
              hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires',
            })
          }
        }
        const config = await env.DB.prepare(
          `SELECT nombre_profesional FROM configuracion WHERE tenant_id = ?1`
        ).bind(user.sub).first()

        await sendEmail(env, 'turno_recordatorio', {
          tenant_id: user.sub,
          email: paciente.email,
          nombre_paciente: `${paciente.nombre} ${paciente.apellido}`,
          nombre_profesional: config?.nombre_profesional || null,
          fecha_hora: fechaStr,
          video_link: linkPaciente,
        })
      }
    } catch (e) {
      console.warn('[video-sessions] No se pudo enviar email:', e?.message)
    }
  }

  return created(session)
}

// GET /api/video-sessions/:id  — obtener sesión
// GET /api/video-sessions?turno_id=xxx  — buscar por turno
export async function onRequestGet({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]

  if (id) {
    const session = await env.DB.prepare(
      `SELECT * FROM video_sessions WHERE id = ?1 AND tenant_id = ?2`
    ).bind(id, user.sub).first()
    if (!session) return notFound('Sesión de video')
    return ok(session)
  }

  const url = new URL(request.url)
  const turnoId = url.searchParams.get('turno_id')
  if (turnoId) {
    const session = await env.DB.prepare(
      `SELECT * FROM video_sessions WHERE turno_id = ?1 AND tenant_id = ?2 ORDER BY created_at DESC LIMIT 1`
    ).bind(turnoId, user.sub).first()
    return ok(session || null)
  }

  const all = await env.DB.prepare(
    `SELECT * FROM video_sessions WHERE tenant_id = ?1 ORDER BY created_at DESC LIMIT 50`
  ).bind(user.sub).all()
  return ok(all?.results ?? [])
}

// PATCH /api/video-sessions/:id — finalizar sesión
export async function onRequestPatch({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  const body = await request.json().catch(() => ({}))
  const estado = body.estado || 'finalizada'
  await env.DB.prepare(
    `UPDATE video_sessions SET estado = ?1, finalizada_at = datetime('now') WHERE id = ?2 AND tenant_id = ?3`
  ).bind(estado, id, user.sub).run()
  const updated = await env.DB.prepare(
    `SELECT * FROM video_sessions WHERE id = ?1 AND tenant_id = ?2`
  ).bind(id, user.sub).first()
  return ok(updated)
}
