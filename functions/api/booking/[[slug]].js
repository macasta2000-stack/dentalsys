import { ok, err, cors, json } from '../../_lib/response.js'
import { newId } from '../../_lib/db.js'

// BOOKING ENDPOINTS — PUBLIC (no auth required)
// Allows patients to request appointments from a public link

export async function onRequestOptions() { return cors() }

export async function onRequestGet({ request, env, params }) {
  const slug = params?.slug?.[0]
  if (!slug) return err('Slug requerido', 400)
  const action = params?.slug?.[1] // 'slots' or undefined

  // Find the clinic by booking_slug
  const config = await env.DB.prepare(
    `SELECT c.*, u.id as tenant_id FROM configuracion c
     JOIN usuarios u ON u.id = c.tenant_id
     WHERE c.booking_slug = ?1 AND c.booking_activo = 1 AND u.estado = 'activo'`
  ).bind(slug).first()

  if (!config) return json({ ok: false, error: 'Consultorio no encontrado o no tiene agendamiento online activo' }, 404)

  // GET /booking/:slug — clinic info
  if (!action) {
    const profesionales = await env.DB.prepare(
      `SELECT id, nombre, apellido, rol FROM colaboradores
       WHERE tenant_id = ?1 AND activo = 1 AND rol = 'profesional'`
    ).bind(config.tenant_id).all()

    const prestaciones = await env.DB.prepare(
      `SELECT id, nombre, precio, duracion_minutos, categoria FROM prestaciones
       WHERE tenant_id = ?1 AND activo = 1 ORDER BY nombre`
    ).bind(config.tenant_id).all()

    return ok({
      nombre_consultorio: config.nombre_consultorio,
      nombre_profesional: config.nombre_profesional,
      direccion: config.direccion,
      ciudad: config.ciudad,
      telefono: config.telefono,
      especialidad: config.especialidad,
      horario_inicio: config.horario_inicio || '08:00',
      horario_fin: config.horario_fin || '20:00',
      dias_laborales: config.dias_laborales || '1,2,3,4,5',
      duracion_turno_default: config.duracion_turno_default || 30,
      profesionales: profesionales?.results ?? [],
      prestaciones: prestaciones?.results ?? [],
    })
  }

  // GET /booking/:slug/slots?fecha=YYYY-MM-DD&profesional_id=X
  if (action === 'slots') {
    const url = new URL(request.url)
    const fecha = url.searchParams.get('fecha')
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return err('Fecha requerida (YYYY-MM-DD)', 400)

    // Validate: no past dates
    const hoy = new Date().toISOString().slice(0, 10)
    if (fecha < hoy) return ok([]) // no slots for past dates

    // Validate: check if the day of week is a working day
    const diasLaborales = (config.dias_laborales || '1,2,3,4,5').split(',').map(Number)
    const diaSemana = new Date(fecha + 'T12:00:00').getDay() // 0=domingo
    // Convert JS day (0=Sun) to ISO (1=Mon..7=Sun) for comparison with config
    const diaISO = diaSemana === 0 ? 7 : diaSemana
    if (!diasLaborales.includes(diaISO)) return ok([]) // non-working day

    const profesionalId = url.searchParams.get('profesional_id')
    const duracion = Number(config.duracion_turno_default) || 30
    const inicio = config.horario_inicio || '08:00'
    const fin = config.horario_fin || '20:00'

    // Get existing appointments for this day
    let turnosSql = `SELECT fecha_hora, duracion_minutos FROM turnos
      WHERE tenant_id = ?1 AND DATE(fecha_hora) = ?2 AND estado NOT IN ('cancelado', 'ausente')`
    const turnosValues = [config.tenant_id, fecha]
    if (profesionalId) {
      turnosSql += ` AND profesional_id = ?3`
      turnosValues.push(profesionalId)
    }

    const turnos = await env.DB.prepare(turnosSql).bind(...turnosValues).all()
    const ocupados = (turnos?.results ?? []).map(t => ({
      start: t.fecha_hora,
      dur: t.duracion_minutos || duracion,
    }))

    // Get pending solicitudes too (avoid double booking)
    let solSql = `SELECT fecha_hora, duracion_minutos FROM solicitudes_turno
      WHERE tenant_id = ?1 AND DATE(fecha_hora) = ?2 AND estado = 'pendiente'`
    const solValues = [config.tenant_id, fecha]
    if (profesionalId) {
      solSql += ` AND profesional_id = ?3`
      solValues.push(profesionalId)
    }
    const solicitudes = await env.DB.prepare(solSql).bind(...solValues).all()
    for (const s of (solicitudes?.results ?? [])) {
      ocupados.push({ start: s.fecha_hora, dur: s.duracion_minutos || duracion })
    }

    // Generate available slots
    const slots = []
    const [hI, mI] = inicio.split(':').map(Number)
    const [hF, mF] = fin.split(':').map(Number)
    const startMin = hI * 60 + mI
    const endMin = hF * 60 + mF

    for (let min = startMin; min + duracion <= endMin; min += duracion) {
      const hh = String(Math.floor(min / 60)).padStart(2, '0')
      const mm = String(min % 60).padStart(2, '0')
      const slotTime = `${fecha}T${hh}:${mm}`

      // Check if slot conflicts with any existing turno
      const conflict = ocupados.some(o => {
        const oStart = o.start
        const oDur = o.dur || duracion
        // Simple time comparison (both are ISO strings)
        const slotEnd = min + duracion
        const oHH = Number(oStart.split('T')[1]?.split(':')[0] ?? 0)
        const oMM = Number(oStart.split('T')[1]?.split(':')[1] ?? 0)
        const oStartMin = oHH * 60 + oMM
        const oEndMin = oStartMin + oDur
        return min < oEndMin && slotEnd > oStartMin
      })

      if (!conflict) {
        slots.push({ fecha_hora: slotTime, hora: `${hh}:${mm}` })
      }
    }

    return ok(slots)
  }

  return err('Accion no reconocida', 400)
}

export async function onRequestPost({ request, env, params }) {
  const slug = params?.slug?.[0]
  if (!slug) return err('Slug requerido', 400)

  // Find clinic
  const config = await env.DB.prepare(
    `SELECT c.*, u.id as tenant_id FROM configuracion c
     JOIN usuarios u ON u.id = c.tenant_id
     WHERE c.booking_slug = ?1 AND c.booking_activo = 1 AND u.estado = 'activo'`
  ).bind(slug).first()

  if (!config) return json({ ok: false, error: 'Consultorio no encontrado' }, 404)

  let body
  try { body = await request.json() } catch { return err('Body invalido', 400) }

  if (!body.nombre?.trim()) return err('El nombre es requerido')
  if (!body.fecha_hora) return err('La fecha y hora son requeridas')
  if (!body.telefono?.trim() && !body.email?.trim()) return err('Telefono o email requerido para contactarte')

  // Validate: no past dates
  const hoy = new Date().toISOString().slice(0, 10)
  const fechaSolicitud = body.fecha_hora.slice(0, 10)
  if (fechaSolicitud < hoy) return err('No se pueden solicitar turnos para fechas pasadas', 400)

  // Validate: working day
  const diasLaborales = (config.dias_laborales || '1,2,3,4,5').split(',').map(Number)
  const diaSemana = new Date(fechaSolicitud + 'T12:00:00').getDay()
  const diaISO = diaSemana === 0 ? 7 : diaSemana
  if (!diasLaborales.includes(diaISO)) return err('El consultorio no atiende ese dia', 400)

  // Rate limit: max 3 solicitudes per phone/email per day
  const identifier = body.telefono?.trim() || body.email?.trim()
  if (identifier) {
    const countSql = `SELECT COUNT(*) as cnt FROM solicitudes_turno
      WHERE tenant_id = ?1 AND DATE(created_at) = ?2 AND (telefono = ?3 OR email = ?3)`
    const countR = await env.DB.prepare(countSql).bind(config.tenant_id, hoy, identifier).first()
    if (countR?.cnt >= 3) return err('Ya tenés solicitudes pendientes. Esperá la confirmación del consultorio.', 429)
  }

  // Limit: max 2 pending solicitudes per patient (phone/email) at any time
  if (identifier) {
    const pendingSql = `SELECT COUNT(*) as cnt FROM solicitudes_turno
      WHERE tenant_id = ?1 AND estado = 'pendiente' AND (telefono = ?2 OR email = ?2)`
    const pendingR = await env.DB.prepare(pendingSql).bind(config.tenant_id, identifier).first()
    if (pendingR?.cnt >= 2) return err('Ya tenés 2 solicitudes pendientes. Esperá que el consultorio las confirme o rechace.', 429)
  }

  // Verify the slot is still available (double-check against turnos + solicitudes)
  const slotFecha = fechaSolicitud
  const slotHH = Number(body.fecha_hora.split('T')[1]?.split(':')[0] ?? 0)
  const slotMM = Number(body.fecha_hora.split('T')[1]?.split(':')[1] ?? 0)
  const slotStart = slotHH * 60 + slotMM
  const duracion = Number(config.duracion_turno_default) || 30
  const slotEnd = slotStart + duracion

  const conflictSql = `
    SELECT fecha_hora, duracion_minutos FROM turnos
    WHERE tenant_id = ?1 AND DATE(fecha_hora) = ?2 AND estado NOT IN ('cancelado','ausente')
    UNION ALL
    SELECT fecha_hora, duracion_minutos FROM solicitudes_turno
    WHERE tenant_id = ?1 AND DATE(fecha_hora) = ?2 AND estado = 'pendiente'`
  const conflicts = await env.DB.prepare(conflictSql).bind(config.tenant_id, slotFecha).all()
  const hasConflict = (conflicts?.results ?? []).some(t => {
    const tHH = Number(t.fecha_hora.split('T')[1]?.split(':')[0] ?? 0)
    const tMM = Number(t.fecha_hora.split('T')[1]?.split(':')[1] ?? 0)
    const tStart = tHH * 60 + tMM
    const tEnd = tStart + (t.duracion_minutos || duracion)
    return slotStart < tEnd && slotEnd > tStart
  })
  if (hasConflict) return err('Ese horario ya no está disponible. Elegí otro.', 409)

  try {
    const solicitud = await env.DB.prepare(`
      INSERT INTO solicitudes_turno (id, tenant_id, nombre, apellido, telefono, email, fecha_hora, duracion_minutos, motivo, profesional_id, estado)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'pendiente')
      RETURNING *
    `).bind(
      newId(), config.tenant_id,
      body.nombre?.trim(), body.apellido?.trim() || null,
      body.telefono?.trim() || null, body.email?.trim() || null,
      body.fecha_hora, Number(config.duracion_turno_default) || 30,
      body.motivo?.trim() || null, body.profesional_id || null,
    ).first()

    return json({ ok: true, data: { id: solicitud?.id, mensaje: 'Solicitud enviada. El consultorio te confirmara por telefono o email.' } }, 201)
  } catch (e) {
    console.error('booking POST error:', e?.message)
    return err('No se pudo enviar la solicitud. Intenta nuevamente.', 500)
  }
}
