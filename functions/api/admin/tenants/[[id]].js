// ============================================================
// ADMIN — Gestión de tenants (clientes del sistema)
// Solo accesible por usuarios con rol = 'superadmin'
// ============================================================
import { ok, created, err, notFound, forbidden, cors } from '../../../_lib/response.js'
import { findOne, newId } from '../../../_lib/db.js'
import { hashPassword } from '../../../_lib/auth.js'
import { PRESTACIONES_DEFAULT } from '../../../_lib/preset.js'

export async function onRequestOptions() { return cors() }

// ── Verificar que el usuario es superadmin ────────────────
function requireAdmin(user) {
  if (user?.rol !== 'superadmin') return forbidden('Acceso denegado')
  return null
}

// ── GET /api/admin/tenants → lista todos los clientes ────
// ── GET /api/admin/tenants/:id → detalle de un cliente ──
export async function onRequestGet({ data, env, params }) {
  const { user } = data
  const deny = requireAdmin(user)
  if (deny) return deny

  const id = params?.id?.[0]

  if (id) {
    // Detalle de un tenant
    const tenant = await env.DB.prepare(
      `SELECT u.id, u.email, u.nombre, u.rol, u.estado, u.trial_hasta, u.notas,
              u.created_at, u.last_login_at,
              c.nombre_consultorio, c.nombre_profesional, c.telefono, c.ciudad,
              c.features_override,
              (SELECT COUNT(*) FROM pacientes WHERE tenant_id = u.id AND estado != 'archivado') as total_pacientes,
              (SELECT COUNT(*) FROM turnos WHERE tenant_id = u.id AND estado != 'cancelado') as total_turnos,
              (SELECT COUNT(*) FROM turnos
                 WHERE tenant_id = u.id AND estado != 'cancelado'
                 AND fecha_hora >= datetime('now', '-30 days')) as turnos_ultimo_mes,
              (SELECT MAX(fecha_hora) FROM turnos WHERE tenant_id = u.id) as ultimo_turno_fecha,
              (SELECT COUNT(*) FROM colaboradores WHERE tenant_id = u.id AND activo = 1 AND rol = 'profesional') as total_profesionales,
              (SELECT sp.nombre FROM tenant_subscriptions ts
                 JOIN subscription_plans sp ON ts.plan_id = sp.id
                 WHERE ts.tenant_id = u.id AND ts.estado = 'activo'
                 ORDER BY ts.created_at DESC LIMIT 1) as plan_nombre,
              (SELECT ts.fecha_fin FROM tenant_subscriptions ts
                 WHERE ts.tenant_id = u.id AND ts.estado = 'activo'
                 ORDER BY ts.created_at DESC LIMIT 1) as plan_vencimiento
       FROM usuarios u
       LEFT JOIN configuracion c ON c.tenant_id = u.id
       WHERE u.id = ?1 AND u.rol = 'tenant'`
    ).bind(id).first()
    if (!tenant) return notFound('Cliente')
    return ok(tenant)
  }

  // Lista todos los tenants con stats enriquecidos
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.email, u.nombre, u.rol, u.estado, u.trial_hasta, u.notas,
            u.created_at, u.last_login_at,
            c.nombre_consultorio, c.nombre_profesional, c.telefono, c.ciudad,
            c.features_override,
            (SELECT COUNT(*) FROM pacientes WHERE tenant_id = u.id AND estado != 'archivado') as total_pacientes,
            (SELECT COUNT(*) FROM turnos WHERE tenant_id = u.id AND estado != 'cancelado') as total_turnos,
            (SELECT COUNT(*) FROM turnos
               WHERE tenant_id = u.id AND estado != 'cancelado'
               AND fecha_hora >= datetime('now', '-30 days')) as turnos_ultimo_mes,
            (SELECT MAX(fecha_hora) FROM turnos WHERE tenant_id = u.id) as ultimo_turno_fecha,
            (SELECT COUNT(*) FROM colaboradores WHERE tenant_id = u.id AND activo = 1 AND rol = 'profesional') as total_profesionales,
            (SELECT sp.nombre FROM tenant_subscriptions ts
               JOIN subscription_plans sp ON ts.plan_id = sp.id
               WHERE ts.tenant_id = u.id AND ts.estado = 'activo'
               ORDER BY ts.created_at DESC LIMIT 1) as plan_nombre,
            (SELECT ts.fecha_fin FROM tenant_subscriptions ts
               WHERE ts.tenant_id = u.id AND ts.estado = 'activo'
               ORDER BY ts.created_at DESC LIMIT 1) as plan_vencimiento
     FROM usuarios u
     LEFT JOIN configuracion c ON c.tenant_id = u.id
     WHERE u.rol = 'tenant'
     ORDER BY u.last_login_at IS NULL ASC, u.last_login_at DESC`
  ).bind().all()

  // Stats globales
  const stats = await env.DB.prepare(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN estado = 'activo' THEN 1 ELSE 0 END) as activos,
       SUM(CASE WHEN estado = 'trial' THEN 1 ELSE 0 END) as en_trial,
       SUM(CASE WHEN estado = 'suspendido' THEN 1 ELSE 0 END) as suspendidos
     FROM usuarios WHERE rol = 'tenant'`
  ).bind().first()

  return ok({ tenants: results ?? [], stats })
}

// ── POST /api/admin/tenants → crear nuevo cliente ────────
export async function onRequestPost({ request, data, env }) {
  const { user } = data
  const deny = requireAdmin(user)
  if (deny) return deny

  try {
    const body = await request.json()
    const { email, password, nombre, nombre_consultorio, estado = 'activo', trial_dias, notas } = body

    if (!email || !password) return err('Email y contraseña son requeridos')
    if (password.length < 8) return err('La contraseña debe tener al menos 8 caracteres')

    // Verificar email único
    const existing = await findOne(env.DB, 'usuarios', { where: { email: email.toLowerCase() } })
    if (existing) return err('El email ya está registrado')

    const userId = newId()
    const passwordHash = await hashPassword(password)

    // Calcular trial_hasta si se especificó
    let trial_hasta = null
    if (estado === 'trial' && trial_dias) {
      const fecha = new Date()
      fecha.setDate(fecha.getDate() + Number(trial_dias))
      trial_hasta = fecha.toISOString().split('T')[0]
    }

    // Crear usuario
    await env.DB.prepare(
      `INSERT INTO usuarios (id, email, password_hash, nombre, rol, estado, trial_hasta, notas, created_at)
       VALUES (?1, ?2, ?3, ?4, 'tenant', ?5, ?6, ?7, datetime('now'))`
    ).bind(userId, email.toLowerCase(), passwordHash, nombre ?? null, estado, trial_hasta, notas ?? null).run()

    // Provisionar configuración
    await env.DB.prepare(
      `INSERT INTO configuracion (id, tenant_id, nombre_consultorio)
       VALUES (?1, ?2, ?3)`
    ).bind(newId(), userId, nombre_consultorio ?? `Consultorio de ${nombre ?? email}`).run()

    // Provisionar 34 prestaciones default
    const stmt = env.DB.prepare(
      `INSERT INTO prestaciones (id, tenant_id, codigo, nombre, precio, duracion_minutos, categoria, activo)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)`
    )
    const batch = PRESTACIONES_DEFAULT.map(p =>
      stmt.bind(newId(), userId, p.codigo, p.nombre, p.precio, p.duracion_minutos, p.categoria)
    )
    await env.DB.batch(batch)

    return created({
      id: userId,
      email: email.toLowerCase(),
      nombre: nombre ?? null,
      estado,
      trial_hasta,
      mensaje: 'Cliente creado y cuenta provisionada correctamente',
    })
  } catch (e) {
    console.error('Admin create tenant error:', e?.message ?? e)
    return err('No se pudo crear el cliente', 500)
  }
}

// ── PATCH /api/admin/tenants/:id → actualizar estado ────
export async function onRequestPatch({ request, data, env, params }) {
  const { user } = data
  const deny = requireAdmin(user)
  if (deny) return deny

  const id = params?.id?.[0]
  if (!id) return err('ID requerido')

  try {
    const body = await request.json()
    const { estado, notas, nombre, trial_hasta, password, features_override, plan_id, ciclo } = body

    // Activar plan para el tenant (cancela suscripciones previas y crea una nueva)
    if (plan_id) {
      const cicloValue = ciclo ?? 'mensual'
      const fechaInicio = new Date().toISOString().split('T')[0]
      const meses = cicloValue === 'anual' ? 12 : 1
      const fechaFin = new Date(new Date().setMonth(new Date().getMonth() + meses)).toISOString().split('T')[0]
      await env.DB.batch([
        env.DB.prepare(`UPDATE tenant_subscriptions SET estado = 'cancelado' WHERE tenant_id = ?1 AND estado = 'activo'`).bind(id),
        env.DB.prepare(
          `INSERT INTO tenant_subscriptions (id, tenant_id, plan_id, ciclo, estado, fecha_inicio, fecha_fin, created_at)
           VALUES (?1, ?2, ?3, ?4, 'activo', ?5, ?6, datetime('now'))`
        ).bind(newId(), id, plan_id, cicloValue, fechaInicio, fechaFin),
        env.DB.prepare(`UPDATE usuarios SET estado = 'activo', updated_at = datetime('now') WHERE id = ?1 AND rol = 'tenant'`).bind(id),
      ])
      const updated = await env.DB.prepare(
        `SELECT u.id, u.email, u.nombre, u.estado, u.trial_hasta, u.notas, c.nombre_consultorio, c.features_override,
                sp.nombre as plan_nombre, ts.fecha_fin as plan_vencimiento
         FROM usuarios u
         LEFT JOIN configuracion c ON c.tenant_id = u.id
         LEFT JOIN tenant_subscriptions ts ON ts.tenant_id = u.id AND ts.estado = 'activo'
         LEFT JOIN subscription_plans sp ON sp.id = ts.plan_id
         WHERE u.id = ?1
         ORDER BY ts.created_at DESC LIMIT 1`
      ).bind(id).first()
      return ok(updated)
    }

    // Actualizar features_override en configuracion (tabla separada)
    if (features_override !== undefined) {
      await env.DB.prepare(
        `UPDATE configuracion SET features_override = ?1, updated_at = datetime('now') WHERE tenant_id = ?2`
      ).bind(features_override !== null ? JSON.stringify(features_override) : null, id).run()
    }

    // Construir campos a actualizar en usuarios
    const sets = []
    const values = []
    let idx = 1

    if (estado !== undefined) { sets.push(`estado = ?${idx++}`); values.push(estado) }
    if (notas !== undefined) { sets.push(`notas = ?${idx++}`); values.push(notas) }
    if (nombre !== undefined) { sets.push(`nombre = ?${idx++}`); values.push(nombre) }
    if (trial_hasta !== undefined) { sets.push(`trial_hasta = ?${idx++}`); values.push(trial_hasta) }
    if (password) {
      if (password.length < 8) return err('La contraseña debe tener al menos 8 caracteres')
      const hash = await hashPassword(password)
      sets.push(`password_hash = ?${idx++}`)
      values.push(hash)
    }

    if (sets.length === 0 && features_override === undefined) return err('No hay campos para actualizar')
    if (sets.length === 0) {
      const updated = await env.DB.prepare(
        `SELECT u.id, u.email, u.nombre, u.estado, u.trial_hasta, u.notas, c.nombre_consultorio, c.features_override
         FROM usuarios u LEFT JOIN configuracion c ON c.tenant_id = u.id
         WHERE u.id = ?1`
      ).bind(id).first()
      return ok(updated)
    }

    sets.push(`updated_at = datetime('now')`)
    values.push(id) // para el WHERE

    await env.DB.prepare(
      `UPDATE usuarios SET ${sets.join(', ')} WHERE id = ?${idx} AND rol = 'tenant'`
    ).bind(...values).run()

    const updated = await env.DB.prepare(
      `SELECT u.id, u.email, u.nombre, u.estado, u.trial_hasta, u.notas, c.nombre_consultorio, c.features_override
       FROM usuarios u LEFT JOIN configuracion c ON c.tenant_id = u.id
       WHERE u.id = ?1`
    ).bind(id).first()

    return ok(updated)
  } catch (e) {
    console.error('Admin update tenant error:', e?.message ?? e)
    return err('No se pudo actualizar el cliente', 500)
  }
}

// ── DELETE /api/admin/tenants/:id → eliminar cliente ────
// CUIDADO: Elimina todos los datos del tenant (irreversible)
export async function onRequestDelete({ data, env, params }) {
  const { user } = data
  const deny = requireAdmin(user)
  if (deny) return deny

  const id = params?.id?.[0]
  if (!id) return err('ID requerido')

  // No permitir eliminarse a sí mismo
  if (id === user.sub) return err('No podés eliminarte a vos mismo')

  try {
    // Eliminar todos los datos del tenant en orden (respetar FKs)
    const tablas = [
      'cuotas_pago', 'planes_pago', 'movimientos_insumos', 'insumos',
      'anamnesis', 'recetas', 'odontograma', 'presupuesto_items',
      'presupuestos', 'pagos', 'evoluciones', 'turnos',
      'colaboradores', 'convenios', 'prestaciones',
      'pacientes', 'configuracion', 'notifications', 'bloques_agenda',
    ]
    const batch = tablas.map(tabla =>
      env.DB.prepare(`DELETE FROM ${tabla} WHERE tenant_id = ?1`).bind(id)
    )
    batch.push(env.DB.prepare(`DELETE FROM usuarios WHERE id = ?1 AND rol = 'tenant'`).bind(id))
    await env.DB.batch(batch)

    return ok({ mensaje: 'Cliente y todos sus datos eliminados correctamente' })
  } catch (e) {
    console.error('Admin delete tenant error:', e?.message ?? e)
    return err('No se pudo eliminar el cliente', 500)
  }
}
