// ============================================================
// Onboarding API
// GET  /api/onboarding → estado actual del onboarding
// POST /api/onboarding → completar onboarding con respuestas
// ============================================================

import { ok, err, cors } from '../../_lib/response.js'
import { newId } from '../../_lib/db.js'
import { PRESETS } from '../../_lib/prestaciones-presets.js'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function onRequestGet({ data, env }) {
  const { user } = data

  const config = await env.DB.prepare(
    `SELECT onboarding_completado, onboarding_data FROM configuracion WHERE tenant_id = ?1`
  ).bind(user.sub).first()

  let onboardingData = null
  if (config?.onboarding_data) {
    try { onboardingData = JSON.parse(config.onboarding_data) } catch {}
  }

  return ok({
    completado: config?.onboarding_completado === 1,
    data: onboardingData,
  })
}

export async function onRequestPost({ request, data, env }) {
  const { user } = data

  // Solo tenant/admin pueden completar el onboarding
  if (!['tenant', 'superadmin', 'admin'].includes(user.rol)) {
    return err('Sin permisos', 403)
  }

  let body
  try { body = await request.json() } catch { return err('JSON inválido') }

  const {
    especialidad = '',
    num_profesionales = 1,
    obras_sociales = [],
    tipo_cobro = 'prestacion',
    tiene_recepcion = false,
    nombre_consultorio = '',
  } = body

  // Construir el workflow según si tiene recepción
  let workflow_etapas
  if (tiene_recepcion) {
    workflow_etapas = JSON.stringify(['recepcion', 'sala_espera', 'consultorio', 'cobro', 'salida'])
  } else {
    workflow_etapas = JSON.stringify(['consultorio', 'cobro'])
  }

  // Guardar datos del onboarding en configuracion
  await env.DB.prepare(
    `UPDATE configuracion SET
       onboarding_completado = 1,
       onboarding_data = ?1,
       especialidad = ?2,
       workflow_etapas = ?3,
       tipo_cobro = ?4
     WHERE tenant_id = ?5`
  ).bind(
    JSON.stringify({ especialidad, num_profesionales, obras_sociales, tiene_recepcion }),
    especialidad,
    workflow_etapas,
    tipo_cobro,
    user.sub
  ).run()

  // Si proporcionó nombre del consultorio, actualizarlo también
  if (nombre_consultorio) {
    await env.DB.prepare(
      `UPDATE configuracion SET nombre_consultorio = ?1 WHERE tenant_id = ?2 AND (nombre_consultorio IS NULL OR nombre_consultorio = '')`
    ).bind(nombre_consultorio, user.sub).run()
  }

  // Crear convenios iniciales si mencionó obras sociales
  if (Array.isArray(obras_sociales) && obras_sociales.length > 0) {
    for (const os of obras_sociales.slice(0, 10)) {
      if (!os || typeof os !== 'string') continue
      const existe = await env.DB.prepare(
        `SELECT id FROM convenios WHERE tenant_id = ?1 AND nombre_os = ?2`
      ).bind(user.sub, os.trim()).first()

      if (!existe) {
        await env.DB.prepare(
          `INSERT INTO convenios (tenant_id, nombre_os, activo) VALUES (?1, ?2, 1)`
        ).bind(user.sub, os.trim()).run().catch(() => {})
      }
    }
  }

  // Reemplazar prestaciones genéricas con las de la especialidad si existe un preset
  const presetPrestaciones = especialidad ? PRESETS[especialidad] : null
  if (presetPrestaciones?.length) {
    await env.DB.prepare('DELETE FROM prestaciones WHERE tenant_id = ?1').bind(user.sub).run()
    const stmtPreset = env.DB.prepare(
      `INSERT INTO prestaciones (id, tenant_id, nombre, codigo, precio, duracion_minutos, categoria, activo)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)`
    )
    const batchPreset = presetPrestaciones.map(p =>
      stmtPreset.bind(newId(), user.sub, p.nombre, p.codigo ?? '', p.precio ?? 0, p.duracion_minutos ?? 30, p.categoria ?? 'general')
    )
    await env.DB.batch(batchPreset)
  }

  const configActualizada = await env.DB.prepare(
    `SELECT * FROM configuracion WHERE tenant_id = ?1`
  ).bind(user.sub).first()

  return ok({
    completado: true,
    config: configActualizada,
  })
}
