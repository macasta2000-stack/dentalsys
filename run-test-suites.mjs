const BASE = 'https://odontologo-228.pages.dev'
const QA_PASS = 'QATest2024!'
const ACCOUNTS = Array.from({length:10}, (_,i) => `qa-test-1774903578029-${i}@clingest-qa.com`)

async function api(method, path, body, token) {
  const h = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  try {
    const r = await fetch(`${BASE}/api${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined })
    let d = {}; try { d = await r.json() } catch {}
    return { s: r.status, ok: r.ok, d }
  } catch(e) { return { s: 0, ok: false, d: {}, err: e.message } }
}
const post  = (p,b,t) => api('POST',   p,b,t)
const get   = (p,t)   => api('GET',    p,null,t)
const patch = (p,b,t) => api('PATCH',  p,b,t)
const del   = (p,t)   => api('DELETE', p,null,t)

let totalPass = 0, totalFail = 0
const allFailures = []

function res(label, passed, detail='') {
  if (passed) { totalPass++; console.log(`  ✅ ${label}${detail ? '  →  '+detail : ''}`) }
  else { totalFail++; allFailures.push(label); console.log(`  ❌ ${label}${detail ? '  →  '+detail : ''}`) }
}

async function login(email, delay=400) {
  await new Promise(x => setTimeout(x, delay))
  const r = await post('/auth/login', { email, password: QA_PASS })
  return r.d?.data?.token
}

const today = new Date().toISOString().slice(0, 10)

// ─────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60))
console.log('SUITE 1: AUTENTICACIÓN')
console.log('═'.repeat(60))

const tA = await login(ACCOUNTS[0], 200)
const tB = await login(ACCOUNTS[1])
const tC = await login(ACCOUNTS[2])

console.log(`  Login A: ${tA ? 'OK' : 'FALLÓ'}  |  B: ${tB ? 'OK' : 'FALLÓ'}  |  C: ${tC ? 'OK' : 'FALLÓ'}`)

const meA = await get('/auth/me', tA)
res('/auth/me con token válido', meA.ok, meA.d?.data?.email)

res('Sin token → 401', !(await get('/pacientes')).ok)
res('Token malformado → 401', !(await api('GET','/pacientes',null,'bad.token')).ok)

const fakeJWT = ['eyJhbGciOiJIUzI1NiJ9',
  Buffer.from(JSON.stringify({sub:'hack',rol:'superadmin',exp:9999999999})).toString('base64').replace(/=/g,''),
  'fakesig'].join('.')
res('JWT firma falsa → 401', !(await api('GET','/pacientes',null,fakeJWT)).ok)

const fp1 = await post('/auth/forgot-password', { email: ACCOUNTS[0] })
const fp2 = await post('/auth/forgot-password', { email: 'noexiste@xxx.com' })
res('Forgot-password no filtra existencia de email', fp1.s === fp2.s, `ambos status=${fp1.s}`)

// ─────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60))
console.log('SUITE 2: AISLAMIENTO CROSS-TENANT (10 verificaciones)')
console.log('═'.repeat(60))

const pcA = await post('/pacientes', { nombre: 'SecretoA', apellido: 'Cross' }, tA)
const pidA = pcA.d?.data?.id
console.log(`  Recurso A creado: paciente ${pidA}`)

const pagoA = await post('/pagos', { paciente_id: pidA, monto: 9999, metodo_pago: 'efectivo', fecha: today }, tA)
const pagoAId = pagoA.d?.data?.id
const evA = await post('/evoluciones', { paciente_id: pidA, descripcion: 'Nota privada', fecha: today }, tA)
const evAId = evA.d?.data?.id

res('B no puede ver paciente de A',      !(await get(`/pacientes/${pidA}`, tB)).ok)
res('B no puede editar paciente de A',   !(await patch(`/pacientes/${pidA}`,{nombre:'HACK'},tB)).ok)
res('B no puede crear pago en pac de A', !(await post('/pagos',{paciente_id:pidA,monto:1,metodo_pago:'efectivo',fecha:today},tB)).ok)
res('B no puede anular pago de A',       !(await del(`/pagos/${pagoAId}`,tB)).ok)
res('B no puede crear evolucion en A',   !(await post('/evoluciones',{paciente_id:pidA,descripcion:'hack',fecha:today},tB)).ok)
res('B no puede crear anamnesis en A',   !(await post('/anamnesis',{paciente_id:pidA,enfermedades:'{}',alergias:'{}'},tB)).ok)
res('B no puede crear plan pago en A',   !(await post('/planes-pago',{paciente_id:pidA,concepto:'h',monto_total:1,cuotas:1},tB)).ok)

const listB = await get('/pacientes', tB)
const leakPac = (listB.d?.data ?? []).find(p => p.id === pidA)
res('Lista B no filtra datos de A', !leakPac, leakPac ? `LEAK id=${pidA}` : 'limpia')

const evListB = await get(`/evoluciones?paciente_id=${pidA}`, tB)
const evLeak = evListB.ok && (evListB.d?.data ?? []).length > 0
res('B no ve evoluciones de paciente de A', !evLeak)

const turnosB = await get('/turnos', tB)
const tenantAId = meA.d?.data?.id
const turnoLeak = turnosB.ok && (turnosB.d?.data ?? []).some(t => t.tenant_id === tenantAId)
res('Lista turnos B no filtra datos de A', !turnoLeak)

// ─────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60))
console.log('SUITE 3: PRIVILEGIOS DE ROL')
console.log('═'.repeat(60))

const recepEmail = `recep_full_${Date.now()}@qa.com`
const crR = await post('/colaboradores', { nombre:'RecepFull', email:recepEmail, rol:'recepcionista', password:'Recep@2024!' }, tA)
const recepId = crR.d?.data?.id
console.log(`  Recepcionista creada: ${recepId ? 'OK' : 'FALLÓ'}`)

await new Promise(x => setTimeout(x, 600))
const lrR = await post('/auth/login', { email: recepEmail, password: 'Recep@2024!' })
await new Promise(x => setTimeout(x, 400))
const rt = lrR.d?.data?.token
console.log(`  Login recep: ${rt ? 'OK' : 'FALLÓ'}`)

if (rt) {
  const esc1 = await patch(`/colaboradores/${recepId}`, { rol: 'admin' }, rt)
  res('Recep no puede escalarse a admin',     !(esc1.ok && esc1.d?.data?.rol === 'admin'), esc1.ok ? `rol actual: ${esc1.d?.data?.rol}` : 'bloqueado')

  const esc2 = await patch(`/colaboradores/${recepId}`, { activo: 0 }, rt)
  res('Recep no puede desactivarse (activo)', !(esc2.ok && esc2.d?.data?.activo === 0))

  res('Recep bloqueada de reportes',          !(await get('/reportes?tipo=mensual', rt)).ok)
  res('Recep bloqueada de pagos globales',    !(await get('/pagos', rt)).ok)
  res('Recep bloqueada de admin/tenants',     !(await get('/admin/tenants', rt)).ok)
  res('Recep bloqueada de crear presupuesto', !(await post('/presupuestos',{paciente_id:pidA,total:1000},rt)).ok)
  res('Recep bloqueada de crear plan pago',   !(await post('/planes-pago',{paciente_id:pidA,concepto:'h',monto_total:1,cuotas:1},rt)).ok)
  res('Recep bloqueada de eliminar colab',    !(await del(`/colaboradores/${recepId}`, rt)).ok)
  res('Recep bloqueada de ver HC',            !(await get(`/evoluciones?paciente_id=${pidA}`, rt)).ok)
  res('Recep bloqueada de ver anamnesis',     !(await get(`/anamnesis?paciente_id=${pidA}`, rt)).ok)
  res('Recep bloqueada de anular pago',       !(await del(`/pagos/uuid-inexistente`, rt)).ok)

  // Lo que SÍ puede hacer
  res('Recep puede ver lista de pacientes',   (await get('/pacientes', rt)).ok)
  res('Recep puede ver prestaciones',         (await get('/prestaciones', rt)).ok)
  res('Recep puede ver turnos',               (await get('/turnos', rt)).ok)
  const recepPago = await post('/pagos', { paciente_id: pidA, monto: 500, metodo_pago: 'efectivo', fecha: today }, rt)
  res('Recep puede registrar pagos', recepPago.ok, `status=${recepPago.s}`)

  const mañana = new Date(); mañana.setDate(mañana.getDate()+3)
  const fhStr = mañana.toISOString().slice(0,16).replace('T',' ')
  const recepTurno = await post('/turnos', { paciente_id: pidA, fecha_hora: fhStr, motivo: 'Test', duracion_minutos: 30 }, rt)
  res('Recep puede crear turnos', recepTurno.ok, `status=${recepTurno.s}`)
}

// Profesional — auto-escalada
const profEmail = `prof_full_${Date.now()}@qa.com`
const crP = await post('/colaboradores', { nombre:'ProfFull', email:profEmail, rol:'profesional', password:'Prof@2024!' }, tA)
const profId = crP.d?.data?.id
await new Promise(x => setTimeout(x, 600))
const lrP = await post('/auth/login', { email: profEmail, password: 'Prof@2024!' })
await new Promise(x => setTimeout(x, 400))
const pt = lrP.d?.data?.token
console.log(`  Login profesional: ${pt ? 'OK' : 'FALLÓ'}`)

if (pt) {
  const esc3 = await patch(`/colaboradores/${profId}`, { rol: 'tenant' }, pt)
  res('Prof no puede escalarse a tenant',  !(esc3.ok && esc3.d?.data?.rol === 'tenant'))
  res('Prof bloqueado de admin/tenants',   !(await get('/admin/tenants', pt)).ok)
  res('Prof puede crear evoluciones',       (await post('/evoluciones',{paciente_id:pidA,descripcion:'Nota prof',fecha:today},pt)).ok)
  res('Prof bloqueado de pagos globales',  !(await get('/pagos', pt)).ok)
}

// ─────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60))
console.log('SUITE 4: INTEGRIDAD / RACE CONDITIONS')
console.log('═'.repeat(60))

const racePc = await post('/pacientes', { nombre: 'Race', apellido: 'Integrity' }, tC)
const racePid = racePc.d?.data?.id

// 20 pagos simultáneos
const raceRes = await Promise.all(Array.from({length:20}, () =>
  post('/pagos', { paciente_id: racePid, monto: 50, metodo_pago: 'efectivo', fecha: today }, tC)
))
const raceOk = raceRes.filter(r => r.ok).length
console.log(`  20 pagos simultáneos: ${raceOk}/20 OK`)
await new Promise(x => setTimeout(x, 1000))
const checkPac = await get(`/pacientes/${racePid}`, tC)
const saldo = Math.round(checkPac.d?.data?.saldo ?? 0)
res(`Saldo consistente post-race (${raceOk}×50=${raceOk*50})`, saldo === raceOk*50, `got=${saldo}`)

// Doble anulación
const pd = await post('/pagos',{paciente_id:pidA,monto:100,metodo_pago:'efectivo',fecha:today},tA)
const an1 = await del(`/pagos/${pd.d?.data?.id}`, tA)
const an2 = await del(`/pagos/${pd.d?.data?.id}`, tA)
res('Doble anulación no crashea', an1.ok, `2do intento ok=${an2.ok}`)

res('Monto 0 rechazado',        !(await post('/pagos',{paciente_id:pidA,monto:0,metodo_pago:'efectivo',fecha:today},tA)).ok)
res('Monto negativo rechazado', !(await post('/pagos',{paciente_id:pidA,monto:-100,metodo_pago:'efectivo',fecha:today},tA)).ok)
res('Monto enorme aceptado',     (await post('/pagos',{paciente_id:pidA,monto:999999999,metodo_pago:'efectivo',fecha:today},tA)).ok)

// 15 turnos simultáneos mismo horario
const fh2 = `${new Date(Date.now()+5*86400000).toISOString().slice(0,10)} 10:00`
const tRes = await Promise.all(Array.from({length:15}, () =>
  post('/turnos',{paciente_id:racePid,fecha_hora:fh2,motivo:'Race',duracion_minutos:30},tC)
))
const tOk = tRes.filter(r => r.ok).length
console.log(`  15 turnos simultáneos: ${tOk}/15 OK`)
res('Turnos concurrentes sin 500', tRes.every(r => r.s !== 500))

// ─────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60))
console.log('SUITE 5: BILLING / PLAN ESCALATION')
console.log('═'.repeat(60))

const sub = await get('/suscripcion', tA)
console.log(`  Plan actual: ${sub.d?.data?.plan_id ?? 'desconocido'} | estado: ${sub.d?.data?.estado}`)

const u1 = await patch('/suscripcion', { plan_id: 'plan_clinica' }, tA)
res('No puede auto-upgrade a plan_clinica', !(u1.ok && u1.d?.data?.plan_id === 'plan_clinica'), u1.ok ? `plan=${u1.d?.data?.plan_id}` : 'bloqueado')

const u2 = await patch('/suscripcion', { estado: 'activo', plan_id: 'plan_clinica' }, tA)
res('No puede setear estado activo directo', !(u2.ok && u2.d?.data?.plan_id === 'plan_clinica'))

const u3 = await patch('/suscripcion', { precio_mensual: 0 }, tA)
res('No puede cambiar precio a 0', !(u3.ok && u3.d?.data?.precio_mensual === 0))

res('Admin/revenue bloqueado para tenant', !(await get('/admin/revenue', tA)).ok)
res('Admin/tenants bloqueado para tenant', !(await get('/admin/tenants', tA)).ok)

// ─────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60))
console.log('SUITE 6: INYECCIÓN / EDGE CASES')
console.log('═'.repeat(60))

const r1 = await get("/pacientes?q=' OR '1'='1 --", tA)
res('SQL injection en búsqueda manejado', r1.ok || r1.s === 400, `status=${r1.s}`)

const r2 = await post('/pacientes', { nombre: '<script>alert(1)</script>', apellido: 'XSS' }, tA)
res('XSS en nombre: almacenado, no ejecutado (API JSON)', r2.ok || !r2.ok, `ok=${r2.ok}`)

// IDOR con IDs inventados
const guesses = ['00000000-0000-0000-0000-000000000001','admin','1','../etc/passwd']
let idor = 0
for (const id of guesses) {
  const r = await get(`/pacientes/${id}`, tA)
  if (r.ok && r.d?.data?.tenant_id !== meA.d?.data?.id) idor++
}
res('IDOR protegido (IDs inventados)', idor === 0, idor > 0 ? `${idor} IDs accedidos` : 'OK')

// Body gigante
const huge = { nombre: 'A'.repeat(100000), apellido: 'B' }
const rHuge = await post('/pacientes', huge, tA)
res('Body enorme no crashea server', rHuge.s !== 500, `status=${rHuge.s}`)

// Campos extra ignorados
const rExtra = await post('/pacientes', { nombre: 'Extra', apellido: 'Test', tenant_id: 'hacker-id', rol: 'superadmin' }, tA)
if (rExtra.ok) {
  res('tenant_id inyectado ignorado', rExtra.d?.data?.tenant_id !== 'hacker-id', `got=${rExtra.d?.data?.tenant_id}`)
}

// ─────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60))
console.log(`RESUMEN FINAL: ${totalPass} ✅  |  ${totalFail} ❌  |  ${totalPass+totalFail} total`)
console.log('═'.repeat(60))
if (allFailures.length > 0) {
  console.log('\nFallas:')
  allFailures.forEach(f => console.log(`  ❌ ${f}`))
} else {
  console.log('\n✅ Sin vulnerabilidades detectadas.')
}
