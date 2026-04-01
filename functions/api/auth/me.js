import { ok, err, cors } from '../../_lib/response.js'
import { findOne } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

export async function onRequestGet({ data, env }) {
  try {
    const { user } = data

    // ── Colaborador: devolver sus propios datos (no los del dueño) ─────────
    if (user.colab_id) {
      const colab = await env.DB.prepare(
        `SELECT * FROM colaboradores WHERE id = ?1 AND tenant_id = ?2 AND activo = 1`
      ).bind(user.colab_id, user.sub).first()
      if (!colab) return err('Colaborador no encontrado', 404)

      const config = await findOne(env.DB, 'configuracion', { where: { tenant_id: user.sub } })

      return ok({
        user: {
          id: colab.id,
          email: colab.email,
          nombre: [colab.nombre, colab.apellido].filter(Boolean).join(' '),
          rol: colab.rol,
          estado: 'activo',
          trial_hasta: null,
        },
        configuracion: config,
        suscripcion: null,
      })
    }

    // ── Owner: lógica original ────────────────────────────────────────────
    const dbUser = await findOne(env.DB, 'usuarios', {
      where: { id: user.sub },
      select: 'id, email, nombre, rol, estado, trial_hasta, plan_id, created_at'
    })
    if (!dbUser) return err('Usuario no encontrado', 404)

    const config = await findOne(env.DB, 'configuracion', { where: { tenant_id: user.sub } })

    let suscripcion = null
    try {
      const sub = await env.DB.prepare(`
        SELECT ts.*, sp.nombre as plan_nombre, sp.precio_mensual, sp.precio_anual, sp.plan_features
        FROM tenant_subscriptions ts
        JOIN subscription_plans sp ON ts.plan_id = sp.id
        WHERE ts.tenant_id = ?1 AND ts.estado = 'activo'
        ORDER BY ts.created_at DESC LIMIT 1
      `).bind(user.sub).first()

      if (sub) {
        suscripcion = {
          ...sub,
          plan_features: sub.plan_features ? JSON.parse(sub.plan_features) : null,
        }
      }
    } catch (_) { /* sin suscripción */ }

    return ok({ user: dbUser, configuracion: config, suscripcion })
  } catch {
    return err('Error interno', 500)
  }
}
