// Helpers para queries D1 con filtro por tenant (seguridad)

// Whitelist: solo estos campos se permiten en inserts/updates por tabla
const ALLOWED_FIELDS = {
  pacientes: ['nombre','apellido','dni','fecha_nacimiento','sexo','telefono','telefono_alternativo','email','direccion','ciudad','obra_social','numero_afiliado','plan_obra_social','alergias','medicacion_actual','antecedentes_medicos','antecedentes_odontologicos','notas','estado'],
  turnos: ['paciente_id','fecha_hora','duracion_minutos','motivo','prestacion_id','estado','notas','sesiones_autorizadas','profesional_id'],
  pagos: ['paciente_id','monto','metodo_pago','concepto','fecha','monto_os','monto_copago','turno_id','presupuesto_id','numero_recibo','notas'],
  prestaciones: ['nombre','codigo','precio','duracion_minutos','categoria','activo','descripcion'],
  insumos: ['nombre','descripcion','unidad','stock_actual','stock_minimo','precio_unitario','proveedor','categoria','activo'],
  evoluciones: ['paciente_id','descripcion','tipo','notas','fecha','piezas_tratadas','prestacion_id','prestacion_nombre','monto'],
  odontograma: ['paciente_id','numero_pieza','estado','caras_afectadas','notas'],
  presupuestos: ['paciente_id','numero','total','estado','notas','fecha_vencimiento','total_pagado'],
  configuracion: ['nombre_consultorio','nombre_profesional','matricula','especialidad','telefono','email','direccion','ciudad','cuit','duracion_turno_default','horario_inicio','horario_fin','dias_laborales','moneda','firma_digital','onboarding_completado','workflow_etapas','notif_email_turno','notif_email_cancelacion','notif_whatsapp_numero','plantillas_evoluciones','catalogo_farmacos','tipo_cobro','pais','permisos_roles','booking_slug','booking_activo'],
  convenios: ['nombre_os','prestacion_id','monto_os','monto_copago','activo'],
  recetas: ['paciente_id','profesional_id','profesional_nombre','profesional_matricula','fecha','medicamentos','indicaciones'],
  giftcards: ['codigo','monto_original','monto_restante','estado','paciente_id','fecha_vencimiento','notas'],
  gastos: ['fecha','descripcion','categoria','monto','metodo_pago','proveedor','comprobante_nro','notas'],
  solicitudes_turno: ['nombre','apellido','telefono','email','fecha_hora','duracion_minutos','motivo','profesional_id','estado','notas_internas'],
}

// Tablas que tienen columna updated_at
const HAS_UPDATED_AT = new Set(['pacientes','turnos','presupuestos','odontograma','insumos','configuracion','prestaciones','evoluciones','gastos'])

// Filtra un objeto body para quedarse solo con campos permitidos de la tabla
export function pick(table, data) {
  const allowed = ALLOWED_FIELDS[table]
  if (!allowed) return {}
  const clean = {}
  for (const key of allowed) {
    if (key in data) clean[key] = data[key]
  }
  return clean
}

export function row(result) {
  return result?.results?.[0] ?? null
}

export function rows(result) {
  return result?.results ?? []
}

export async function findOne(db, table, { where = {}, select = '*' } = {}) {
  const conditions = Object.keys(where).map((k, i) => `${k} = ?${i + 1}`).join(' AND ')
  const values = Object.values(where)
  const sql = `SELECT ${select} FROM ${table}${conditions ? ` WHERE ${conditions}` : ''} LIMIT 1`
  const result = await db.prepare(sql).bind(...values).first()
  return result ?? null
}

export async function findMany(db, table, { where = {}, select = '*', order = null, limit = null, offset = null } = {}) {
  const conditions = Object.keys(where).map((k, i) => `${k} = ?${i + 1}`).join(' AND ')
  const values = Object.values(where)
  let sql = `SELECT ${select} FROM ${table}`
  if (conditions) sql += ` WHERE ${conditions}`
  if (order) sql += ` ORDER BY ${order}`
  if (limit) sql += ` LIMIT ${limit}`
  if (offset) sql += ` OFFSET ${offset}`
  const result = await db.prepare(sql).bind(...values).all()
  return result?.results ?? []
}

export async function insert(db, table, data) {
  const keys = Object.keys(data)
  const placeholders = keys.map((_, i) => `?${i + 1}`).join(', ')
  const values = Object.values(data)
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`
  const result = await db.prepare(sql).bind(...values).first()
  return result
}

export async function update(db, table, id, data, tenantId = null) {
  const keys = Object.keys(data)
  if (keys.length === 0) return null
  const sets = keys.map((k, i) => `${k} = ?${i + 1}`).join(', ')
  const values = [...Object.values(data), id]
  const withTimestamp = HAS_UPDATED_AT.has(table) ? `, updated_at = datetime('now')` : ''
  let sql = `UPDATE ${table} SET ${sets}${withTimestamp} WHERE id = ?${keys.length + 1}`
  if (tenantId) {
    values.push(tenantId)
    sql += ` AND tenant_id = ?${keys.length + 2}`
  }
  sql += ' RETURNING *'
  const result = await db.prepare(sql).bind(...values).first()
  return result
}

export async function remove(db, table, id, tenantId = null) {
  let sql = `DELETE FROM ${table} WHERE id = ?1`
  const values = [id]
  if (tenantId) { sql += ' AND tenant_id = ?2'; values.push(tenantId) }
  await db.prepare(sql).bind(...values).run()
}

export function newId() {
  return crypto.randomUUID()
}
