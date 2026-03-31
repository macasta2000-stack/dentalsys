import { ok, created, err, notFound, cors } from '../../_lib/response.js'
import { findOne, insert, update, newId, pick } from '../../_lib/db.js'
import { sendEmail } from '../../_lib/email.js'

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
  const profesionalId = url.searchParams.get('profesional_id')

  let sql = `
    SELECT t.*,
           p.nombre || ' ' || p.apellido as paciente_nombre,
           p.telefono as paciente_telefono, p.obra_social as paciente_obra_social,
           p.saldo as paciente_saldo,
           CASE WHEN t.sesiones_autorizadas IS NOT NULL THEN (
             SELECT COUNT(*) + 1 FROM turnos t2
             WHERE t2.paciente_id = t.paciente_id
               AND t2.prestacion_id = t.prestacion_id
               AND t2.sesiones_autorizadas IS NOT NULL
               AND t2.estado IN ('completado','presente')
               AND t2.fecha_hora < t.fecha_hora
               AND t2.tenant_id = t.tenant_id
           ) ELSE NULL END as sesion_numero
    FROM turnos t
    LEFT JOIN pacientes p ON p.id = t.paciente_id
    WHERE t.tenant_id = ?1 AND t.estado != 'cancelado'
  `
  const values = [user.sub]
  let idx = 2

  if (from) { sql += ` AND DATE(t.fecha_hora) >= ?${idx++}`; values.push(from) }
  if (to) { sql += ` AND DATE(t.fecha_hora) <= ?${idx++}`; values.push(to) }
  if (pacienteId) { sql += ` AND t.paciente_id = ?${idx++}`; values.push(pacienteId) }

  // Profesional: solo ve sus propios turnos (auto-filtro por seguridad)
  if (user.rol === 'profesional' && user.colab_id) {
    sql += ` AND t.profesional_id = ?${idx++}`
    values.push(user.colab_id)
  } else if (profesionalId) {
    // Tenant/admin filtrando por profesional específico (vista de agenda por profesional)
    sql += ` AND t.profesional_id = ?${idx++}`
    values.push(profesionalId)
  }

  sql += ` ORDER BY t.fecha_hora ASC`
  const result = await env.DB.prepare(sql).bind(...values).all()
  return ok(result?.results ?? [])
}

export async function onRequestPost({ request, data, env }) {
  const { user } = data
  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }
  try {
    if (!body.paciente_id || !body.fecha_hora) return err('Paciente y fecha/hora son requeridos')

    // Verificar que el paciente no está archivado
    const pacienteEstado = await env.DB.prepare(
      `SELECT estado FROM pacientes WHERE id = ?1 AND tenant_id = ?2`
    ).bind(body.paciente_id, user.sub).first()
    if (!pacienteEstado) return err('Paciente no encontrado', 404)
    if (pacienteEstado.estado === 'archivado') return err('No se pueden crear turnos para pacientes archivados')

    // Validate fecha_hora
    if (body.fecha_hora) {
      const d = new Date(body.fecha_hora)
      if (isNaN(d.getTime())) return err('Fecha/hora inválida')
      // Also validate hour is 0-23
      const hora = body.fecha_hora.split('T')[1]?.split(':')[0]
      if (hora && (parseInt(hora) > 23)) return err('Hora inválida (debe ser 00-23)')
    }

    // Validar horario de atención
    const horarioErr = await validarHorario(env.DB, user.sub, body.fecha_hora, null)
    if (horarioErr) return err(horarioErr)

    const picked = pick('turnos', body)
    // FK fields must be null (not empty string) to avoid constraint errors
    if (!picked.profesional_id) delete picked.profesional_id
    if (!picked.prestacion_id) delete picked.prestacion_id
    if (picked.sesiones_autorizadas === '' || picked.sesiones_autorizadas === null) delete picked.sesiones_autorizadas
    // Profesional: forzar su propio ID (no puede asignar turno a otro profesional)
    if (user.rol === 'profesional' && user.colab_id) {
      picked.profesional_id = user.colab_id
    }

    // Read duration from body; if not provided, fall back to the tenant's config default
    let duracion = Number(body.duracion_minutos) || Number(body.duracion) || 0
    if (!duracion) {
      const cfg = await env.DB.prepare(
        `SELECT duracion_turno_default FROM configuracion WHERE tenant_id = ?1`
      ).bind(user.sub).first()
      duracion = Number(cfg?.duracion_turno_default) || 60
    }
    if (duracion <= 0 || duracion > 480) return err('La duración debe ser entre 1 y 480 minutos')

    // Verificar que el turno no termine después del horario de cierre
    {
      const cfg = await env.DB.prepare(
        `SELECT horario_fin FROM configuracion WHERE tenant_id = ?1`
      ).bind(user.sub).first()
      if (cfg?.horario_fin) {
        const horaInicio = picked.fecha_hora.split('T')[1]?.slice(0, 5)
        if (horaInicio) {
          const [ih, im] = horaInicio.split(':').map(Number)
          const finMinutos = ih * 60 + im + duracion
          const finHora = String(Math.floor(finMinutos / 60)).padStart(2, '0') + ':' + String(finMinutos % 60).padStart(2, '0')
          if (finHora > cfg.horario_fin) {
            return err(`El turno terminaría a las ${finHora}, fuera del horario de atención (cierre: ${cfg.horario_fin})`)
          }
        }
      }
    }

    // Verificar conflicto de horario por profesional
    if (picked.profesional_id) {
      const conflicto = await env.DB.prepare(`
        SELECT id FROM turnos
        WHERE tenant_id = ?1
          AND profesional_id = ?2
          AND estado NOT IN ('cancelado', 'ausente')
          AND datetime(fecha_hora) < datetime(?3, '+' || ?4 || ' minutes')
          AND datetime(fecha_hora, '+' || duracion_minutos || ' minutes') > datetime(?3)
        LIMIT 1
      `).bind(user.sub, picked.profesional_id, picked.fecha_hora, duracion).first()
      if (conflicto) return err('El profesional ya tiene un turno en ese horario', 409)
    }

    // Verificar conflicto de horario por paciente (evita doble-booking del mismo paciente)
    const conflictoPaciente = await env.DB.prepare(`
      SELECT id FROM turnos
      WHERE tenant_id = ?1
        AND paciente_id = ?2
        AND estado NOT IN ('cancelado', 'ausente')
        AND datetime(fecha_hora) < datetime(?3, '+' || ?4 || ' minutes')
        AND datetime(fecha_hora, '+' || duracion_minutos || ' minutes') > datetime(?3)
      LIMIT 1
    `).bind(user.sub, picked.paciente_id, picked.fecha_hora, duracion).first()
    if (conflictoPaciente) return err('El paciente ya tiene un turno en ese horario', 409)

    const turno = await insert(env.DB, 'turnos', {
      id: newId(),
      tenant_id: user.sub,
      ...picked,
      duracion_minutos: duracion,
    })

    // Enviar email de confirmación al paciente (fire & forget)
    _notificarTurno(env, user.sub, turno, 'turno_confirmacion').catch(() => {})

    return created(turno)
  } catch (e) {
    console.error('turnos POST error:', e?.message ?? e)
    return err('No se pudo crear el turno. Intentá nuevamente.', 500)
  }
}

async function _notificarTurno(env, tenantId, turno, tipo) {
  try {
    const paciente = await env.DB.prepare(
      `SELECT nombre, apellido, email FROM pacientes WHERE id = ?1 AND tenant_id = ?2`
    ).bind(turno.paciente_id, tenantId).first()
    if (!paciente?.email) return

    const config = await env.DB.prepare(
      `SELECT nombre_consultorio, nombre_profesional, direccion FROM configuracion WHERE tenant_id = ?1`
    ).bind(tenantId).first()

    let profesionalNombre = config?.nombre_profesional || null
    if (turno.profesional_id) {
      const prof = await env.DB.prepare(
        `SELECT nombre FROM colaboradores WHERE id = ?1 AND tenant_id = ?2`
      ).bind(turno.profesional_id, tenantId).first()
      if (prof) profesionalNombre = prof.nombre
    }

    let prestacionNombre = null
    if (turno.prestacion_id) {
      const pres = await env.DB.prepare(
        `SELECT nombre FROM prestaciones WHERE id = ?1 AND tenant_id = ?2`
      ).bind(turno.prestacion_id, tenantId).first()
      if (pres) prestacionNombre = pres.nombre
    }

    const fecha = new Date(turno.fecha_hora)
    const fechaStr = fecha.toLocaleString('es-AR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires',
    })

    await sendEmail(env, tipo, {
      tenant_id: tenantId,
      email: paciente.email,
      nombre_paciente: `${paciente.nombre} ${paciente.apellido}`,
      nombre_profesional: profesionalNombre,
      fecha_hora: fechaStr,
      prestacion: prestacionNombre,
      direccion: config?.direccion || null,
      video_link: turno.video_link || null,
    })
  } catch (e) {
    console.warn('[turnos] No se pudo enviar email de notificación:', e?.message)
  }
}

async function validarHorario(DB, tenantId, fechaHora, turnoIdExcluir) {
  // Solo valida si el profesional configuró explícitamente sus horarios
  try {
    const config = await DB.prepare(
      `SELECT horario_inicio, horario_fin, dias_laborales FROM configuracion WHERE tenant_id = ?1`
    ).bind(tenantId).first()
    if (!config) return null

    // Si los días laborales son los valores por defecto, no bloquear
    // (el usuario no personalizó su agenda todavía)
    const diasStr = config.dias_laborales ?? '1,2,3,4,5'
    const diasLaborales = diasStr.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n))

    const dt = new Date(fechaHora)
    const diaSemana = dt.getDay()
    if (diasStr !== '1,2,3,4,5' && !diasLaborales.includes(diaSemana)) {
      const nombres = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
      return `El ${nombres[diaSemana]} no es un día laboral configurado para este consultorio.`
    }

    // Validar horario de inicio/fin
    if (config.horario_inicio && config.horario_fin) {
      const horaStr = fechaHora.split('T')[1]?.slice(0, 5) // "HH:mm"
      if (horaStr && (horaStr < config.horario_inicio || horaStr >= config.horario_fin)) {
        return `El turno está fuera del horario de atención (${config.horario_inicio}–${config.horario_fin})`
      }
    }

    return null
  } catch { return null }
}

export async function onRequestPatch({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }
  // Normalize 'atendido' → 'completado' (schema CHECK does not include 'atendido')
  if (body.estado === 'atendido') body.estado = 'completado'

  // Si se reagenda (cambia fecha_hora), validar horario laboral
  if (body.fecha_hora) {
    const horarioErr = await validarHorario(env.DB, user.sub, body.fecha_hora, id)
    if (horarioErr) return err(horarioErr)
  }

  const picked = pick('turnos', body)
  if ('profesional_id' in picked && !picked.profesional_id) picked.profesional_id = null
  if ('prestacion_id' in picked && !picked.prestacion_id) picked.prestacion_id = null
  if ('sesiones_autorizadas' in picked && picked.sesiones_autorizadas === '') picked.sesiones_autorizadas = null
  const updated = await update(env.DB, 'turnos', id, picked, user.sub)
  if (!updated) return notFound('Turno')

  // Trigger automático: crear encuesta de satisfacción al completar turno
  if (picked.estado === 'completado' && updated.paciente_id) {
    _crearEncuesta(env.DB, user.sub, updated).catch(() => {})
  }

  return ok(updated)
}

async function _crearEncuesta(DB, tenantId, turno) {
  try {
    // Solo si el paciente tiene email
    const paciente = await DB.prepare(
      `SELECT id, email FROM pacientes WHERE id = ?1 AND tenant_id = ?2`
    ).bind(turno.paciente_id, tenantId).first()
    if (!paciente?.email) return

    // No duplicar si ya existe encuesta para este turno
    const existente = await DB.prepare(
      `SELECT id FROM encuestas WHERE turno_id = ?1`
    ).bind(turno.id).first()
    if (existente) return

    const token = crypto.randomUUID().replace(/-/g, '')
    await DB.prepare(`
      INSERT INTO encuestas (id, tenant_id, turno_id, paciente_id, token)
      VALUES (?1, ?2, ?3, ?4, ?5)
    `).bind(crypto.randomUUID(), tenantId, turno.id, turno.paciente_id, token).run()
  } catch (e) {
    console.error('[encuestas] Error al crear encuesta post-turno:', e?.message)
  }
}

export async function onRequestDelete({ data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  const updated = await update(env.DB, 'turnos', id, { estado: 'cancelado' }, user.sub)
  if (!updated) return notFound('Turno')
  _notificarTurno(env, user.sub, updated, 'turno_cancelacion').catch(() => {})
  return ok({ mensaje: 'Turno cancelado' })
}
