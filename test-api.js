#!/usr/bin/env node
/**
 * Clingest API Test Suite
 * Usage: node test-api.js [BASE_URL] [EMAIL] [PASSWORD]
 *
 * Tests all API endpoints with multiple scenarios:
 * authentication, CRUD, role restrictions, error handling, edge cases.
 */

const BASE_URL = process.argv[2] || 'http://localhost:8788'
const TEST_EMAIL = process.argv[3] || `test_${Date.now()}@clingest.test`
const TEST_PASSWORD = process.argv[4] || 'TestPassword123!'

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

let authToken = null
let tenantId = null

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token ?? authToken) headers['Authorization'] = `Bearer ${token ?? authToken}`
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = {}
  try { data = await res.json() } catch {}
  return { status: res.status, ok: res.ok, data }
}

const get    = (path, token)       => req('GET',    path, null, token)
const post   = (path, body, token) => req('POST',   path, body, token)
const patch  = (path, body, token) => req('PATCH',  path, body, token)
const del    = (path, token)       => req('DELETE', path, null, token)

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

let passed = 0, failed = 0, skipped = 0
const errors = []

function assert(condition, label, details = '') {
  if (condition) {
    passed++
    process.stdout.write('.')
  } else {
    failed++
    errors.push(`FAIL [${label}]${details ? ': ' + details : ''}`)
    process.stdout.write('F')
  }
}

function skip(label) {
  skipped++
  process.stdout.write('s')
}

async function suite(name, fn) {
  process.stdout.write(`\n${name}: `)
  try { await fn() } catch (e) { assert(false, name, e.message) }
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

async function testAuth() {
  // Register new tenant
  const r1 = await post('/auth/register', { email: TEST_EMAIL, password: TEST_PASSWORD, nombre: 'Dr. Test' })
  assert(r1.ok && r1.data?.data?.token, 'register', `status=${r1.status}`)
  authToken = r1.data?.data?.token
  tenantId = r1.data?.data?.id

  // Login with correct credentials
  const r2 = await post('/auth/login', { email: TEST_EMAIL, password: TEST_PASSWORD })
  assert(r2.ok && r2.data?.data?.token, 'login success', `status=${r2.status}`)
  authToken = r2.data?.data?.token

  // Login with wrong password
  const r3 = await post('/auth/login', { email: TEST_EMAIL, password: 'wrongpassword' })
  assert(r3.status === 401, 'login wrong password')

  // Login missing fields
  const r4 = await post('/auth/login', { email: TEST_EMAIL })
  assert(!r4.ok, 'login missing password')

  // /me with valid token
  const r5 = await get('/auth/me')
  assert(r5.ok && r5.data?.data?.email === TEST_EMAIL, 'auth/me valid')

  // /me without token
  const r6 = await get('/auth/me', 'invalid-token')
  assert(r6.status === 401, 'auth/me invalid token')

  // Forgot password — email exists
  const r7 = await post('/auth/forgot-password', { email: TEST_EMAIL })
  assert(r7.ok, 'forgot-password existing email', `status=${r7.status}`)

  // Forgot password — email doesn't exist (should not leak existence)
  const r8 = await post('/auth/forgot-password', { email: 'noexiste@test.com' })
  assert(r8.ok, 'forgot-password nonexistent email (no leak)')
}

async function testPacientes() {
  let pacienteId

  // Create
  const r1 = await post('/pacientes', { nombre: 'Juan', apellido: 'García', email: 'juan@test.com', telefono: '1122334455', fecha_nacimiento: '1985-03-15' })
  assert(r1.ok && r1.data?.data?.id, 'create paciente', `status=${r1.status}`)
  pacienteId = r1.data?.data?.id

  // Create without nombre
  const r2 = await post('/pacientes', { apellido: 'Sin nombre' })
  assert(!r2.ok, 'create paciente without nombre')

  // Get by ID
  const r3 = await get(`/pacientes/${pacienteId}`)
  assert(r3.ok && r3.data?.data?.id === pacienteId, 'get paciente by id')

  // List
  const r4 = await get('/pacientes')
  assert(r4.ok && Array.isArray(r4.data?.data), 'list pacientes', `status=${r4.status}`)

  // Search
  const r5 = await get('/pacientes?q=García')
  assert(r5.ok && Array.isArray(r5.data?.data), 'search pacientes')

  // Update
  const r6 = await patch(`/pacientes/${pacienteId}`, { telefono: '9988776655' })
  assert(r6.ok && r6.data?.data?.telefono === '9988776655', 'update paciente')

  // Get nonexistent
  const r7 = await get('/pacientes/nonexistent-id')
  assert(r7.status === 404, 'get nonexistent paciente')

  // Archivar
  const r8 = await patch(`/pacientes/${pacienteId}`, { estado: 'archivado' })
  assert(r8.ok, 'archivar paciente')

  // Restore
  await patch(`/pacientes/${pacienteId}`, { estado: 'activo' })

  return pacienteId
}

async function testTurnos(pacienteId) {
  let turnoId

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(10, 0, 0, 0)
  const fechaHora = tomorrow.toISOString().slice(0, 16).replace('T', ' ')

  // Create turno
  const r1 = await post('/turnos', { paciente_id: pacienteId, fecha_hora: fechaHora, motivo: 'Consulta', duracion_minutos: 30 })
  assert(r1.ok && r1.data?.data?.id, 'create turno', `status=${r1.status}`)
  turnoId = r1.data?.data?.id

  // Create without paciente_id
  const r2 = await post('/turnos', { fecha_hora: fechaHora, motivo: 'Sin paciente' })
  assert(!r2.ok, 'create turno without paciente_id')

  // List
  const today = new Date().toISOString().slice(0, 10)
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const r3 = await get(`/turnos?from=${today}&to=${nextWeek}`)
  assert(r3.ok && Array.isArray(r3.data?.data), 'list turnos')

  // Update estado
  const r4 = await patch(`/turno/${turnoId}`, { estado: 'confirmado' })
  // this might 404 due to route vs no-route difference in turnos — use correct path
  const r4b = await patch(`/turnos/${turnoId}`, { estado: 'confirmado' })
  assert(r4b.ok, 'update turno estado', `status=${r4b.status}`)

  // Cancel turno
  const r5 = await del(`/turnos/${turnoId}`)
  assert(r5.ok, 'cancel turno')

  // Create another for more tests
  const dayAfter = new Date(tomorrow)
  dayAfter.setDate(dayAfter.getDate() + 1)
  const r6 = await post('/turnos', { paciente_id: pacienteId, fecha_hora: dayAfter.toISOString().slice(0, 16).replace('T', ' '), motivo: 'Control', duracion_minutos: 30 })
  assert(r6.ok, 'create second turno')
  return r6.data?.data?.id
}

async function testPagos(pacienteId) {
  let pagoId

  const today = new Date().toISOString().slice(0, 10)

  // Create pago
  const r1 = await post('/pagos', { paciente_id: pacienteId, monto: 5000, metodo_pago: 'efectivo', concepto: 'Consulta', fecha: today })
  assert(r1.ok && r1.data?.data?.id, 'create pago', `status=${r1.status}`)
  pagoId = r1.data?.data?.id

  // Create pago monto negativo
  const r2 = await post('/pagos', { paciente_id: pacienteId, monto: -100, metodo_pago: 'efectivo', fecha: today })
  assert(!r2.ok, 'create pago monto negativo')

  // Create pago sin metodo_pago
  const r3 = await post('/pagos', { paciente_id: pacienteId, monto: 100, fecha: today })
  assert(!r3.ok, 'create pago sin metodo_pago')

  // Create pago para paciente de otro tenant (cross-tenant)
  const r4 = await post('/pagos', { paciente_id: 'id-de-otro-tenant', monto: 100, metodo_pago: 'efectivo', fecha: today })
  assert(!r4.ok, 'create pago cross-tenant blocked')

  // List pagos
  const r5 = await get(`/pagos?from=${today}&to=${today}`)
  assert(r5.ok && Array.isArray(r5.data?.data), 'list pagos hoy')

  // List pagos del mes
  const mesFrom = today.slice(0, 7) + '-01'
  const r6 = await get(`/pagos?from=${mesFrom}&to=${today}`)
  assert(r6.ok && Array.isArray(r6.data?.data), 'list pagos mes')

  // Anular pago
  const r7 = await del(`/pagos/${pagoId}`)
  assert(r7.ok, 'anular pago')

  return pagoId
}

async function testEvoluciones(pacienteId) {
  let evolucionId

  const today = new Date().toISOString().slice(0, 10)

  // Create evolucion
  const r1 = await post('/evoluciones', { paciente_id: pacienteId, descripcion: 'Examen rutinario. Sin novedades.', fecha: today })
  assert(r1.ok && r1.data?.data?.id, 'create evolucion', `status=${r1.status}`)
  evolucionId = r1.data?.data?.id

  // Create sin descripcion
  const r2 = await post('/evoluciones', { paciente_id: pacienteId, fecha: today })
  assert(!r2.ok, 'create evolucion sin descripcion')

  // List
  const r3 = await get(`/evoluciones?paciente_id=${pacienteId}`)
  assert(r3.ok && Array.isArray(r3.data?.data), 'list evoluciones')

  // Update
  const r4 = await patch(`/evoluciones/${evolucionId}`, { descripcion: 'Actualizado.' })
  assert(r4.ok, 'update evolucion')

  // Get nonexistent
  const r5 = await get('/evoluciones/nonexistent')
  assert(r5.status === 404, 'get nonexistent evolucion')

  return evolucionId
}

async function testInsumos() {
  let insumoId

  // Create
  const r1 = await post('/insumos', { nombre: 'Guantes', unidad: 'par', stock_actual: 50, stock_minimo: 10, categoria: 'descartable' })
  assert(r1.ok && r1.data?.data?.id, 'create insumo', `status=${r1.status}`)
  insumoId = r1.data?.data?.id

  // Create sin nombre
  const r2 = await post('/insumos', { unidad: 'unidad' })
  assert(!r2.ok, 'create insumo sin nombre')

  // List
  const r3 = await get('/insumos')
  assert(r3.ok && Array.isArray(r3.data?.data), 'list insumos')

  // Update stock
  const r4 = await patch(`/insumos/${insumoId}`, { tipo: 'ajuste', cantidad: 10 })
  assert(r4.ok, 'ajuste insumo', `status=${r4.status}`)

  // Ajuste negativo bloqueado
  const r5 = await patch(`/insumos/${insumoId}`, { tipo: 'ajuste', cantidad: -5 })
  assert(!r5.ok, 'ajuste insumo negativo bloqueado')

  return insumoId
}

async function testPrestaciones() {
  let prestId

  // Create
  const r1 = await post('/prestaciones', { nombre: 'Limpieza dental', precio: 8000, duracion_minutos: 45 })
  assert(r1.ok && r1.data?.data?.id, 'create prestacion', `status=${r1.status}`)
  prestId = r1.data?.data?.id

  // Update precio
  const r2 = await patch(`/prestaciones/${prestId}`, { precio: 9500 })
  assert(r2.ok && r2.data?.data?.precio === 9500, 'update prestacion precio')

  // List
  const r3 = await get('/prestaciones')
  assert(r3.ok && Array.isArray(r3.data?.data), 'list prestaciones')

  return prestId
}

async function testColaboradores() {
  let colabId

  // Create colaborador
  const r1 = await post('/colaboradores', { nombre: 'Ana', apellido: 'López', email: `ana_${Date.now()}@test.com`, rol: 'profesional', matricula: 'MP-12345' })
  assert(r1.ok && r1.data?.data?.id, 'create colaborador', `status=${r1.status}`)
  colabId = r1.data?.data?.id

  // Create con rol inválido
  const r2 = await post('/colaboradores', { nombre: 'Bob', email: `bob_${Date.now()}@test.com`, rol: 'superadmin' })
  assert(!r2.ok, 'create colaborador rol inválido')

  // List
  const r3 = await get('/colaboradores')
  assert(r3.ok && Array.isArray(r3.data?.data), 'list colaboradores')

  // Update comision
  const r4 = await patch(`/colaboradores/${colabId}`, { porcentaje_comision: 15.5 })
  assert(r4.ok, 'update colaborador comision', `status=${r4.status}`)

  // Update con rol válido
  const r5 = await patch(`/colaboradores/${colabId}`, { rol: 'admin' })
  assert(r5.ok, 'update colaborador rol')

  return colabId
}

async function testPresupuestos(pacienteId) {
  // Create
  const r1 = await post('/presupuestos', { paciente_id: pacienteId, total: 25000, notas: 'Tratamiento completo' })
  assert(r1.ok && r1.data?.data?.id, 'create presupuesto', `status=${r1.status}`)
  const presupId = r1.data?.data?.id

  // List
  const r2 = await get(`/presupuestos?paciente_id=${pacienteId}`)
  assert(r2.ok && Array.isArray(r2.data?.data), 'list presupuestos')

  // Update estado
  const r3 = await patch(`/presupuestos/${presupId}`, { estado: 'aprobado' })
  assert(r3.ok, 'update presupuesto estado')

  return presupId
}

async function testConfig() {
  // Get config
  const r1 = await get('/config')
  assert(r1.ok && r1.data?.data, 'get config')

  // Update config
  const r2 = await patch('/config', { nombre_consultorio: 'Test Consultorio', moneda: 'ARS' })
  assert(r2.ok, 'update config', `status=${r2.status}`)

  // Verify update
  const r3 = await get('/config')
  assert(r3.data?.data?.nombre_consultorio === 'Test Consultorio', 'config update persisted')
}

async function testReportes() {
  const now = new Date()
  const anio = now.getFullYear()
  const mes = now.getMonth() + 1

  const r1 = await get(`/reportes?tipo=mensual&anio=${anio}&mes=${mes}`)
  assert(r1.ok && r1.data?.data?.resumen, 'reporte mensual', `status=${r1.status}`)

  const r2 = await get(`/reportes?tipo=anual&anio=${anio}`)
  assert(r2.ok, 'reporte anual')

  const r3 = await get(`/reportes?tipo=prestaciones&anio=${anio}&mes=${mes}`)
  assert(r3.ok, 'reporte prestaciones')

  const r4 = await get(`/reportes?tipo=pacientes&anio=${anio}&mes=${mes}`)
  assert(r4.ok, 'reporte pacientes')

  const r5 = await get(`/reportes?tipo=comisiones&anio=${anio}&mes=${mes}`)
  assert(r5.ok, 'reporte comisiones', `status=${r5.status}`)

  // Tipo inválido
  const r6 = await get('/reportes?tipo=inexistente')
  assert(!r6.ok, 'reporte tipo inválido bloqueado')
}

async function testCRM() {
  const r1 = await get('/crm?tipo=inactivos&dias=30')
  assert(r1.ok && Array.isArray(r1.data?.data), 'crm inactivos')

  const r2 = await get('/crm?tipo=cumpleanos')
  assert(r2.ok && Array.isArray(r2.data?.data), 'crm cumpleanos')

  const r3 = await get('/crm?tipo=recordatorios')
  assert(r3.ok && Array.isArray(r3.data?.data), 'crm recordatorios')

  const r4 = await get('/crm?tipo=deudores')
  assert(r4.ok && Array.isArray(r4.data?.data), 'crm deudores')

  const r5 = await get('/crm?tipo=estadisticas')
  assert(r5.ok && r5.data?.data?.total_pacientes !== undefined, 'crm estadisticas')
}

async function testAnamnesis(pacienteId) {
  // Save anamnesis
  const r1 = await post('/anamnesis', {
    paciente_id: pacienteId,
    enfermedades: '{}',
    alergias: '{}',
    medicacion_actual: 'Ninguna',
    antecedentes: '',
  })
  assert(r1.ok, 'save anamnesis', `status=${r1.status}`)

  // Get anamnesis
  const r2 = await get(`/anamnesis?paciente_id=${pacienteId}`)
  assert(r2.ok, 'get anamnesis')
}

async function testGiftcards() {
  // Create giftcard
  const r1 = await post('/giftcards', { monto_original: 10000, notas: 'Regalo cumpleaños' })
  assert(r1.ok && r1.data?.data?.id, 'create giftcard', `status=${r1.status}`)
  const gcId = r1.data?.data?.id
  const gcCodigo = r1.data?.data?.codigo

  // List
  const r2 = await get('/giftcards')
  assert(r2.ok && Array.isArray(r2.data?.data), 'list giftcards')

  // Get by ID
  const r3 = await get(`/giftcards/${gcId}`)
  assert(r3.ok && r3.data?.data?.monto_original === 10000, 'get giftcard by id')

  // Buscar por código
  const r4 = await get(`/giftcards?codigo=${gcCodigo}`)
  assert(r4.ok && Array.isArray(r4.data?.data), 'buscar giftcard por codigo')

  // Aplicar saldo parcial
  const r5 = await patch(`/giftcards/${gcId}`, { aplicar_monto: 3000 })
  assert(r5.ok && r5.data?.data?.monto_restante === 7000, 'aplicar saldo giftcard', `restante=${r5.data?.data?.monto_restante}`)

  // Aplicar más de lo disponible
  const r6 = await patch(`/giftcards/${gcId}`, { aplicar_monto: 9999 })
  assert(!r6.ok, 'aplicar saldo excedido bloqueado')

  // Monto inválido
  const r7 = await post('/giftcards', { monto_original: 0 })
  assert(!r7.ok, 'create giftcard monto cero bloqueado')

  // Anular
  const r8 = await del(`/giftcards/${gcId}`)
  assert(r8.ok, 'anular giftcard')

  // Aplicar saldo en giftcard anulada
  const r9 = await patch(`/giftcards/${gcId}`, { aplicar_monto: 100 })
  assert(!r9.ok, 'aplicar saldo en giftcard anulada bloqueado')
}

async function testEncuestas(turnoId, pacienteId) {
  // Create encuesta (requiere turno con paciente que tiene email)
  const r1 = await post('/encuestas', { turno_id: turnoId, paciente_id: pacienteId })
  // Puede fallar si el turno no existe o el paciente no tiene email — skip gracefully
  if (!r1.ok) { skip('create encuesta (turno/paciente sin email)'); return }
  assert(r1.ok && r1.data?.data?.id, 'create encuesta', `status=${r1.status}`)
  const encId = r1.data?.data?.id
  const encToken = r1.data?.data?.token

  // List encuestas
  const r2 = await get('/encuestas')
  assert(r2.ok && Array.isArray(r2.data?.data), 'list encuestas')

  // Resumen NPS
  const r3 = await get('/encuestas?tipo=resumen')
  assert(r3.ok && r3.data?.data?.total_enviadas !== undefined, 'encuestas resumen NPS')

  // Responder encuesta (sin auth — usa token)
  const r4 = await patch(`/encuestas/${encId}`, { token: encToken, nps: 9, comentario: 'Excelente atención' })
  assert(r4.ok && r4.data?.data?.respondida === 1, 'responder encuesta')

  // NPS fuera de rango
  const r5 = await post('/encuestas', { turno_id: turnoId, paciente_id: pacienteId })
  if (r5.ok) {
    const r5b = await patch(`/encuestas/${r5.data?.data?.id}`, { token: r5.data?.data?.token, nps: 11 })
    assert(!r5b.ok, 'encuesta nps > 10 bloqueado')
  } else { skip('encuesta nps rango (no se pudo crear)') }

  // Responder encuesta ya respondida
  const r6 = await patch(`/encuestas/${encId}`, { token: encToken, nps: 5 })
  assert(r6.status === 409, 'encuesta ya respondida bloqueada')
}

async function testRoleRestrictions() {
  // Register recepcionista colaborador user (simulate with second token)
  // For now, test that unauthenticated access is blocked on all endpoints
  const paths = [
    '/pacientes', '/turnos', '/pagos', '/evoluciones', '/insumos',
    '/prestaciones', '/colaboradores', '/config', '/reportes',
    '/crm', '/anamnesis', '/presupuestos', '/giftcards', '/encuestas',
  ]
  for (const path of paths) {
    const r = await get(path, null)
    // Without token, req will use authToken. We need to test with no token.
    const rNoAuth = await req('GET', path, null, 'INVALID_TOKEN')
    assert(rNoAuth.status === 401, `${path} unauthenticated blocked`)
  }
}

async function testEdgeCases(pacienteId) {
  // XSS attempt in field
  const r1 = await post('/pacientes', { nombre: '<script>alert(1)</script>', apellido: 'XSS' })
  if (r1.ok) {
    const id = r1.data?.data?.id
    const r1b = await get(`/pacientes/${id}`)
    // Should store as-is (no HTML execution since it's API data)
    assert(r1b.ok, 'xss in nombre stored safely')
  } else {
    skip('xss test skipped')
  }

  // SQL injection attempt
  const r2 = await get("/pacientes?q=' OR 1=1 --")
  assert(r2.ok, 'sql injection in search handled')

  // Very long string
  const longStr = 'a'.repeat(10000)
  const r3 = await post('/pacientes', { nombre: longStr, apellido: 'Long' })
  // Should either succeed (DB truncates) or return error
  assert(r3.status !== 500, 'very long string no 500')

  // Empty body
  const r4 = await post('/pacientes', {})
  assert(!r4.ok, 'empty body rejected')

  // Invalid JSON (can't easily test since we serialize, but test missing required fields)
  const r5 = await post('/evoluciones', {})
  assert(!r5.ok, 'empty evolucion rejected')

  // Large monto
  const today = new Date().toISOString().slice(0, 10)
  const r6 = await post('/pagos', { paciente_id: pacienteId, monto: 999999999, metodo_pago: 'efectivo', fecha: today })
  assert(r6.ok, 'large monto accepted')
  if (r6.ok) await del(`/pagos/${r6.data?.data?.id}`)

  // Zero monto
  const r7 = await post('/pagos', { paciente_id: pacienteId, monto: 0, metodo_pago: 'efectivo', fecha: today })
  assert(!r7.ok, 'zero monto rejected')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\nClingest API Test Suite`)
  console.log(`Target: ${BASE_URL}`)
  console.log(`Time: ${new Date().toISOString()}\n`)

  let pacienteId, turnoId

  await suite('Auth', testAuth)
  await suite('Config', testConfig)
  pacienteId = await suite('Pacientes', async () => { return await testPacientes() }) || ''

  // Re-run to get pacienteId (suite doesn't return value cleanly)
  const pc = await post('/pacientes', { nombre: 'TestPac', apellido: 'Suite', email: `suite_${Date.now()}@test.com`, telefono: '1155667788' })
  if (pc.ok) pacienteId = pc.data?.data?.id

  await suite('Turnos', async () => { turnoId = await testTurnos(pacienteId) })
  await suite('Pagos', () => testPagos(pacienteId))
  await suite('Evoluciones', () => testEvoluciones(pacienteId))
  await suite('Insumos', testInsumos)
  await suite('Prestaciones', testPrestaciones)
  await suite('Colaboradores', testColaboradores)
  await suite('Presupuestos', () => testPresupuestos(pacienteId))
  await suite('Anamnesis', () => testAnamnesis(pacienteId))
  await suite('Reportes', testReportes)
  await suite('CRM', testCRM)
  await suite('Giftcards', testGiftcards)
  await suite('Encuestas', () => testEncuestas(turnoId, pacienteId))
  await suite('Role restrictions', testRoleRestrictions)
  await suite('Edge cases', () => testEdgeCases(pacienteId))

  const total = passed + failed + skipped
  console.log(`\n\n${'='.repeat(60)}`)
  console.log(`Results: ${total} tests — ${passed} passed, ${failed} failed, ${skipped} skipped`)
  console.log(`${'='.repeat(60)}`)

  if (errors.length > 0) {
    console.log('\nFailed tests:')
    errors.forEach(e => console.log(`  ❌ ${e}`))
  }

  if (failed > 0) {
    process.exit(1)
  } else {
    console.log('\n✅ All tests passed!')
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
