import { ok, err, forbidden, cors } from '../../_lib/response.js'
import { uid } from '../../_lib/auth.js'

export async function onRequestOptions() { return cors() }

// Bulk import is a privileged operation — only tenant owners and admins
const CAN_IMPORT = new Set(['tenant', 'superadmin', 'admin'])

// POST /api/import — importa pacientes, turnos o pagos desde JSON parseado en frontend
export async function onRequestPost({ request, data, env }) {
  const { user } = data

  if (!CAN_IMPORT.has(user.rol)) {
    return forbidden('No tenés permisos para importar datos')
  }

  const body = await request.json()
  const { tipo, registros } = body

  if (!tipo || !Array.isArray(registros) || registros.length === 0)
    return err('tipo y registros son requeridos')

  if (registros.length > 1000)
    return err('Máximo 1000 registros por importación')

  try {
    if (tipo === 'pacientes') return await importarPacientes(env.DB, user.sub, registros)
    if (tipo === 'turnos')    return await importarTurnos(env.DB, user.sub, registros)
    if (tipo === 'pagos')     return await importarPagos(env.DB, user.sub, registros)
    return err(`Tipo de importación no soportado: ${tipo}`)
  } catch (e) {
    console.error('[import] Error:', e?.message)
    return err('Error interno al procesar la importación. Revisá el formato del archivo.', 500)
  }
}

async function importarPacientes(DB, tenantId, registros) {
  const errores = []
  const insertados = []
  const stmt = DB.prepare(`
    INSERT INTO pacientes (id, tenant_id, nombre, apellido, dni, fecha_nacimiento, sexo, telefono,
      email, obra_social, numero_afiliado, plan_obra_social, direccion, ciudad,
      alergias, medicacion_actual, antecedentes_medicos, notas, saldo, created_at, updated_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,datetime('now'),datetime('now'))
    ON CONFLICT(id) DO NOTHING
  `)

  for (let i = 0; i < registros.length; i++) {
    const r = registros[i]
    if (!r.nombre || !r.apellido) {
      errores.push({ fila: i + 2, error: `Nombre y apellido son obligatorios` })
      continue
    }
    try {
      const id = uid()
      await stmt.bind(
        id, tenantId,
        r.nombre?.trim(), r.apellido?.trim(),
        r.dni?.trim() ?? null, r.fecha_nacimiento?.trim() ?? null,
        r.sexo?.trim() ?? null, r.telefono?.trim() ?? null,
        r.email?.trim() ?? null, r.obra_social?.trim() ?? null,
        r.numero_afiliado?.trim() ?? null, r.plan_obra_social?.trim() ?? null,
        r.direccion?.trim() ?? null, r.ciudad?.trim() ?? null,
        r.alergias?.trim() ?? null, r.medicacion_actual?.trim() ?? null,
        r.antecedentes_medicos?.trim() ?? null, r.notas?.trim() ?? null,
        Number(r.saldo) || 0
      ).run()
      insertados.push(id)
    } catch (e) {
      errores.push({ fila: i + 2, error: e.message })
    }
  }
  return ok({ tipo: 'pacientes', insertados: insertados.length, errores })
}

async function importarTurnos(DB, tenantId, registros) {
  const errores = []
  const insertados = []

  // Mapa dni→id para resolver pacientes por DNI
  const pacsResult = await DB.prepare(
    `SELECT id, dni, nombre, apellido FROM pacientes WHERE tenant_id = ?1`
  ).bind(tenantId).all()
  const pacsByDni = {}
  const pacsByNombre = {}
  for (const p of (pacsResult.results ?? [])) {
    if (p.dni) pacsByDni[p.dni.trim()] = p.id
    const key = `${p.apellido?.toLowerCase()}_${p.nombre?.toLowerCase()}`
    pacsByNombre[key] = p.id
  }

  const stmt = DB.prepare(`
    INSERT INTO turnos (id, tenant_id, paciente_id, fecha_hora, duracion_minutos, motivo, estado, notas, created_at, updated_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,datetime('now'),datetime('now'))
    ON CONFLICT(id) DO NOTHING
  `)

  for (let i = 0; i < registros.length; i++) {
    const r = registros[i]
    if (!r.fecha_hora) { errores.push({ fila: i + 2, error: 'fecha_hora es obligatorio' }); continue }

    let pacienteId = r.paciente_id
    if (!pacienteId && r.dni) pacienteId = pacsByDni[r.dni.trim()]
    if (!pacienteId && r.apellido && r.nombre) {
      pacienteId = pacsByNombre[`${r.apellido?.toLowerCase()}_${r.nombre?.toLowerCase()}`]
    }
    if (!pacienteId) { errores.push({ fila: i + 2, error: `Paciente no encontrado: ${r.dni || r.apellido}` }); continue }

    try {
      await stmt.bind(
        uid(), tenantId, pacienteId,
        r.fecha_hora, Number(r.duracion_minutos) || 60,
        r.motivo?.trim() ?? null,
        r.estado?.trim() || 'programado',
        r.notas?.trim() ?? null
      ).run()
      insertados.push(1)
    } catch (e) {
      errores.push({ fila: i + 2, error: e.message })
    }
  }
  return ok({ tipo: 'turnos', insertados: insertados.length, errores })
}

async function importarPagos(DB, tenantId, registros) {
  const errores = []
  const insertados = []

  const pacsResult = await DB.prepare(
    `SELECT id, dni, nombre, apellido FROM pacientes WHERE tenant_id = ?1`
  ).bind(tenantId).all()
  const pacsByDni = {}
  const pacsByNombre = {}
  for (const p of (pacsResult.results ?? [])) {
    if (p.dni) pacsByDni[p.dni.trim()] = p.id
    pacsByNombre[`${p.apellido?.toLowerCase()}_${p.nombre?.toLowerCase()}`] = p.id
  }

  const stmt = DB.prepare(`
    INSERT INTO pagos (id, tenant_id, paciente_id, monto, metodo_pago, concepto, fecha, created_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,datetime('now'))
    ON CONFLICT(id) DO NOTHING
  `)

  for (let i = 0; i < registros.length; i++) {
    const r = registros[i]
    if (!r.monto || Number(r.monto) <= 0) { errores.push({ fila: i + 2, error: 'monto debe ser mayor a 0' }); continue }

    let pacienteId = r.paciente_id
    if (!pacienteId && r.dni) pacienteId = pacsByDni[r.dni.trim()]
    if (!pacienteId && r.apellido && r.nombre) {
      pacienteId = pacsByNombre[`${r.apellido?.toLowerCase()}_${r.nombre?.toLowerCase()}`]
    }
    if (!pacienteId) { errores.push({ fila: i + 2, error: `Paciente no encontrado` }); continue }

    const metodo = ['efectivo','transferencia','tarjeta_debito','tarjeta_credito','obra_social','cheque','otro']
      .includes(r.metodo_pago) ? r.metodo_pago : 'efectivo'

    try {
      await stmt.bind(
        uid(), tenantId, pacienteId,
        Number(r.monto), metodo,
        r.concepto?.trim() ?? null,
        r.fecha || new Date().toISOString()
      ).run()
      // Actualizar saldo
      await DB.prepare(`UPDATE pacientes SET saldo = saldo + ?1 WHERE id = ?2 AND tenant_id = ?3`)
        .bind(Number(r.monto), pacienteId, tenantId).run()
      insertados.push(1)
    } catch (e) {
      errores.push({ fila: i + 2, error: e.message })
    }
  }
  return ok({ tipo: 'pagos', insertados: insertados.length, errores })
}
