// POST /api/onboarding/preset
// Carga un preset de prestaciones por especialidad para el tenant actual.
// Reemplaza todas las prestaciones existentes con las del preset seleccionado.

import { ok, err, cors } from '../../_lib/response.js'
import { newId } from '../../_lib/db.js'
import { PRESETS } from '../../_lib/prestaciones-presets.js'

export async function onRequestOptions() { return cors() }

export async function onRequestPost({ request, data, env }) {
  const { user } = data
  const tenantId = user.sub

  let body
  try {
    body = await request.json()
  } catch {
    return err('Body inválido')
  }

  const { especialidad } = body
  if (!especialidad) return err('Especialidad requerida')

  const preset = PRESETS[especialidad]
  if (!preset) return err('Especialidad no encontrada. Verificá la clave enviada.')

  // Eliminar prestaciones existentes e insertar las del preset en batch atómico
  const stmtDelete = env.DB.prepare('DELETE FROM prestaciones WHERE tenant_id = ?1').bind(tenantId)
  const stmtInsert = env.DB.prepare(
    `INSERT INTO prestaciones (id, tenant_id, nombre, codigo, precio, duracion_minutos, categoria, activo)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)`
  )
  const insertStmts = preset.map(p =>
    stmtInsert.bind(newId(), tenantId, p.nombre, p.codigo ?? '', p.precio ?? 0, p.duracion_minutos ?? 30, p.categoria ?? 'general')
  )
  await env.DB.batch([stmtDelete, ...insertStmts])

  return ok({ ok: true, loaded: preset.length, especialidad })
}
