// ============================================================
// /api/comprobantes — Recibos / comprobantes internos de pago
// Genera número correlativo por tenant y almacena los items.
// El PDF se genera en el frontend (sin dependencias servidor).
// ============================================================
import { ok, created, err, notFound, cors } from '../../_lib/response.js'
import { newId } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

// GET /api/comprobantes?paciente_id=xxx
// GET /api/comprobantes/:id
export async function onRequestGet({ request, data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]

  if (id) {
    const comp = await env.DB.prepare(
      `SELECT c.*, p.nombre || ' ' || p.apellido as paciente_nombre, p.dni as paciente_dni, p.email as paciente_email
       FROM comprobantes c
       LEFT JOIN pacientes p ON p.id = c.paciente_id
       WHERE c.id = ?1 AND c.tenant_id = ?2`
    ).bind(id, user.sub).first()
    if (!comp) return notFound('Comprobante')
    return ok({ ...comp, items: JSON.parse(comp.items || '[]') })
  }

  const url = new URL(request.url)
  const pacienteId = url.searchParams.get('paciente_id')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)

  let sql = `
    SELECT c.*, p.nombre || ' ' || p.apellido as paciente_nombre
    FROM comprobantes c
    LEFT JOIN pacientes p ON p.id = c.paciente_id
    WHERE c.tenant_id = ?1
  `
  const values = [user.sub]
  if (pacienteId) { sql += ` AND c.paciente_id = ?2`; values.push(pacienteId) }
  sql += ` ORDER BY c.numero DESC LIMIT ${limit}`

  const result = await env.DB.prepare(sql).bind(...values).all()
  const rows = (result?.results ?? []).map(r => ({ ...r, items: JSON.parse(r.items || '[]') }))
  return ok(rows)
}

// POST /api/comprobantes
// Body: { paciente_id, pago_id?, items: [{descripcion, cantidad, precio_unitario, subtotal}], descuento?, notas?, tipo? }
export async function onRequestPost({ request, data, env }) {
  const { user } = data
  const body = await request.json().catch(() => ({}))
  const { paciente_id, pago_id, items = [], descuento = 0, notas, tipo = 'recibo' } = body

  if (!paciente_id) return err('Paciente requerido')
  if (!items.length) return err('Se requiere al menos un ítem')

  // Verificar que el paciente pertenece a este tenant
  const pacienteCheck = await env.DB.prepare(
    `SELECT id FROM pacientes WHERE id = ?1 AND tenant_id = ?2`
  ).bind(paciente_id, user.sub).first()
  if (!pacienteCheck) return err('Paciente no encontrado', 404)

  // Obtener/incrementar número correlativo del tenant — operación atómica (evita race conditions)
  const seq = await env.DB.prepare(
    `INSERT INTO comprobante_seq (tenant_id, ultimo_numero) VALUES (?1, 1)
     ON CONFLICT(tenant_id) DO UPDATE SET ultimo_numero = ultimo_numero + 1
     RETURNING ultimo_numero`
  ).bind(user.sub).first()
  const numero = seq?.ultimo_numero ?? 1

  const subtotal = items.reduce((s, i) => s + (Number(i.subtotal) || 0), 0)
  const total = Math.max(0, subtotal - Number(descuento))
  const fecha = new Date().toISOString().split('T')[0]

  const id = newId()
  await env.DB.prepare(`
    INSERT INTO comprobantes (id, tenant_id, paciente_id, numero, tipo, fecha, items, subtotal, descuento, total, pago_id, notas, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, datetime('now'))
  `).bind(id, user.sub, paciente_id, numero, tipo, fecha,
    JSON.stringify(items), subtotal, Number(descuento), total,
    pago_id || null, notas || null
  ).run()

  // Datos del comprobante completo para el PDF frontend
  const [paciente, config] = await Promise.all([
    env.DB.prepare(`SELECT nombre, apellido, dni, email FROM pacientes WHERE id = ?1 AND tenant_id = ?2`).bind(paciente_id, user.sub).first(),
    env.DB.prepare(`SELECT nombre_consultorio, nombre_profesional, matricula, direccion, cuit, email, telefono FROM configuracion WHERE tenant_id = ?1`).bind(user.sub).first(),
  ])

  return created({
    id, numero, tipo, fecha, items, subtotal, descuento, total, notas,
    paciente: paciente || null,
    consultorio: config || null,
  })
}

// DELETE /api/comprobantes/:id — anular comprobante
export async function onRequestDelete({ data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')
  const result = await env.DB.prepare(
    `DELETE FROM comprobantes WHERE id = ?1 AND tenant_id = ?2`
  ).bind(id, user.sub).run()
  if (!result.meta?.changes) return notFound('Comprobante')
  return ok({ mensaje: 'Comprobante eliminado' })
}
