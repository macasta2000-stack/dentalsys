// ============================================================
// GET /api/suscripcion — Portal de suscripción del cliente
// Devuelve plan activo, próximo vencimiento, historial de pagos
// ============================================================
import { ok, err, forbidden, cors } from '../../_lib/response.js'

export async function onRequestOptions() { return cors() }

// Billing and subscription info is restricted to tenant owners and superadmin
const CAN_VIEW_SUSCRIPCION = new Set(['tenant', 'superadmin'])

export async function onRequestGet({ data, env }) {
  const { user } = data

  if (!CAN_VIEW_SUSCRIPCION.has(user.rol)) {
    return forbidden('No tenés permisos para acceder a la información de suscripción')
  }

  // Suscripción activa
  const sub = await env.DB.prepare(
    `SELECT ts.*, sp.nombre as plan_nombre, sp.descripcion as plan_descripcion,
            sp.precio_mensual, sp.precio_anual, sp.features, sp.max_pacientes, sp.max_colaboradores
     FROM tenant_subscriptions ts
     LEFT JOIN subscription_plans sp ON sp.id = ts.plan_id
     WHERE ts.tenant_id = ?1`
  ).bind(user.sub).first()

  // Todos los planes disponibles
  const { results: planes } = await env.DB.prepare(
    `SELECT * FROM subscription_plans WHERE activo = 1 ORDER BY orden ASC`
  ).bind().all()

  // Últimas 10 transacciones
  const { results: transacciones } = await env.DB.prepare(
    `SELECT pt.*, sp.nombre as plan_nombre
     FROM payment_transactions pt
     LEFT JOIN subscription_plans sp ON sp.id = pt.plan_id
     WHERE pt.tenant_id = ?1
     ORDER BY pt.created_at DESC
     LIMIT 10`
  ).bind(user.sub).all()

  // Info del tenant
  const tenant = await env.DB.prepare(
    `SELECT estado, trial_hasta, plan_id FROM usuarios WHERE id = ?1`
  ).bind(user.sub).first()

  return ok({
    suscripcion: sub,
    planes: planes ?? [],
    transacciones: transacciones ?? [],
    tenant,
  })
}
