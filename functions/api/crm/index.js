import { ok, err, forbidden, cors } from '../../_lib/response.js'

export async function onRequestOptions() { return cors() }

// CRM data (including financial summaries, deudores, etc.) is restricted.
// recepcionista may access non-financial views only (birthday reminders, appointment reminders).
// profesional is also restricted from financial CRM views.
const FINANCIAL_TIPOS = new Set(['deudores', 'estadisticas'])
const CAN_ACCESS_FINANCIAL_CRM = new Set(['tenant', 'superadmin', 'admin'])
const CAN_ACCESS_CRM = new Set(['tenant', 'superadmin', 'admin', 'profesional'])

export async function onRequestGet({ request, data, env }) {
  const { user } = data
  const url = new URL(request.url)
  const tipo = url.searchParams.get('tipo') ?? 'inactivos'
  const diasInactividad = Number(url.searchParams.get('dias') ?? 90)

  // recepcionista cannot access CRM at all
  if (!CAN_ACCESS_CRM.has(user.rol)) {
    return forbidden('No tenés permisos para acceder al CRM')
  }

  // profesional and others cannot access financial CRM reports
  if (FINANCIAL_TIPOS.has(tipo) && !CAN_ACCESS_FINANCIAL_CRM.has(user.rol)) {
    return forbidden('No tenés permisos para acceder a reportes financieros del CRM')
  }

  try {
    if (tipo === 'inactivos') {
      // Pacientes cuyo último turno completado fue hace más de N días
      const result = await env.DB.prepare(`
        SELECT p.id, p.nombre, p.apellido, p.telefono, p.email, p.obra_social,
               MAX(t.fecha_hora) as ultimo_turno,
               CAST(julianday('now') - julianday(MAX(t.fecha_hora)) AS INTEGER) as dias_sin_venir,
               p.saldo
        FROM pacientes p
        LEFT JOIN turnos t ON t.paciente_id = p.id
          AND t.tenant_id = p.tenant_id
          AND t.estado IN ('completado','presente')
        WHERE p.tenant_id = ?1 AND p.estado = 'activo'
        GROUP BY p.id
        HAVING (ultimo_turno IS NULL OR dias_sin_venir >= ?2)
        ORDER BY dias_sin_venir DESC NULLS LAST
        LIMIT 100
      `).bind(user.sub, diasInactividad).all()
      return ok(result?.results ?? [])
    }

    if (tipo === 'cumpleanos') {
      // Pacientes con cumpleaños en los próximos 30 días
      // Usa julianday para manejar correctamente el wraparound de fin de año
      // (ej: hoy 15-dic, cumpleaños 5-ene → 21 días)
      // Feb-29 se normaliza a Feb-28 en años no bisiestos
      const result = await env.DB.prepare(`
        WITH cumple AS (
          SELECT p.id, p.nombre, p.apellido, p.telefono, p.fecha_nacimiento,
            CAST(
              CASE
                WHEN REPLACE(strftime('%m-%d', p.fecha_nacimiento), '02-29', '02-28') >= strftime('%m-%d', 'now')
                THEN julianday(strftime('%Y','now') || '-' || REPLACE(strftime('%m-%d', p.fecha_nacimiento), '02-29', '02-28')) - julianday('now')
                ELSE julianday((CAST(strftime('%Y','now') AS INT) + 1) || '-' || REPLACE(strftime('%m-%d', p.fecha_nacimiento), '02-29', '02-28')) - julianday('now')
              END
            AS INTEGER) as dias_para_cumple
          FROM pacientes p
          WHERE p.tenant_id = ?1 AND p.estado = 'activo'
            AND p.fecha_nacimiento IS NOT NULL AND p.fecha_nacimiento != ''
        )
        SELECT * FROM cumple
        WHERE dias_para_cumple BETWEEN 0 AND 30
        ORDER BY dias_para_cumple ASC
        LIMIT 50
      `).bind(user.sub).all()
      return ok(result?.results ?? [])
    }

    if (tipo === 'recordatorios') {
      // Turnos de mañana con paciente que tiene teléfono
      const result = await env.DB.prepare(`
        SELECT t.id, t.fecha_hora, t.motivo, t.estado,
               p.nombre, p.apellido, p.telefono, p.obra_social,
               pr.nombre as prestacion_nombre
        FROM turnos t
        JOIN pacientes p ON p.id = t.paciente_id
        LEFT JOIN prestaciones pr ON pr.id = t.prestacion_id
        WHERE t.tenant_id = ?1
          AND t.estado IN ('programado', 'confirmado')
          AND p.telefono IS NOT NULL AND p.telefono != ''
          AND date(t.fecha_hora) = date('now', '+1 day')
        ORDER BY t.fecha_hora ASC
      `).bind(user.sub).all()
      return ok(result?.results ?? [])
    }

    if (tipo === 'deudores') {
      // Pacientes con saldo negativo (deuda)
      const result = await env.DB.prepare(`
        SELECT p.id, p.nombre, p.apellido, p.telefono, p.obra_social,
               p.saldo,
               MAX(t.fecha_hora) as ultimo_turno
        FROM pacientes p
        LEFT JOIN turnos t ON t.paciente_id = p.id AND t.tenant_id = p.tenant_id
          AND t.estado IN ('completado','presente')
        WHERE p.tenant_id = ?1
          AND p.estado = 'activo'
          AND (p.saldo IS NOT NULL AND p.saldo < 0)
        GROUP BY p.id
        ORDER BY p.saldo ASC
        LIMIT 100
      `).bind(user.sub).all()
      return ok(result?.results ?? [])
    }

    if (tipo === 'estadisticas') {
      // Resumen general del CRM
      const [total, activos, nuevosEstesMes, conDeuda] = await Promise.all([
        env.DB.prepare(`SELECT COUNT(*) as n FROM pacientes WHERE tenant_id = ?1`).bind(user.sub).first(),
        env.DB.prepare(`SELECT COUNT(*) as n FROM pacientes WHERE tenant_id = ?1 AND estado = 'activo'`).bind(user.sub).first(),
        env.DB.prepare(`SELECT COUNT(*) as n FROM pacientes WHERE tenant_id = ?1 AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`).bind(user.sub).first(),
        env.DB.prepare(`SELECT COUNT(*) as n FROM pacientes WHERE tenant_id = ?1 AND saldo < 0`).bind(user.sub).first(),
      ])
      return ok({
        total_pacientes: total?.n ?? 0,
        activos: activos?.n ?? 0,
        nuevos_mes: nuevosEstesMes?.n ?? 0,
        con_deuda: conDeuda?.n ?? 0,
      })
    }

    return err('Tipo de consulta no válido')
  } catch (e) {
    console.error('[crm] Error:', e?.message)
    return err('Error al procesar la consulta CRM', 500)
  }
}
