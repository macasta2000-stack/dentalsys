import { ok, err, forbidden, cors } from '../../_lib/response.js'

export async function onRequestOptions() { return cors() }

// Only tenant owners and admins may access financial/operational reports
const CAN_VIEW_REPORTES = new Set(['tenant', 'superadmin', 'admin'])

export async function onRequestGet({ request, data, env }) {
  const { user } = data

  if (!CAN_VIEW_REPORTES.has(user.rol)) {
    return forbidden('No tenés permisos para acceder a los reportes')
  }

  const url = new URL(request.url)
  const tipo = url.searchParams.get('tipo') ?? 'mensual'
  const anio = parseInt(url.searchParams.get('anio') ?? new Date().getFullYear())
  const mes = parseInt(url.searchParams.get('mes') ?? (new Date().getMonth() + 1))

  try {
    if (tipo === 'mensual') return await reporteMensual(env.DB, user.sub, anio, mes)
    if (tipo === 'anual')   return await reporteAnual(env.DB, user.sub, anio)
    if (tipo === 'prestaciones') return await reportePrestaciones(env.DB, user.sub, anio, mes)
    if (tipo === 'pacientes') return await reportePacientes(env.DB, user.sub, anio, mes)
    if (tipo === 'comisiones') return await reporteComisiones(env.DB, user.sub, anio, mes)
    if (tipo === 'rentabilidad') return await reporteRentabilidad(env.DB, user.sub, anio, mes)
    if (tipo === 'profesional') return await reporteProfesional(env.DB, user.sub, anio, mes)
    return err('tipo no válido')
  } catch (e) {
    console.error('[reportes] Error:', e?.message)
    return err('Error al generar el reporte. Intentá nuevamente.', 500)
  }
}

async function reporteMensual(DB, tenantId, anio, mes) {
  const desde = `${anio}-${String(mes).padStart(2,'0')}-01`
  const hasta = `${anio}-${String(mes).padStart(2,'0')}-31 23:59:59`

  // Ingresos por método de pago
  const pagosRes = await DB.prepare(`
    SELECT metodo_pago, COUNT(*) as cantidad, SUM(monto) as total
    FROM pagos
    WHERE tenant_id = ?1 AND fecha >= ?2 AND fecha <= ?3 AND anulado = 0
    GROUP BY metodo_pago
    ORDER BY total DESC
  `).bind(tenantId, desde, hasta).all()

  // Ingresos por día
  const porDiaRes = await DB.prepare(`
    SELECT substr(fecha, 1, 10) as dia, SUM(monto) as total, COUNT(*) as cantidad
    FROM pagos
    WHERE tenant_id = ?1 AND fecha >= ?2 AND fecha <= ?3 AND anulado = 0
    GROUP BY dia ORDER BY dia
  `).bind(tenantId, desde, hasta).all()

  // Turnos por estado
  const turnosRes = await DB.prepare(`
    SELECT estado, COUNT(*) as cantidad
    FROM turnos
    WHERE tenant_id = ?1 AND fecha_hora >= ?2 AND fecha_hora <= ?3
    GROUP BY estado
  `).bind(tenantId, desde, hasta).all()

  // Pacientes nuevos
  const nuevosRes = await DB.prepare(`
    SELECT COUNT(*) as cantidad FROM pacientes
    WHERE tenant_id = ?1 AND DATE(created_at) >= DATE(?2) AND DATE(created_at) <= DATE(?3)
  `).bind(tenantId, desde, hasta).first()

  // Prestaciones más realizadas
  const prestRes = await DB.prepare(`
    SELECT prestacion_nombre, COUNT(*) as cantidad, SUM(monto) as total
    FROM evoluciones
    WHERE tenant_id = ?1 AND fecha >= ?2 AND fecha <= ?3 AND prestacion_nombre IS NOT NULL
    GROUP BY prestacion_nombre ORDER BY cantidad DESC LIMIT 10
  `).bind(tenantId, desde, hasta).all()

  // Deudores del mes
  const deudoresRes = await DB.prepare(`
    SELECT nombre, apellido, saldo FROM pacientes
    WHERE tenant_id = ?1 AND saldo < 0
    ORDER BY saldo ASC LIMIT 20
  `).bind(tenantId).all()

  const pagos = pagosRes.results ?? []
  const totalIngresado = pagos.reduce((s, p) => s + (p.total ?? 0), 0)

  return ok({
    periodo: { anio, mes, desde, hasta },
    resumen: {
      total_ingresado: totalIngresado,
      total_transacciones: pagos.reduce((s, p) => s + (p.cantidad ?? 0), 0),
      pacientes_nuevos: nuevosRes?.cantidad ?? 0,
      turnos_completados: (turnosRes.results ?? []).find(t => t.estado === 'completado')?.cantidad ?? 0,
      turnos_ausentes: (turnosRes.results ?? []).find(t => t.estado === 'ausente')?.cantidad ?? 0,
    },
    pagos_por_metodo: pagos,
    ingresos_por_dia: porDiaRes.results ?? [],
    turnos_por_estado: turnosRes.results ?? [],
    prestaciones_top: prestRes.results ?? [],
    deudores: deudoresRes.results ?? [],
  })
}

async function reporteAnual(DB, tenantId, anio) {
  const desde = `${anio}-01-01`
  const hasta = `${anio}-12-31 23:59:59`

  const porMesRes = await DB.prepare(`
    SELECT substr(fecha, 1, 7) as mes, SUM(monto) as total, COUNT(*) as cantidad
    FROM pagos
    WHERE tenant_id = ?1 AND fecha >= ?2 AND fecha <= ?3 AND anulado = 0
    GROUP BY mes ORDER BY mes
  `).bind(tenantId, desde, hasta).all()

  const totalRes = await DB.prepare(`
    SELECT SUM(monto) as total FROM pagos
    WHERE tenant_id = ?1 AND fecha >= ?2 AND fecha <= ?3 AND anulado = 0
  `).bind(tenantId, desde, hasta).first()

  const pacientesRes = await DB.prepare(`
    SELECT substr(created_at, 1, 7) as mes, COUNT(*) as cantidad
    FROM pacientes WHERE tenant_id = ?1 AND DATE(created_at) >= DATE(?2) AND DATE(created_at) <= DATE(?3)
    GROUP BY mes ORDER BY mes
  `).bind(tenantId, desde, hasta).all()

  return ok({
    anio,
    total_anual: totalRes?.total ?? 0,
    ingresos_por_mes: porMesRes.results ?? [],
    pacientes_nuevos_por_mes: pacientesRes.results ?? [],
  })
}

async function reportePrestaciones(DB, tenantId, anio, mes) {
  const desde = `${anio}-${String(mes).padStart(2,'0')}-01`
  const hasta = `${anio}-${String(mes).padStart(2,'0')}-31 23:59:59`

  const res = await DB.prepare(`
    SELECT prestacion_nombre, prestacion_id,
           COUNT(*) as cantidad, SUM(monto) as total_facturado,
           AVG(monto) as precio_promedio
    FROM evoluciones
    WHERE tenant_id = ?1 AND fecha >= ?2 AND fecha <= ?3
    GROUP BY prestacion_nombre ORDER BY cantidad DESC
  `).bind(tenantId, desde, hasta).all()

  return ok({ periodo: { anio, mes }, prestaciones: res.results ?? [] })
}

async function reporteComisiones(DB, tenantId, anio, mes) {
  const desde = `${anio}-${String(mes).padStart(2,'0')}-01`
  const hasta = `${anio}-${String(mes).padStart(2,'0')}-31 23:59:59`

  // Facturación por profesional en el periodo
  const facturacionRes = await DB.prepare(`
    SELECT c.id, c.nombre, c.apellido, c.porcentaje_comision,
           COUNT(e.id) as evoluciones,
           COALESCE(SUM(e.monto), 0) as total_facturado
    FROM colaboradores c
    LEFT JOIN evoluciones e ON e.profesional_id = c.id
      AND e.tenant_id = c.tenant_id
      AND e.fecha >= ?2 AND e.fecha <= ?3
    WHERE c.tenant_id = ?1 AND c.activo = 1 AND c.rol = 'profesional'
    GROUP BY c.id
    ORDER BY total_facturado DESC
  `).bind(tenantId, desde, hasta).all()

  const profesionales = (facturacionRes.results ?? []).map(p => ({
    ...p,
    comision_monto: Math.round((p.total_facturado * (p.porcentaje_comision ?? 0)) / 100),
  }))

  const total_facturado = profesionales.reduce((s, p) => s + p.total_facturado, 0)
  const total_comisiones = profesionales.reduce((s, p) => s + p.comision_monto, 0)

  return ok({
    periodo: { anio, mes, desde, hasta },
    profesionales,
    totales: { total_facturado, total_comisiones },
  })
}

async function reportePacientes(DB, tenantId, anio, mes) {
  const desde = `${anio}-${String(mes).padStart(2,'0')}-01`
  const hasta = `${anio}-${String(mes).padStart(2,'0')}-31 23:59:59`

  // Pacientes atendidos
  const atendidosRes = await DB.prepare(`
    SELECT DISTINCT p.id, p.nombre, p.apellido, p.obra_social, p.saldo,
           COUNT(e.id) as evoluciones, SUM(e.monto) as total_facturado
    FROM pacientes p
    LEFT JOIN evoluciones e ON e.paciente_id = p.id AND e.fecha >= ?2 AND e.fecha <= ?3
    WHERE p.tenant_id = ?1
    GROUP BY p.id HAVING evoluciones > 0
    ORDER BY total_facturado DESC LIMIT 50
  `).bind(tenantId, desde, hasta).all()

  // Total deudores
  const deudaRes = await DB.prepare(`
    SELECT COUNT(*) as cantidad, SUM(ABS(saldo)) as total_deuda
    FROM pacientes WHERE tenant_id = ?1 AND saldo < 0
  `).bind(tenantId).first()

  return ok({
    periodo: { anio, mes },
    pacientes_atendidos: atendidosRes.results ?? [],
    deuda_total: deudaRes?.total_deuda ?? 0,
    cantidad_deudores: deudaRes?.cantidad ?? 0,
  })
}

async function reporteRentabilidad(DB, tenantId, anio, mes) {
  // Últimos 6 meses de ingresos vs gastos
  const meses = []
  for (let i = 5; i >= 0; i--) {
    let m = mes - i, a = anio
    while (m <= 0) { m += 12; a-- }
    const desde = `${a}-${String(m).padStart(2,'0')}-01`
    const hasta = `${a}-${String(m).padStart(2,'0')}-31 23:59:59`

    const ingresosR = await DB.prepare(
      `SELECT COALESCE(SUM(monto), 0) as total FROM pagos WHERE tenant_id = ?1 AND fecha >= ?2 AND fecha <= ?3 AND anulado = 0`
    ).bind(tenantId, desde, hasta).first()

    const gastosR = await DB.prepare(
      `SELECT COALESCE(SUM(monto), 0) as total FROM gastos WHERE tenant_id = ?1 AND fecha >= ?2 AND fecha <= ?3`
    ).bind(tenantId, desde, hasta).first()

    meses.push({
      periodo: `${a}-${String(m).padStart(2,'0')}`,
      mes_label: new Date(a, m - 1).toLocaleString('es-AR', { month: 'short' }),
      ingresos: ingresosR?.total ?? 0,
      gastos: gastosR?.total ?? 0,
      margen: (ingresosR?.total ?? 0) - (gastosR?.total ?? 0),
    })
  }

  // Gastos por categoría del mes actual
  const desdeActual = `${anio}-${String(mes).padStart(2,'0')}-01`
  const hastaActual = `${anio}-${String(mes).padStart(2,'0')}-31`
  const gastosCatR = await DB.prepare(
    `SELECT categoria, COALESCE(SUM(monto), 0) as total, COUNT(*) as cantidad
     FROM gastos WHERE tenant_id = ?1 AND fecha >= ?2 AND fecha <= ?3
     GROUP BY categoria ORDER BY total DESC`
  ).bind(tenantId, desdeActual, hastaActual).all()

  const totalIngresos = meses[5]?.ingresos ?? 0
  const totalGastos = meses[5]?.gastos ?? 0

  return ok({
    periodo: { anio, mes },
    meses,
    mes_actual: {
      ingresos: totalIngresos,
      gastos: totalGastos,
      margen: totalIngresos - totalGastos,
      margen_pct: totalIngresos > 0 ? ((totalIngresos - totalGastos) / totalIngresos * 100).toFixed(1) : 0,
    },
    gastos_por_categoria: gastosCatR?.results ?? [],
  })
}

async function reporteProfesional(DB, tenantId, anio, mes) {
  const desde = `${anio}-${String(mes).padStart(2,'0')}-01`
  const hasta = `${anio}-${String(mes).padStart(2,'0')}-31 23:59:59`

  const profR = await DB.prepare(`
    SELECT c.id, c.nombre, c.apellido,
           COUNT(DISTINCT CASE WHEN t.estado = 'completado' THEN t.id END) as turnos_completados,
           COUNT(DISTINCT CASE WHEN t.estado = 'ausente' THEN t.id END) as turnos_ausentes,
           COUNT(DISTINCT CASE WHEN t.estado IN ('programado','confirmado') THEN t.id END) as turnos_pendientes,
           COALESCE(SUM(CASE WHEN t.estado = 'completado' THEN e.monto ELSE 0 END), 0) as total_facturado
    FROM colaboradores c
    LEFT JOIN turnos t ON t.profesional_id = c.id AND t.tenant_id = c.tenant_id AND t.fecha_hora >= ?2 AND t.fecha_hora <= ?3
    LEFT JOIN evoluciones e ON e.turno_id = t.id AND e.tenant_id = c.tenant_id
    WHERE c.tenant_id = ?1 AND c.activo = 1 AND c.rol = 'profesional'
    GROUP BY c.id
    ORDER BY total_facturado DESC
  `).bind(tenantId, desde, hasta).all()

  return ok({
    periodo: { anio, mes },
    profesionales: profR?.results ?? [],
  })
}
