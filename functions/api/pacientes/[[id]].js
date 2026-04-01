import { ok, created, err, notFound, cors } from '../../_lib/response.js'
import { findOne, insert, update, newId, pick } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

export async function onRequestGet({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]

  if (id) {
    // Superadmin puede ver cualquier paciente (multi-tenant admin)
    if (user.rol === 'superadmin') {
      console.log(`[AUDIT] superadmin ${user.sub} accessed patient ${id} at ${new Date().toISOString()}`)
    }
    const where = user.rol === 'superadmin' ? { id } : { id, tenant_id: user.sub }
    const paciente = await findOne(env.DB, 'pacientes', { where })
    if (!paciente) return notFound('Paciente')
    return ok(paciente)
  }

  const url = new URL(request.url)
  const search = url.searchParams.get('q') ?? ''
  const estado = url.searchParams.get('estado') ?? 'activo'

  let sql = `SELECT * FROM pacientes WHERE tenant_id = ?1 AND estado = ?2`
  const values = [user.sub, estado]

  // Limitar búsqueda a 100 chars para evitar queries problemáticas con D1
  const searchClean = search.trim().slice(0, 100)
  if (searchClean) {
    sql += ` AND (
      REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(apellido),'á','a'),'é','e'),'í','i'),'ó','o'),'ú','u')
        LIKE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(?3),'á','a'),'é','e'),'í','i'),'ó','o'),'ú','u')
      OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(nombre),'á','a'),'é','e'),'í','i'),'ó','o'),'ú','u')
        LIKE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(?3),'á','a'),'é','e'),'í','i'),'ó','o'),'ú','u')
      OR dni LIKE ?3
      OR telefono LIKE ?3
      OR telefono_alternativo LIKE ?3
    )`
    values.push(`%${searchClean}%`)
  }

  sql += ` ORDER BY apellido ASC`
  try {
    const result = await env.DB.prepare(sql).bind(...values).all()
    return ok(result?.results ?? [])
  } catch (e) {
    // Si la query falla (payload con chars especiales), devolver lista vacía — nunca 500
    console.error('pacientes GET search error:', e?.message)
    return ok([])
  }
}

export async function onRequestPost({ request, data, env }) {
  const { user } = data
  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }
  try {
    if (!body.nombre || !body.nombre.trim()) return err('El nombre del paciente es requerido')
    if (!body.apellido || !body.apellido.trim()) return err('El apellido del paciente es requerido')
    // Limitar campos de texto largo para evitar 500 por payloads abusivos
    if (body.observaciones && body.observaciones.length > 5000)
      return err('El campo observaciones no puede superar los 5000 caracteres', 400)
    if (body.nombre && body.nombre.length > 100) return err('Nombre demasiado largo', 400)
    if (body.apellido && body.apellido.length > 100) return err('Apellido demasiado largo', 400)

    // Validar DNI duplicado (solo si se ingresó DNI)
    if (body.dni && String(body.dni).trim()) {
      const existing = await env.DB.prepare(
        `SELECT id FROM pacientes WHERE tenant_id = ?1 AND dni = ?2 AND estado != 'archivado' LIMIT 1`
      ).bind(user.sub, String(body.dni).trim()).first()
      if (existing) return err('Ya existe un paciente activo con ese DNI', 400)
    }

    // Filter out empty strings for optional date fields to avoid DB issues
    const picked = pick('pacientes', body)
    if (picked.fecha_nacimiento === '') delete picked.fecha_nacimiento

    // D1 (SQLite) puede fallar con SQLITE_BUSY bajo carga concurrente — retry una vez
    let paciente
    try {
      paciente = await insert(env.DB, 'pacientes', { id: newId(), tenant_id: user.sub, ...picked })
    } catch (e1) {
      if (e1?.message?.includes('SQLITE_BUSY') || e1?.message?.includes('database is locked')) {
        await new Promise(r => setTimeout(r, 150))
        paciente = await insert(env.DB, 'pacientes', { id: newId(), tenant_id: user.sub, ...picked })
      } else {
        throw e1
      }
    }
    return created(paciente)
  } catch (e) {
    console.error('pacientes POST error:', e?.message ?? e)
    return err('No se pudo crear el paciente. Intentá nuevamente.', 500)
  }
}

export async function onRequestPatch({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')

  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }
  const updated = await update(env.DB, 'pacientes', id, pick('pacientes', body), user.sub)
  if (!updated) return notFound('Paciente')
  return ok(updated)
}

export async function onRequestDelete({ data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')

  // Soft delete
  const updated = await update(env.DB, 'pacientes', id, { estado: 'archivado' }, user.sub)
  if (!updated) return notFound('Paciente')
  return ok({ mensaje: 'Paciente archivado' })
}
