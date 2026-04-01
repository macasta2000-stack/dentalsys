const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const TENANT = 'dad94e2d-ed23-488d-9d02-9fb53a46b791'

function uid() { return crypto.randomUUID() }
function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function rndInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }

const NOMBRES_M = ['Juan','Carlos','Diego','Pablo','Martin','Rodrigo','Facundo','Gaston','Leandro','Matias','Nicolas','Sebastian','Franco','Agustin','Tomas','Ezequiel','Damian','Maximiliano','Luciano','Ramiro','Adrian','Alejandro','Cristian','Emanuel','Esteban','Federico','Gonzalo','Hernan','Ignacio','Javier']
const NOMBRES_F = ['Maria','Ana','Laura','Sofia','Valentina','Camila','Florencia','Natalia','Claudia','Paola','Gabriela','Romina','Veronica','Cecilia','Marcela','Silvina','Andrea','Valeria','Lucia','Carolina','Alejandra','Beatriz','Cristina','Daniela','Elena','Fernanda','Graciela','Helena','Isabel','Jessica']
const APELLIDOS = ['Gonzalez','Rodriguez','Gomez','Fernandez','Lopez','Diaz','Martinez','Perez','Garcia','Sanchez','Romero','Sosa','Torres','Alvarez','Ruiz','Ramirez','Flores','Acosta','Medina','Herrera','Castro','Suarez','Molina','Ortega','Delgado','Navarro','Mendoza','Moreno','Cabrera','Vargas','Vega','Guerrero','Ramos','Cruz','Reyes','Rios','Silva','Gutierrez','Pereyra','Espinoza','Aguilar','Bustos','Carrizo','Duarte','Ferreyra','Ibanez','Juarez','Luna','Munoz','Nunez']
const OBRAS_SOCIALES = ['OSDE','Swiss Medical','IOMA','PAMI','Medicus','Galeno','OSECAC','OMINT','Particular','Particular','Particular','OSPEDYC','OSSEG','DOSUBA','Union Personal','OSDIPP']
const PROVINCIAS_TEL = ['11','351','341','342','261','291','299','223','221','387']
const NOTAS_MEDICAS = ['Diabetes tipo 2. Consultar antes de medicar.','Hipertension arterial controlada.','Alergia a penicilina - usar clindamicina.','Anticoagulado con acenocumarol.','Cardiopatia - profilaxis antibiotica previa.','Asma bronquial. Evitar AINES.']

const PROF_DATA = [
  { nombre: 'Diego', apellido: 'Mendez', matricula: 'MP 18432', email: 'diego.mendez.odonto@gmail.com', color: '#4F46E5', duracion: 30, ppd: 18 },
  { nombre: 'Sofia', apellido: 'Rodriguez', matricula: 'MP 22187', email: 'sofia.rodriguez.orto@gmail.com', color: '#059669', duracion: 45, ppd: 16 },
  { nombre: 'Carlos', apellido: 'Beltran', matricula: 'MP 15903', email: 'carlos.beltran.endo@gmail.com', color: '#DC2626', duracion: 60, ppd: 10 },
  { nombre: 'Laura', apellido: 'Vega', matricula: 'MP 19876', email: 'laura.vega.pedia@gmail.com', color: '#D97706', duracion: 45, ppd: 14 },
  { nombre: 'Pablo', apellido: 'Soria', matricula: 'MP 21345', email: 'pablo.soria.perio@gmail.com', color: '#7C3AED', duracion: 45, ppd: 12 },
]
const PROFESIONALES = PROF_DATA.map(p => ({ ...p, id: uid() }))
const HASH = 'pbkdf2:266709b9fb9e790cc59d2f44ed37cd16:deea091a4bcc57112da52ffeceeb09507e70b11d0284d6500e502d9221f40a5c'

const COLABS = PROFESIONALES.map(p => ({
  id: p.id, tenant_id: TENANT,
  nombre: p.nombre, apellido: p.apellido, email: p.email,
  rol: 'profesional', matricula: p.matricula,
  password_hash: HASH, activo: 1,
  duracion_default: p.duracion, color: p.color
}))

const PACIENTES = []
for (let i = 0; i < 300; i++) {
  const sexo = Math.random() > 0.5 ? 'masculino' : 'femenino'
  const nombre = rnd(sexo === 'masculino' ? NOMBRES_M : NOMBRES_F)
  const apellido = rnd(APELLIDOS)
  const edad = rndInt(4, 82)
  const os = rnd(OBRAS_SOCIALES)
  PACIENTES.push({
    id: uid(), tenant_id: TENANT,
    nombre, apellido, sexo,
    fecha_nacimiento: `${2025 - edad}-${String(rndInt(1,12)).padStart(2,'0')}-${String(rndInt(1,28)).padStart(2,'0')}`,
    dni: String(rndInt(10000000, 45000000)),
    telefono: `${rnd(PROVINCIAS_TEL)}-${rndInt(1000,9999)}-${rndInt(1000,9999)}`,
    email: `${nombre.toLowerCase()}${apellido.toLowerCase()}${rndInt(1,99)}@gmail.com`,
    obra_social: os === 'Particular' ? null : os,
    numero_afiliado: os !== 'Particular' ? String(rndInt(10000000, 99999999)) : null,
    estado: i < 280 ? 'activo' : 'archivado',
    saldo: 0,
    notas: Math.random() > 0.72 ? rnd(NOTAS_MEDICAS) : null
  })
}

// Schema real: medicacion (no medicamentos), embarazada (no embarazo)
const ENFS = ['diabetes','hipertension','cardiopatia','epilepsia','asma','artritis']
const MEDS_AN = ['metformina 850mg','enalapril 10mg','losartan 50mg','atenolol 25mg','sertralina 50mg','levotiroxina 50mcg']
const ANAMNESIS_LIST = []
for (const p of PACIENTES) {
  if (Math.random() > 0.3) {
    ANAMNESIS_LIST.push({
      id: uid(), tenant_id: TENANT, paciente_id: p.id,
      enfermedades: JSON.stringify(Math.random() > 0.6 ? [rnd(ENFS)] : []),
      medicacion: JSON.stringify(Math.random() > 0.5 ? [rnd(MEDS_AN)] : []),
      alergias: Math.random() > 0.8 ? rnd(['Penicilina','Ibuprofeno','Latex','AINES','Aspirina']) : null,
      embarazada: p.sexo === 'femenino' && Math.random() > 0.93 ? 1 : 0,
      fumador: Math.random() > 0.75 ? 1 : 0,
      updated_at: `2025-0${rndInt(1,3)}-${String(rndInt(1,28)).padStart(2,'0')}`
    })
  }
}

// Schema real: fecha_hora (no fecha+hora), duracion_minutos (no duracion)
// Estados válidos: programado, confirmado, presente, completado, ausente, cancelado
const MOTIVOS = [
  ['Consulta y revision','Control semestral','Dolor dental','Extraccion','Obturacion composite','Limpieza y detartraje','Urgencia odontologica','Primera consulta','Tratamiento de conducto','Blanqueamiento dental'],
  ['Control mensual ortodoncia','Colocacion brackets','Ajuste arcos','Retencion post-tratamiento','Consulta inicial ortodoncia','Correccion maloclusion','Expansion palatina'],
  ['Tratamiento de conducto molar','Tratamiento de conducto premolar','Retratamiento endodontico','Pulpotomia','Apicoformacion'],
  ['Control preventivo','Sellante de fosas','Topicacion fluor','Extraccion temporario','Obturacion ART','Primera visita al dentista','Mantenedor de espacio'],
  ['Raspaje y alisado radicular','Control periodontal','Cirugia periodontal','Curetaje','Mantenimiento periodontal','Reevaluacion post-tratamiento']
]
const EST_PASADO = ['completado','completado','completado','completado','completado','cancelado','ausente']
const EST_FUTURO  = ['programado','programado','programado','confirmado','confirmado']

function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate()+n); return r }
function fmtD(d) { return d.toISOString().split('T')[0] }

const PACS_ACT = PACIENTES.filter(p => p.estado === 'activo')
const TURNOS = []

function makeTurnos(inicio, fin, estadoFn, ppdMult) {
  ppdMult = ppdMult || 1
  for (const [pi, prof] of PROFESIONALES.entries()) {
    let d = new Date(inicio)
    while (d <= new Date(fin)) {
      const dw = d.getDay()
      if (dw >= 1 && dw <= 5) {
        let hora = 8 * 60
        const ppd = Math.floor(prof.ppd * ppdMult)
        for (let t = 0; t < ppd; t++) {
          const pac = rnd(PACS_ACT)
          const dur = prof.duracion + (Math.random() > 0.7 ? 15 : 0)
          const hh = String(Math.floor(hora/60)).padStart(2,'0')
          const mm = String(hora%60).padStart(2,'0')
          TURNOS.push({
            id: uid(), tenant_id: TENANT, paciente_id: pac.id,
            profesional_id: prof.id,
            fecha_hora: `${fmtD(d)} ${hh}:${mm}`,
            duracion_minutos: dur,
            motivo: rnd(MOTIVOS[pi]),
            estado: estadoFn(),
            notas: Math.random() > 0.9 ? 'Primera vez' : null
          })
          hora += dur + 5
          if (hora >= 20 * 60) break
        }
      }
      d = addDays(d, 1)
    }
  }
}

makeTurnos('2025-01-06', '2026-03-27', () => rnd(EST_PASADO), 1)
makeTurnos('2026-03-30', '2026-12-31', () => rnd(EST_FUTURO), 0.6)

const MONTOS = [[8000,10000,12000,15000,20000,25000,7000,18000],[15000,20000,25000,8000,12000],[35000,40000,45000,50000,30000],[5000,7000,8000,6000,4000],[20000,25000,30000,15000,18000]]
const METODOS = ['efectivo','efectivo','efectivo','transferencia','transferencia','tarjeta_debito','tarjeta_credito']
const PAGOS = []
const pacSaldos = {}
const turnosComp = TURNOS.filter(t => t.estado === 'completado')

for (const t of turnosComp) {
  if (Math.random() > 0.15) {
    const pi = PROFESIONALES.findIndex(p => p.id === t.profesional_id)
    const monto = rnd(MONTOS[pi] || MONTOS[0])
    const pac = PACIENTES.find(p => p.id === t.paciente_id)
    const montoOS = pac?.obra_social ? Math.round(monto * rnd([0.4,0.5,0.6,0.7])) : 0
    const anulado = Math.random() > 0.97 ? 1 : 0
    const fecha = t.fecha_hora.split(' ')[0]
    PAGOS.push({ id: uid(), tenant_id: TENANT, paciente_id: t.paciente_id, turno_id: t.id, monto, monto_os: montoOS, monto_copago: monto - montoOS, metodo_pago: rnd(METODOS), fecha, anulado, concepto: t.motivo, notas: null })
    if (!anulado) { pacSaldos[t.paciente_id] = (pacSaldos[t.paciente_id] || 0) + monto }
  }
}

// evoluciones: sin profesional_id ni profesional_nombre en schema
const PROCS = [
  ['Extraccion simple. Sin complicaciones.','Obturacion clase II composite. Buen resultado estetico.','Detartraje supragingival. Instruccion de higiene.','Urgencia resuelta. Prescripcion antibiotica.','Control. Sin caries activas.'],
  ['Control mensual brackets. Cambio arco 0.16 NiTi.','Ajuste ligaduras. Evolucion satisfactoria.','Instalacion retenedor superior e inferior.','Impresiones para modelos de estudio.','Consulta inicial. Plan de tratamiento acordado.'],
  ['Tratamiento de conducto. LT 21mm.','Condensacion lateral fria con gutapercha.','Retratamiento endodontico. Obturacion deficiente retirada.','Conductometria con localizador de apice.','Urgencia endodontica. Apertura cameral.'],
  ['Topicacion con fluor gel 1.23%.','Sellante de fosas y fisuras. Excelente retencion.','Extraccion diente temporario. Sin incidentes.','Primera visita. Sin patologia activa.','Control preventivo. Tecnica de cepillado ensenada.'],
  ['Raspaje y alisado radicular cuadrante sup der.','Curetaje subgingival. Sangrado reducido.','Sondaje periodontal. PS 4-6mm generalizado.','Control periodontal mensual. Mejoria notable.','Cirugia colgajo acceso. Sin complicaciones.']
]
const EVOLUCIONES = []
for (const t of turnosComp) {
  if (Math.random() > 0.2) {
    const pi = PROFESIONALES.findIndex(p => p.id === t.profesional_id)
    const monto = Math.random() > 0.3 ? rnd(MONTOS[pi]||MONTOS[0]) : 0
    EVOLUCIONES.push({ id: uid(), tenant_id: TENANT, paciente_id: t.paciente_id, fecha: t.fecha_hora.split(' ')[0], descripcion: rnd(PROCS[pi]||PROCS[0]), monto, tipo: monto > 0 ? 'prestacion' : 'consulta' })
  }
}

const MEDS_R = ['Amoxicilina 500mg - 1 comp cada 8hs por 7 dias','Ibuprofeno 400mg - 1 comp cada 8hs','Clindamicina 300mg - 1 comp cada 8hs por 7 dias','Metronidazol 500mg - 1 comp cada 8hs por 5 dias','Ketoprofeno 100mg - 1 comp cada 12hs','Dexametasona 4mg - 1 comp cada 12hs por 3 dias','Diclofenac 50mg - 1 comp cada 8hs','Clorhexidina 0.12% - enjuagar 30seg 2 veces al dia']
const RECETAS = []
const recBase = turnosComp.filter(() => Math.random() > 0.75).slice(0, 500)
for (const t of recBase) {
  const prof = PROFESIONALES.find(p => p.id === t.profesional_id)
  RECETAS.push({ id: uid(), tenant_id: TENANT, paciente_id: t.paciente_id, profesional_id: prof.id, profesional_nombre: prof.nombre + ' ' + prof.apellido, profesional_matricula: prof.matricula, fecha: t.fecha_hora.split(' ')[0], medicamentos: JSON.stringify([rnd(MEDS_R), ...(Math.random() > 0.6 ? [rnd(MEDS_R)] : [])]), indicaciones: rnd(['Tomar con alimentos','No mezclar con alcohol','Completar el tratamiento aunque mejore','Suspender si hay reaccion alergica y consultar']) })
}

// presupuestos: sin 'titulo', estados: pendiente/aprobado/rechazado/en_curso/completado/vencido
const CATALOG = [{desc:'Consulta y diagnostico',precio:8000},{desc:'Extraccion simple',precio:12000},{desc:'Extraccion compleja',precio:20000},{desc:'Obturacion composite 1 cara',precio:10000},{desc:'Obturacion composite 2 caras',precio:14000},{desc:'Tratamiento de conducto uniradicular',precio:35000},{desc:'Tratamiento de conducto multiradicular',precio:50000},{desc:'Instalacion sistema de brackets completo',precio:180000},{desc:'Control mensual ortodoncia',precio:15000},{desc:'Corona porcelana',precio:80000},{desc:'Implante oseointegrado',precio:250000},{desc:'Limpieza profunda',precio:12000},{desc:'Blanqueamiento dental',precio:45000},{desc:'Sellante por pieza',precio:5000},{desc:'Protesis parcial removible',precio:120000},{desc:'Raspaje cuadrante',precio:18000}]
const ESTADOS_PRES = ['pendiente','aprobado','aprobado','aprobado','rechazado','en_curso','completado']
const PRESUPUESTOS = [], PRES_ITEMS = []
for (const pac of PACS_ACT.slice(0, 120)) {
  const presId = uid()
  let total = 0
  const items = []
  for (let i = 0; i < rndInt(2,6); i++) {
    const item = rnd(CATALOG), cant = rndInt(1,3)
    items.push({ id: uid(), presupuesto_id: presId, tenant_id: TENANT, descripcion: item.desc, cantidad: cant, precio_unitario: item.precio, subtotal: cant*item.precio, orden: i+1 })
    total += cant * item.precio
  }
  PRESUPUESTOS.push({ id: presId, tenant_id: TENANT, paciente_id: pac.id, notas: 'Plan de tratamiento ' + rnd(['integral','preventivo','estetico','correctivo','de mantenimiento']), estado: rnd(ESTADOS_PRES), total, fecha: `2025-${String(rndInt(1,12)).padStart(2,'0')}-${String(rndInt(1,28)).padStart(2,'0')}` })
  items.forEach(it => PRES_ITEMS.push(it))
}

function esc(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  return "'" + String(v).replace(/'/g, "''") + "'"
}
function insertSQL(table, rows, chunk) {
  chunk = chunk || 150
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const parts = []
  for (let i = 0; i < rows.length; i += chunk) {
    const ch = rows.slice(i, i + chunk)
    parts.push('INSERT OR IGNORE INTO ' + table + ' (' + cols.join(',') + ') VALUES\n' + ch.map(r => '(' + cols.map(c => esc(r[c])).join(',') + ')').join(',\n') + ';')
  }
  return parts.join('\n')
}

const saldoSQL = Object.entries(pacSaldos).map(([id,s]) => `UPDATE pacientes SET saldo = ${s} WHERE id = '${id}';`).join('\n')

const sql = ['-- DentalSys Full Seed', insertSQL('colaboradores',COLABS), insertSQL('pacientes',PACIENTES,100), insertSQL('anamnesis',ANAMNESIS_LIST,100), insertSQL('turnos',TURNOS,250), insertSQL('pagos',PAGOS,200), insertSQL('evoluciones',EVOLUCIONES,200), insertSQL('recetas',RECETAS,200), insertSQL('presupuestos',PRESUPUESTOS,100), insertSQL('presupuesto_items',PRES_ITEMS,200), saldoSQL].join('\n\n')

const outSQL = path.join(__dirname, 'seed_dentalsys.sql')
fs.writeFileSync(outSQL, sql)

// Split
const MAX = 3 * 1024 * 1024
const secs = sql.split('\n\n').filter(s => s.trim())
const chunks = []
let cur = ''
for (const sec of secs) {
  if (cur.length + sec.length > MAX && cur) { chunks.push(cur); cur = sec }
  else { cur += (cur ? '\n\n' : '') + sec }
}
if (cur) chunks.push(cur)
chunks.forEach((c, i) => fs.writeFileSync(path.join(__dirname, `seed_part${i+1}.sql`), c))

console.log(JSON.stringify({ profesionales: COLABS.length, pacientes: PACIENTES.length, anamnesis: ANAMNESIS_LIST.length, turnos_total: TURNOS.length, turnos_completados: turnosComp.length, turnos_futuros: TURNOS.filter(t=>['programado','confirmado'].includes(t.estado)).length, pagos: PAGOS.length, evoluciones: EVOLUCIONES.length, recetas: RECETAS.length, presupuestos: PRESUPUESTOS.length, pres_items: PRES_ITEMS.length, sql_mb: (fs.statSync(outSQL).size/1024/1024).toFixed(2), partes: chunks.length, partes_info: chunks.map((c,i)=>`part${i+1}: ${(c.length/1024).toFixed(0)}KB`) }, null, 2))
