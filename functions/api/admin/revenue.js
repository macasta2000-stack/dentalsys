// ============================================================
// GET /api/admin/revenue — Métricas de ingresos para superadmin
// The _middleware.js already enforces superadmin-only for /api/admin/*
// ============================================================

export async function onRequestGet({ data, env }) {
  // Middleware sets data.user and already verified rol === 'superadmin'
  const { user } = data
  if (!user || user.rol !== 'superadmin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const db = env.DB

    // ── Totales por estado ────────────────────────────────
    const { results: estadoRows } = await db.prepare(`
      SELECT estado, COUNT(*) as cantidad FROM usuarios GROUP BY estado
    `).all()

    const estadoMap = {}
    estadoRows.forEach(r => { estadoMap[r.estado] = r.cantidad })

    const total_clientes = estadoRows.reduce((s, r) => s + r.cantidad, 0)
    const activos_pago = estadoMap['activo'] ?? 0
    const en_trial = estadoMap['trial'] ?? 0
    const suspendidos = estadoMap['suspendido'] ?? 0

    // ── Total cobrado (pagos aprobados) ───────────────────
    const { results: totalRows } = await db.prepare(`
      SELECT COALESCE(SUM(monto), 0) as total
      FROM payment_transactions
      WHERE estado = 'approved'
    `).all()
    const total_cobrado = totalRows[0]?.total ?? 0

    // ── MRR: suma de precios según suscripciones activas ─
    // Para ciclo mensual suma precio_mensual, para anual divide precio_anual/12
    const { results: mrrRows } = await db.prepare(`
      SELECT
        ts.ciclo,
        sp.precio_mensual,
        sp.precio_anual,
        COUNT(*) as cantidad
      FROM tenant_subscriptions ts
      JOIN subscription_plans sp ON ts.plan_id = sp.id
      JOIN usuarios u ON ts.tenant_id = u.id
      WHERE u.estado = 'activo' AND ts.estado = 'activo'
      GROUP BY ts.plan_id, ts.ciclo
    `).all()

    let mrr = 0
    mrrRows.forEach(r => {
      if (r.ciclo === 'mensual') mrr += (r.precio_mensual ?? 0) * r.cantidad
      else if (r.ciclo === 'anual') mrr += ((r.precio_anual ?? 0) / 12) * r.cantidad
    })
    const arr = mrr * 12
    const arpu = activos_pago > 0 ? mrr / activos_pago : 0

    // ── Distribución por plan ─────────────────────────────
    const { results: planRows } = await db.prepare(`
      SELECT
        ts.plan_id,
        sp.nombre as plan_nombre,
        sp.precio_mensual,
        sp.precio_anual,
        ts.ciclo,
        COUNT(*) as cantidad
      FROM tenant_subscriptions ts
      JOIN subscription_plans sp ON ts.plan_id = sp.id
      JOIN usuarios u ON ts.tenant_id = u.id
      WHERE u.estado = 'activo' AND ts.estado = 'activo'
      GROUP BY ts.plan_id, ts.ciclo
      ORDER BY sp.precio_mensual DESC
    `).all()

    // Agrupa por plan_id sumando MRR
    const planMap = {}
    planRows.forEach(r => {
      const planMrr = r.ciclo === 'mensual'
        ? (r.precio_mensual ?? 0) * r.cantidad
        : ((r.precio_anual ?? 0) / 12) * r.cantidad
      if (!planMap[r.plan_id]) {
        planMap[r.plan_id] = { plan_id: r.plan_id, plan_nombre: r.plan_nombre, cantidad: 0, mrr_plan: 0 }
      }
      planMap[r.plan_id].cantidad += r.cantidad
      planMap[r.plan_id].mrr_plan += planMrr
    })
    const por_plan = Object.values(planMap)

    // ── Últimas 20 transacciones ──────────────────────────
    const { results: ultimas_transacciones } = await db.prepare(`
      SELECT
        pt.id, pt.monto, pt.estado, pt.plan_id, pt.ciclo, pt.created_at,
        sp.nombre as plan_nombre,
        u.nombre, u.email
      FROM payment_transactions pt
      LEFT JOIN subscription_plans sp ON pt.plan_id = sp.id
      LEFT JOIN usuarios u ON pt.tenant_id = u.id
      ORDER BY pt.created_at DESC
      LIMIT 20
    `).all()

    return Response.json({
      mrr: Math.round(mrr),
      arr: Math.round(arr),
      arpu: Math.round(arpu),
      total_cobrado,
      total_clientes,
      activos_pago,
      en_trial,
      suspendidos,
      por_plan,
      ultimas_transacciones,
    })
  } catch (e) {
    console.error('[admin/revenue] Error:', e?.message)
    return Response.json({ error: 'Error al generar métricas' }, { status: 500 })
  }
}
