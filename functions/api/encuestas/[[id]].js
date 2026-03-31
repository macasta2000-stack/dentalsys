import { ok, created, err, notFound, forbidden, cors } from '../../_lib/response.js'
import { findOne, newId } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

const CAN_VIEW = new Set(['tenant', 'superadmin', 'admin', 'profesional'])

export async function onRequestGet({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]

  if (!CAN_VIEW.has(user.rol)) return forbidden('No tenés permisos para ver encuestas')

  const url = new URL(request.url)

  // Consulta por token público (para paciente que responde)
  const token = url.searchParams.get('token')
  if (token) {
    const enc = await findOne(env.DB, 'encuestas', { where: { token } })
    if (!enc) return notFound('Encuesta')
    // Solo devolver datos mínimos (no exponer tenant_id etc.)
    return ok({ id: enc.id, token: enc.token, respondida: !!enc.respondida, tenant_id: enc.tenant_id })
  }

  if (id) {
    const enc = await findOne(env.DB, 'encuestas', { where: { id, tenant_id: user.sub } })
    if (!enc) return notFound('Encuesta')
    return ok(enc)
  }

  // Resumen NPS del tenant
  const tipo = url.searchParams.get('tipo')
  if (tipo === 'resumen') {
    return await resumenNPS(env.DB, user.sub)
  }

  const result = await env.DB.prepare(`
    SELECT e.*, p.nombre || ' ' || p.apellido as paciente_nombre
    FROM encuestas e
    LEFT JOIN pacientes p ON p.id = e.paciente_id
    WHERE e.tenant_id = ?1 AND e.respondida = 1
    ORDER BY e.respondida_at DESC LIMIT 100
  `).bind(user.sub).all()

  return ok(result?.results ?? [])
}

export async function onRequestPost({ request, data, env }) {
  const { user } = data

  // Crear encuesta (trigger interno post-turno)
  const CAN_CREATE = new Set(['tenant', 'superadmin', 'admin', 'profesional'])
  if (!CAN_CREATE.has(user.rol)) return forbidden('No tenés permisos')

  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }

  const { turno_id, paciente_id } = body
  if (!turno_id && !paciente_id) return err('turno_id o paciente_id requerido')

  // Verificar ownership
  if (turno_id) {
    const turno = await findOne(env.DB, 'turnos', { where: { id: turno_id, tenant_id: user.sub } })
    if (!turno) return err('Turno no encontrado', 404)
  }

  // Generar token único
  const token = generateToken()

  const encData = {
    id: newId(),
    tenant_id: user.sub,
    turno_id: turno_id || null,
    paciente_id: paciente_id || null,
    token,
  }

  const keys = Object.keys(encData)
  const placeholders = keys.map((_, i) => `?${i + 1}`).join(', ')
  const result = await env.DB.prepare(
    `INSERT INTO encuestas (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`
  ).bind(...Object.values(encData)).first()

  return created(result)
}

export async function onRequestPatch({ request, data, env, params }) {
  // Responder encuesta — no requiere auth (paciente usa token público)
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')

  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }

  const { token, nps, comentario } = body
  if (!token) return err('Token requerido')
  if (nps === undefined || nps === null || nps === '') return err('NPS requerido')
  if (Number(nps) < 0 || Number(nps) > 10) return err('NPS debe estar entre 0 y 10')

  const enc = await findOne(env.DB, 'encuestas', { where: { id, token } })
  if (!enc) return notFound('Encuesta')
  if (enc.respondida) return err('Esta encuesta ya fue respondida', 409)

  const updated = await env.DB.prepare(`
    UPDATE encuestas
    SET nps = ?1, comentario = ?2, respondida = 1, respondida_at = datetime('now')
    WHERE id = ?3 AND token = ?4
    RETURNING *
  `).bind(Number(nps), comentario || '', id, token).first()

  return ok(updated)
}

async function resumenNPS(DB, tenantId) {
  const result = await DB.prepare(`
    SELECT
      COUNT(*) as total_enviadas,
      SUM(respondida) as total_respondidas,
      ROUND(AVG(CASE WHEN respondida = 1 THEN nps END), 1) as nps_promedio,
      SUM(CASE WHEN nps >= 9 THEN 1 ELSE 0 END) as promotores,
      SUM(CASE WHEN nps BETWEEN 7 AND 8 THEN 1 ELSE 0 END) as neutrales,
      SUM(CASE WHEN nps <= 6 THEN 1 ELSE 0 END) as detractores
    FROM encuestas WHERE tenant_id = ?1
  `).bind(tenantId).first()

  const { total_enviadas, total_respondidas, nps_promedio, promotores, neutrales, detractores } = result ?? {}
  const respondidas = total_respondidas ?? 0
  const nps_score = respondidas > 0
    ? Math.round(((promotores - detractores) / respondidas) * 100)
    : null

  return ok({
    total_enviadas: total_enviadas ?? 0,
    total_respondidas: respondidas,
    tasa_respuesta: total_enviadas > 0 ? Math.round((respondidas / total_enviadas) * 100) : 0,
    nps_promedio: nps_promedio ?? null,
    nps_score,
    promotores: promotores ?? 0,
    neutrales: neutrales ?? 0,
    detractores: detractores ?? 0,
  })
}

function generateToken() {
  return crypto.randomUUID().replace(/-/g, '')
}
