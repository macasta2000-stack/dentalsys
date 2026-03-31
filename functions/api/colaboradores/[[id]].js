import { ok, created, err, notFound, forbidden, cors } from '../../_lib/response.js'
import { findOne, insert, update, newId } from '../../_lib/db.js'
import { hashPassword } from '../../_lib/auth.js'

export async function onRequestOptions() { return cors() }

// Roles that can manage (read list / create / update / delete) colaboradores
const CAN_MANAGE = new Set(['tenant', 'superadmin', 'admin'])

// Transforma un registro: nunca expone password_hash, agrega tiene_acceso
function sanitize(c) {
  if (!c) return null
  const { password_hash, ...rest } = c
  return { ...rest, tiene_acceso: !!password_hash }
}

export async function onRequestGet({ data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]

  // A colaborador may only read their own record; never the full list
  if (!CAN_MANAGE.has(user.rol)) {
    if (user.colab_id && id === user.colab_id) {
      // Allowed: reading own profile
      const c = await findOne(env.DB, 'colaboradores', { where: { id, tenant_id: user.sub } })
      if (!c) return notFound('Colaborador')
      return ok(sanitize(c))
    }
    return forbidden('No tenés permisos para acceder a los colaboradores')
  }

  if (id) {
    const c = await findOne(env.DB, 'colaboradores', { where: { id, tenant_id: user.sub } })
    if (!c) return notFound('Colaborador')
    return ok(sanitize(c))
  }

  const result = await env.DB.prepare(
    `SELECT * FROM colaboradores WHERE tenant_id = ?1 ORDER BY apellido ASC, nombre ASC`
  ).bind(user.sub).all()
  return ok((result?.results ?? []).map(sanitize))
}

export async function onRequestPost({ request, data, env }) {
  const { user } = data

  if (!CAN_MANAGE.has(user.rol)) {
    return forbidden('No tenés permisos para crear colaboradores')
  }

  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }
  const { nombre } = body
  if (!nombre) return err('El nombre es requerido')

  const ROLES_VALIDOS = ['profesional', 'recepcionista', 'admin']
  if (body.rol && !ROLES_VALIDOS.includes(body.rol)) return err('Rol no válido')

  // Verificar email único si se proporciona
  if (body.email) {
    const existing = await env.DB.prepare(
      `SELECT id FROM colaboradores WHERE email = ?1 AND tenant_id = ?2`
    ).bind(body.email.toLowerCase(), user.sub).first()
    if (existing) return err('Ya existe un colaborador con ese email')
  }

  const fields = {
    id: newId(),
    tenant_id: user.sub,
    nombre,
    apellido: body.apellido ?? '',
    rol: body.rol ?? 'profesional',
    email: body.email ? body.email.toLowerCase() : '',
    telefono: body.telefono ?? '',
    matricula: body.matricula ?? '',
    duracion_default: body.duracion_default ?? 30,
    firma_digital: body.firma_digital ?? '',
    notas: body.notas ?? '',
    activo: 1,
  }

  // Hash de contraseña si se proporciona
  if (body.password) {
    fields.password_hash = await hashPassword(body.password)
  }

  const c = await insert(env.DB, 'colaboradores', fields)
  return created(sanitize(c))
}

export async function onRequestPatch({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')

  // A colaborador may update only their own profile (limited fields)
  const isSelfUpdate = !CAN_MANAGE.has(user.rol)
  if (isSelfUpdate) {
    if (!(user.colab_id && id === user.colab_id)) {
      return forbidden('No tenés permisos para modificar colaboradores')
    }
  }

  let body
  try { body = await request.json() } catch { return err('Body inválido — se esperaba JSON', 400) }

  const ROLES_VALIDOS = ['profesional', 'recepcionista', 'admin']
  if (body.rol && !ROLES_VALIDOS.includes(body.rol)) return err('Rol no válido')

  // Colaboradores updating themselves cannot change rol, activo, or revoke access
  const allowed = isSelfUpdate
    ? ['nombre', 'apellido', 'email', 'telefono', 'matricula', 'duracion_default', 'firma_digital']
    : ['nombre', 'apellido', 'rol', 'email', 'telefono', 'matricula', 'duracion_default', 'firma_digital', 'notas', 'activo', 'porcentaje_comision']
  const fields = {}
  for (const k of allowed) {
    if (body[k] !== undefined) fields[k] = body[k]
  }
  // Hash de contraseña si se actualiza
  if (body.password) {
    fields.password_hash = await hashPassword(body.password)
  }
  // Revocar acceso: borrar el hash
  if (body.revocar_acceso) {
    fields.password_hash = null
  }
  if (!Object.keys(fields).length) return err('Sin campos a actualizar')

  const c = await update(env.DB, 'colaboradores', id, fields, user.sub)
  if (!c) return notFound('Colaborador')
  return ok(sanitize(c))
}

export async function onRequestDelete({ data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')

  if (!CAN_MANAGE.has(user.rol)) {
    return forbidden('No tenés permisos para eliminar colaboradores')
  }

  const existing = await findOne(env.DB, 'colaboradores', { where: { id, tenant_id: user.sub } })
  if (!existing) return notFound('Colaborador')

  // Verificar que no tenga turnos futuros asignados
  const futurosTurnos = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM turnos WHERE profesional_id = ?1 AND tenant_id = ?2 AND fecha_hora > datetime('now') AND estado NOT IN ('cancelado','ausente')`
  ).bind(id, user.sub).first()
  if (futurosTurnos?.n > 0) {
    return err(`No se puede eliminar: tiene ${futurosTurnos.n} turno(s) futuro(s) asignado(s). Reasigná o cancelá los turnos primero.`, 409)
  }

  // Soft delete: desactivar en vez de borrar (preserva historial)
  await update(env.DB, 'colaboradores', id, { activo: 0 }, user.sub)
  return ok({ ok: true })
}
