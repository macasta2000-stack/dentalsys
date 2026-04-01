// ============================================================
// PROVISIONING — Lógica compartida de creación y activación
//                de cuentas de tenants
// ============================================================
import { newId, insert } from './db.js'
import { hashPassword } from './auth.js'
import { PRESTACIONES_DEFAULT } from './preset.js'
import { sendEmail } from './email.js'

/**
 * Crea un nuevo tenant desde cero (registro o admin).
 * Provisiona: usuario, configuración, 34 prestaciones default, suscripción.
 */
export async function createTenant(env, {
  email,
  password,
  nombre,
  nombre_consultorio,
  estado = 'trial',
  trial_dias = 7,
  plan_id = 'plan_starter',
  ciclo = 'mensual',
  notas = null,
  send_welcome = true,
  password_temp = null, // para mostrar en el email
}) {
  email = email.toLowerCase().trim()

  // Verificar email único
  const existing = await env.DB.prepare(
    `SELECT id FROM usuarios WHERE email = ?1`
  ).bind(email).first()
  if (existing) throw new Error('El email ya está registrado')

  const userId = newId()
  const passwordHash = await hashPassword(password)

  // Calcular trial_hasta
  let trial_hasta = null
  if (estado === 'trial' && trial_dias) {
    const fecha = new Date()
    fecha.setDate(fecha.getDate() + Number(trial_dias))
    trial_hasta = fecha.toISOString().split('T')[0]
  }

  // 1. Crear usuario
  await env.DB.prepare(
    `INSERT INTO usuarios (id, email, password_hash, nombre, rol, estado, trial_hasta, plan_id, notas, created_at)
     VALUES (?1, ?2, ?3, ?4, 'tenant', ?5, ?6, ?7, ?8, datetime('now'))`
  ).bind(userId, email, passwordHash, nombre ?? null, estado, trial_hasta, plan_id, notas).run()

  // 2. Provisionar configuración
  await env.DB.prepare(
    `INSERT INTO configuracion (id, tenant_id, nombre_consultorio)
     VALUES (?1, ?2, ?3)`
  ).bind(newId(), userId, nombre_consultorio ?? `Consultorio de ${nombre ?? email}`).run()

  // 3. Provisionar 34 prestaciones default
  const stmt = env.DB.prepare(
    `INSERT INTO prestaciones (id, tenant_id, codigo, nombre, precio, duracion_minutos, categoria, activo)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)`
  )
  const batch = PRESTACIONES_DEFAULT.map(p =>
    stmt.bind(newId(), userId, p.codigo, p.nombre, p.precio, p.duracion_minutos, p.categoria)
  )
  await env.DB.batch(batch)

  // 4. Crear suscripción trial
  const hoy = new Date().toISOString().split('T')[0]
  const fechaFin = trial_hasta || hoy
  const subId = newId()
  await env.DB.prepare(
    `INSERT INTO tenant_subscriptions (id, tenant_id, plan_id, estado, ciclo, fecha_inicio, fecha_fin, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'trial', ?4, ?5, ?6, datetime('now'), datetime('now'))`
  ).bind(subId, userId, plan_id, ciclo, hoy, fechaFin).run()

  // 5. Enviar email de bienvenida
  if (send_welcome) {
    const plan = await env.DB.prepare(
      `SELECT nombre FROM subscription_plans WHERE id = ?1`
    ).bind(plan_id).first().catch(() => null)

    await sendEmail(env, 'welcome', {
      tenant_id: userId,
      email,
      nombre: nombre ?? email,
      password_temp,
      plan_nombre: plan?.nombre,
      trial_hasta,
      login_url: 'https://app.clingest.app',
    })
  }

  return {
    id: userId,
    email,
    nombre: nombre ?? null,
    estado,
    trial_hasta,
    plan_id,
  }
}

/**
 * Activa/renueva la suscripción de un tenant.
 * Usado por el SuperAdmin vía /api/admin/usuarios/:id (activación manual).
 */
export async function activateSubscription(env, {
  tenant_id,
  plan_id,
  ciclo = 'mensual',
  monto,
  tipo = 'manual',
}) {

  const tenant = await env.DB.prepare(
    `SELECT id, email, nombre, estado FROM usuarios WHERE id = ?1`
  ).bind(tenant_id).first()
  if (!tenant) throw new Error('Tenant no encontrado')

  const plan = await env.DB.prepare(
    `SELECT * FROM subscription_plans WHERE id = ?1`
  ).bind(plan_id).first()
  if (!plan) throw new Error('Plan no encontrado')

  // Calcular nueva fecha de fin
  const hoy = new Date()
  const fechaInicio = hoy.toISOString().split('T')[0]
  const meses = ciclo === 'anual' ? 12 : 1
  const fechaFin = new Date(hoy)
  fechaFin.setMonth(fechaFin.getMonth() + meses)
  const fechaFinStr = fechaFin.toISOString().split('T')[0]

  // Obtener o crear suscripción del tenant
  const subExistente = await env.DB.prepare(
    `SELECT id FROM tenant_subscriptions WHERE tenant_id = ?1`
  ).bind(tenant_id).first()

  let subId
  if (subExistente) {
    subId = subExistente.id
    await env.DB.prepare(
      `UPDATE tenant_subscriptions
       SET plan_id = ?1, estado = 'activa', ciclo = ?2, fecha_inicio = ?3, fecha_fin = ?4, updated_at = datetime('now')
       WHERE tenant_id = ?5`
    ).bind(plan_id, ciclo, fechaInicio, fechaFinStr, tenant_id).run()
  } else {
    subId = newId()
    await env.DB.prepare(
      `INSERT INTO tenant_subscriptions (id, tenant_id, plan_id, estado, ciclo, fecha_inicio, fecha_fin, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'activa', ?4, ?5, ?6, datetime('now'), datetime('now'))`
    ).bind(subId, tenant_id, plan_id, ciclo, fechaInicio, fechaFinStr).run()
  }

  // Actualizar usuario
  await env.DB.prepare(
    `UPDATE usuarios SET estado = 'activo', plan_id = ?1, trial_hasta = NULL WHERE id = ?2`
  ).bind(plan_id, tenant_id).run()

  // Registrar transacción (mp_payment_id y mp_preference_id se dejan NULL — activación manual)
  const txId = newId()
  await env.DB.prepare(
    `INSERT INTO payment_transactions (id, tenant_id, subscription_id, mp_payment_id, mp_preference_id, tipo, estado, monto, plan_id, ciclo, created_at, updated_at)
     VALUES (?1, ?2, ?3, NULL, NULL, ?4, 'approved', ?5, ?6, ?7, datetime('now'), datetime('now'))`
  ).bind(txId, tenant_id, subId, tipo, monto ?? 0, plan_id, ciclo).run()

  // Enviar email de confirmación de activación
  await sendEmail(env, 'payment_receipt', {
    tenant_id,
    email: tenant.email,
    nombre: tenant.nombre,
    monto: monto ?? plan.precio_mensual,
    plan_nombre: plan.nombre,
    ciclo,
    fecha_fin: fechaFinStr,
    mp_payment_id: null,
  })

  return { ok: true, already_processed: false, fecha_fin: fechaFinStr }
}

/**
 * Suspende una cuenta por vencimiento o por acción del admin.
 */
export async function suspendTenant(env, tenant_id, motivo = 'vencimiento') {
  const tenant = await env.DB.prepare(
    `SELECT email, nombre FROM usuarios WHERE id = ?1`
  ).bind(tenant_id).first()
  if (!tenant) return

  await env.DB.prepare(
    `UPDATE usuarios SET estado = 'suspendido' WHERE id = ?1`
  ).bind(tenant_id).run()

  await env.DB.prepare(
    `UPDATE tenant_subscriptions SET estado = 'vencida', updated_at = datetime('now') WHERE tenant_id = ?1`
  ).bind(tenant_id).run()

  await sendEmail(env, 'suspension', {
    tenant_id,
    email: tenant.email,
    nombre: tenant.nombre,
  })
}
