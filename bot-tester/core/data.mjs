// Generador de datos realistas para un consultorio odontológico argentino

const nombres    = ['Lucía','Martín','Valentina','Santiago','Camila','Facundo','Florencia','Rodrigo','Agustina','Nicolás','Sol','Tomás','Micaela','Ignacio','Catalina','Mateo','Sofía','Emilio','Paula','Hernán']
const apellidos  = ['González','Rodríguez','Fernández','López','Martínez','García','Pérez','Sánchez','Ramírez','Torres','Flores','Medina','Castro','Romero','Ortega','Morales','Ruiz','Jiménez','Blanco','Vargas']
const obrasSoc   = ['OSDE','Swiss Medical','Medifé','IOMA','Galeno','PAMI','APROSS','OSECAC','Sancor Salud','OSPEDYC','Ninguna']
const motivos    = ['Dolor de muela','Control rutinario','Limpieza','Sangrado de encías','Sensibilidad','Ortodoncia','Consulta general','Extracción','Implante','Blanqueamiento']
const prestNames = ['Consulta','Extracción simple','Extracción quirúrgica','Obturación','Endodoncia unirradicular','Endodoncia multirradicular','Limpieza bucal','Ortodoncia fija','Blanqueamiento','Corona','Implante','Puente','Prótesis total','Radiografía periapical']

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
function randFloat(min, max, dec = 2) { return parseFloat((Math.random() * (max - min) + min).toFixed(dec)) }

export function fakePaciente(suffix = Date.now()) {
  return {
    nombre:      rand(nombres),
    apellido:    rand(apellidos),
    email:       `paciente-${suffix}-${randInt(1000,9999)}@test.clingest.com`,
    telefono:    `11${randInt(10000000,99999999)}`,
    dni:         String(randInt(20000000, 45000000)),
    fecha_nacimiento: `${randInt(1960,2005)}-${String(randInt(1,12)).padStart(2,'0')}-${String(randInt(1,28)).padStart(2,'0')}`,
    obra_social: rand(obrasSoc),
    motivo_consulta: rand(motivos),
  }
}

export function fakeTurno(pacienteId, colaboradorId = null) {
  const hoy   = new Date()
  const delta = randInt(0, 7)
  const d     = new Date(hoy)
  d.setDate(d.getDate() + delta)
  const hora  = `${String(randInt(8,18)).padStart(2,'0')}:${['00','15','30','45'][randInt(0,3)]}`
  // La API espera fecha_hora como ISO datetime (ej: "2026-03-31T10:00")
  const fecha_hora = `${d.toISOString().slice(0, 10)}T${hora}`
  return {
    paciente_id:      pacienteId,
    fecha_hora,
    duracion_minutos: [15,30,45,60][randInt(0,3)],
    motivo:           rand(motivos),
    ...(colaboradorId ? { profesional_id: colaboradorId } : {}),
  }
}

export function fakePago(pacienteId, monto = null) {
  return {
    paciente_id:  pacienteId,
    monto:        monto ?? randFloat(500, 25000),
    metodo_pago:  ['efectivo','tarjeta_debito','tarjeta_credito','transferencia','mercadopago'][randInt(0,4)],
    concepto:     rand(prestNames),
    fecha:        new Date().toISOString().slice(0, 10),
  }
}

export function fakeEvolucion(pacienteId, turnoId = null) {
  return {
    paciente_id:  pacienteId,
    ...(turnoId ? { turno_id: turnoId } : {}),
    descripcion:  `Paciente ${rand(motivos).toLowerCase()}. Se realizó ${rand(prestNames).toLowerCase()}. Sin complicaciones.`,
    monto:        randFloat(1000, 15000),
  }
}

export function fakePresupuesto(pacienteId, prestaciones) {
  const items = prestaciones.slice(0, randInt(1, 4)).map(p => ({
    prestacion_id:  p.id,
    descripcion:    p.nombre ?? rand(prestNames),   // requerido en el INSERT
    cantidad:       randInt(1, 3),
    precio_unitario: p.precio ?? randFloat(500, 8000), // la API espera precio_unitario
  }))
  return { paciente_id: pacienteId, items, observaciones: 'Presupuesto generado por bot QA' }
}

export function fakePlanPago(pacienteId, monto = null) {
  return {
    paciente_id: pacienteId,
    concepto:    `Plan ${rand(prestNames)}`,
    monto_total: monto ?? randFloat(5000, 50000),
    cuotas:      randInt(2, 12),   // la API espera "cuotas", no "num_cuotas"
    frecuencia:  ['semanal','quincenal','mensual'][randInt(0,2)],
  }
}

export function fakeInsumo() {
  const insumos = ['Guantes de látex talla S','Guantes de látex talla M','Barbijo descartable','Campos descartables','Anestesia Articaína','Anestesia Lidocaína','Hilo de sutura 3-0','Cemento de ionómero','Composite A2','Composite A3','Hipoclorito de sodio','EDTA 17%','Fresas de diamante','Fresas de carburo']
  return {
    nombre:       rand(insumos),
    unidad:       ['unidad','caja','frasco','paquete'][randInt(0,3)],
    stock_actual: randInt(5, 200),
    stock_minimo: randInt(5, 20),
    precio_costo: randFloat(100, 5000),
  }
}

export function qaEmail(n, ts) { return `qa-test-${ts}-${n}@clingest-qa.com` }

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
export { randInt, rand }
