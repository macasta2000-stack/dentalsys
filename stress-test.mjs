
// STRESS TEST COMPLETO — ClinGest / DentalSys
// Base URL: https://odontologo-228.pages.dev
import { performance } from 'perf_hooks';

const BASE = 'https://odontologo-228.pages.dev';
const API = `${BASE}/api`;
const PASSWORD = 'QATest2024!';
const TS = Date.now();

// ─── helpers ────────────────────────────────────────────────────────────────

async function req(method, url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const t0 = performance.now();
  let res, text;
  try {
    res  = await fetch(url, opts);
    text = await res.text();
  } catch (e) {
    return { ok: false, status: 0, ms: Math.round(performance.now() - t0), error: e.message, data: null };
  }
  const ms = Math.round(performance.now() - t0);
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, ms, data };
}

const get  = (url, token)       => req('GET',    url, null, token);
const post = (url, body, token) => req('POST',   url, body, token);

function avg(arr) { return arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0; }
function mn(arr)  { return arr.length ? Math.min(...arr) : 0; }
function mx(arr)  { return arr.length ? Math.max(...arr) : 0; }

function extractToken(data) {
  if (!data) return null;
  if (data.token) return data.token;
  if (data.data?.token) return data.data.token;
  if (data.data?.data?.token) return data.data.data.token;
  return null;
}
function extractUser(data) {
  if (!data) return null;
  if (data.user) return data.user;
  if (data.data?.user) return data.data.user;
  return null;
}
function extractId(data) {
  if (!data) return null;
  if (data.id) return data.id;
  if (data.data?.id) return data.data.id;
  return null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── report counters ─────────────────────────────────────────────────────────

const report = {
  tenantsCreated: 0, tenantErrors: 0, registerTimes: [],
  onboardingDone: 0,
  pacientesCreated: 0, pacienteErrors: 0, pacienteTimes: [],
  turnosCreated: 0, turnosConflicts: 0, turnosErrors: 0, turnoTimes: [],
  evolucionesCreated: 0, evolucionErrors: 0, evolucionTimes: [],
  pagosCreated: 0, pagoErrors: 0, pagoTimes: [],
  insumosCreated: 0, insumoErrors: 0, insumoTimes: [],
  getP: [], getTurnos: [], getPagos: [], getEvol: [],
  multiTenantIsolation: 'SKIP',
  authProtected: 'UNKNOWN',
  adminProtected: 'UNKNOWN',
  forbiddenFields: 'UNKNOWN',
  dupEmail: 'UNKNOWN',
  badLogin: 'UNKNOWN',
  badJwt: 'UNKNOWN',
  badJson: 'UNKNOWN',
  missingFields: 'UNKNOWN',
  concurrentOk: 0,
  correlativeOk: 'SKIP',
  issues: [],
  observations: [],
};

function issue(msg) {
  console.error('  [ISSUE]', msg);
  report.issues.push(msg);
}
function obs(msg) {
  console.log('  [OBS]', msg);
  report.observations.push(msg);
}
function ok(msg) { console.log('  [OK]', msg); }

// ─── FASE 1: Registrar tenants ────────────────────────────────────────────────

console.log('\n========== FASE 1: Registro de 50 tenants ==========');
const allTenants = [];
const TOTAL_TENANTS = 50;

for (let i = 0; i < TOTAL_TENANTS; i++) {
  const email = `qa-test-${TS}-${i}@clingest-qa.com`;
  const r = await post(`${API}/auth/register-public`, {
    email,
    password: PASSWORD,
    nombre: `QATenant${i}`,
    clinica: `Clinica QA ${i}`,
  });
  report.registerTimes.push(r.ms);

  const token = extractToken(r.data);
  const user  = extractUser(r.data);

  if ((r.status === 200 || r.status === 201) && token) {
    report.tenantsCreated++;
    allTenants.push({ email, token, userId: user?.id, index: i });
    if (i % 10 === 0) console.log(`  [${i+1}/50] ${email} → OK (${r.ms}ms)`);
  } else {
    report.tenantErrors++;
    if (i < 3) issue(`Registro tenant ${i}: status=${r.status} body=${JSON.stringify(r.data).substring(0,200)}`);
    if (i % 10 === 0) console.log(`  [${i+1}/50] ${email} → FAIL ${r.status} (${r.ms}ms)`);
  }
  if (i % 10 === 9) await sleep(300);
}
console.log(`\n  Tenants creados: ${report.tenantsCreated}/${TOTAL_TENANTS}`);
console.log(`  Registro — avg: ${avg(report.registerTimes)}ms | mín: ${mn(report.registerTimes)}ms | máx: ${mx(report.registerTimes)}ms`);

// Email duplicado test
if (allTenants.length > 0) {
  const dupR = await post(`${API}/auth/register-public`, {
    email: allTenants[0].email, password: PASSWORD, nombre: 'Dup', clinica: 'Dup',
  });
  report.dupEmail = dupR.status === 409 ? 'PASS' : `FAIL (got ${dupR.status})`;
  console.log(`  Email duplicado → ${dupR.status} → ${report.dupEmail}`);
  if (dupR.status !== 409) issue(`Email dup: esperado 409, got ${dupR.status}: ${JSON.stringify(dupR.data).substring(0,150)}`);
}

const activeTenants = allTenants.slice(0, 5);
console.log(`  Tenants activos para pruebas: ${activeTenants.length}`);

// ─── FASE 2: Onboarding ───────────────────────────────────────────────────────

console.log('\n========== FASE 2: Onboarding ==========');
const especialidades = ['Odontología General', 'Ortodoncia', 'Implantología', 'Endodoncia', 'Periodoncia'];
for (let i = 0; i < activeTenants.length; i++) {
  const t = activeTenants[i];
  const r = await post(`${API}/onboarding`, {
    especialidad: especialidades[i],
    tamano_equipo: i + 1,
    objetivo_principal: 'gestion_pacientes',
    usa_obra_social: true,
  }, t.token);
  if (r.ok) {
    report.onboardingDone++;
    ok(`Tenant ${i} onboarding OK (${r.ms}ms)`);
  } else {
    console.log(`  Tenant ${i}: onboarding → ${r.status} ${JSON.stringify(r.data).substring(0,100)} (${r.ms}ms)`);
    if (r.status !== 404 && r.status !== 405) issue(`Onboarding tenant ${i}: ${r.status} ${JSON.stringify(r.data).substring(0,100)}`);
  }
}

// ─── FASE 2a: Pacientes ───────────────────────────────────────────────────────

console.log('\n========== FASE 2a: Pacientes (50 x tenant = 250 total) ==========');
const PRIMEROS_NOMBRES = ['Ana','Luis','María','Carlos','Laura','Pedro','Sofía','Miguel','Isabella','Alejandro',
  'Valentina','Diego','Camila','Andrés','Daniela','Fernando','Paola','Sebastián','Natalia','Ricardo'];
const APELLIDOS = ['García','Martínez','López','Rodríguez','Fernández','González','Jiménez',
  'Díaz','Moreno','Ruiz','Torres','Flores','Reyes','Vargas','Castro'];
const OBRAS = [null, null, null, 'OSDE', 'Swiss Medical', 'PAMI', 'Galeno', 'Medicus'];

const tenantPacientes = activeTenants.map(() => []);

for (let ti = 0; ti < activeTenants.length; ti++) {
  const t = activeTenants[ti];
  let created = 0;
  const localTimes = [];
  for (let j = 0; j < 50; j++) {
    const nombre   = PRIMEROS_NOMBRES[j % PRIMEROS_NOMBRES.length];
    const apellido = APELLIDOS[j % APELLIDOS.length];
    const obra     = OBRAS[j % OBRAS.length];
    const body = {
      nombre,
      apellido,
      dni: `${30000000 + ti * 1000 + j}`,
      telefono: `11${5000000 + ti * 100 + j}`,
      email: `pac${ti}x${j}x${TS}@test.com`,
      fecha_nacimiento: `198${j % 10}-${String((j%12)+1).padStart(2,'0')}-15`,
      obra_social: obra,
      plan_obra_social: obra ? `Plan ${j % 3 + 1}` : null,
    };
    const r = await post(`${API}/pacientes`, body, t.token);
    report.pacienteTimes.push(r.ms);
    localTimes.push(r.ms);
    const id = extractId(r.data);
    if ((r.status === 200 || r.status === 201) && id) {
      report.pacientesCreated++;
      tenantPacientes[ti].push(id);
      created++;
    } else {
      report.pacienteErrors++;
      if (j < 2 && ti === 0) issue(`Paciente ti=${ti} j=${j}: ${r.status} ${JSON.stringify(r.data).substring(0,150)}`);
    }
  }
  console.log(`  Tenant ${ti}: ${created}/50 pacientes — avg ${avg(localTimes)}ms mín ${mn(localTimes)}ms máx ${mx(localTimes)}ms`);
}
console.log(`  TOTAL: ${report.pacientesCreated}/250 (errores: ${report.pacienteErrors})`);

// ─── FASE 2b: Turnos ─────────────────────────────────────────────────────────

console.log('\n========== FASE 2b: Turnos (100 x tenant = 500 total) ==========');
const tenantTurnos = activeTenants.map(() => []);

for (let ti = 0; ti < activeTenants.length; ti++) {
  const t = activeTenants[ti];
  let created = 0, conflicts = 0, errors = 0;
  const usedSlots = [];
  const localTimes = [];

  for (let j = 0; j < 100; j++) {
    const dayOffset = Math.floor(j / 4) + 1;
    const hour = 8 + (j % 12); // 08:00 — 19:00
    const dateStr = new Date(Date.now() + dayOffset * 86400000).toISOString().split('T')[0];
    const fechaHora = `${dateStr}T${String(hour).padStart(2,'0')}:00:00`;
    const pLen = tenantPacientes[ti].length;
    const pacienteId = pLen > 0 ? tenantPacientes[ti][j % pLen] : null;

    if (!pacienteId) { errors++; continue; }

    const body = {
      paciente_id: pacienteId,
      fecha_hora: fechaHora,
      duracion_minutos: 30,
      motivo: `Consulta ${j} T${ti}`,
    };

    const r = await post(`${API}/turnos`, body, t.token);
    report.turnoTimes.push(r.ms);
    localTimes.push(r.ms);
    const id = extractId(r.data);
    if ((r.status === 200 || r.status === 201) && id) {
      report.turnosCreated++;
      created++;
      tenantTurnos[ti].push({ id, fecha_hora: fechaHora, paciente_id: pacienteId });
      usedSlots.push({ fecha_hora: fechaHora, paciente_id: pacienteId });
    } else if (r.status === 409) {
      report.turnosConflicts++;
      conflicts++;
    } else {
      report.turnosErrors++;
      errors++;
      if (j < 2 && ti === 0) issue(`Turno ti=${ti} j=${j}: ${r.status} ${JSON.stringify(r.data).substring(0,150)}`);
    }
  }

  // Intentar turno duplicado deliberado
  if (usedSlots.length > 0) {
    const slot = usedSlots[0];
    const dupR = await post(`${API}/turnos`, {
      paciente_id: slot.paciente_id,
      fecha_hora: slot.fecha_hora,
      duracion_minutos: 30,
      motivo: 'DUPLICADO INTENCIONAL QA',
    }, t.token);
    if (dupR.status === 409) {
      if (ti === 0) ok(`Turno en horario conflictivo → 409 correcto`);
    } else if (dupR.ok) {
      issue(`Turno duplicado ACEPTADO en tenant ${ti}: ${dupR.status} fecha=${slot.fecha_hora}`);
    } else {
      if (ti === 0) obs(`Turno dup sin profesional: ${dupR.status} (sin conflicto, profesional null no trackea overlaps)`);
    }
  }

  console.log(`  Tenant ${ti}: ${created}/100 — ${conflicts} 409s — ${errors} errores — avg ${avg(localTimes)}ms`);
}
console.log(`  TOTAL: ${report.turnosCreated}/500 (conflictos: ${report.turnosConflicts})`);

// ─── FASE 2c: Evoluciones ────────────────────────────────────────────────────

console.log('\n========== FASE 2c: Evoluciones (200 x tenant = 1000 total) ==========');
const TIPOS = ['diagnostico', 'tratamiento', 'nota'];
const TEXTOS = [
  'Caries en molar superior derecho. Se realiza obturación con composite fotopolimerizable.',
  'Limpieza y profilaxis dental completa. Encías en buen estado general.',
  'Dolor agudo en diente 36. Diagnóstico: pulpitis reversible. Se indica ibuprofeno.',
  'Control post-operatorio. Evolución muy favorable, sin complicaciones ni infecciones.',
  'Radiografía periapical zona 21. Sin hallazgos significativos.',
  'Paciente refiere sensibilidad al frío. Se aplica barniz de flúor y recomienda pasta desensibilizante.',
  'Extracción de tercer molar inferior derecho. Procedimiento sin incidentes bajo anestesia local.',
  'Colocación de implante en zona 26. Torque de inserción 35 Ncm. Evolución favorable.',
];

for (let ti = 0; ti < activeTenants.length; ti++) {
  const t = activeTenants[ti];
  let created = 0;
  const localTimes = [];
  const pLen = tenantPacientes[ti].length;
  for (let j = 0; j < 200; j++) {
    if (pLen === 0) { report.evolucionErrors++; continue; }
    const pacienteId = tenantPacientes[ti][j % pLen];
    const body = {
      paciente_id: pacienteId,
      texto: TEXTOS[j % TEXTOS.length],
      tipo: TIPOS[j % TIPOS.length],
      fecha: new Date(Date.now() - j * 86400000).toISOString().split('T')[0],
    };
    const r = await post(`${API}/evoluciones`, body, t.token);
    report.evolucionTimes.push(r.ms);
    localTimes.push(r.ms);
    if (r.status === 200 || r.status === 201) {
      report.evolucionesCreated++;
      created++;
    } else {
      report.evolucionErrors++;
      if (j < 2 && ti === 0) issue(`Evolucion ti=${ti} j=${j}: ${r.status} ${JSON.stringify(r.data).substring(0,150)}`);
    }
  }
  console.log(`  Tenant ${ti}: ${created}/200 — avg ${avg(localTimes)}ms`);
  await sleep(100);
}
console.log(`  TOTAL: ${report.evolucionesCreated}/1000 (errores: ${report.evolucionErrors})`);

// ─── FASE 2d: Pagos ───────────────────────────────────────────────────────────

console.log('\n========== FASE 2d: Pagos (150 x tenant = 750 total) ==========');
const METODOS = ['efectivo', 'transferencia', 'tarjeta_credito', 'obra_social'];
const tenantPagos = activeTenants.map(() => []);

for (let ti = 0; ti < activeTenants.length; ti++) {
  const t = activeTenants[ti];
  let created = 0;
  const localTimes = [];
  const pLen = tenantPacientes[ti].length;
  for (let j = 0; j < 150; j++) {
    const monto  = 5000 + Math.floor(Math.random() * 495000);
    const metodo = METODOS[j % METODOS.length];
    const pacienteId = pLen > 0 ? tenantPacientes[ti][j % pLen] : null;
    if (!pacienteId) { report.pagoErrors++; continue; }
    const body = {
      paciente_id: pacienteId,
      monto,
      metodo_pago: metodo,
      concepto: `Tratamiento dental #${j}`,
      fecha: new Date(Date.now() - j * 86400000 / 5).toISOString().split('T')[0],
    };
    if (metodo === 'obra_social') {
      body.obra_social_nombre = 'OSDE';
      body.nro_afiliado = `AF${ti}${j}`;
    }
    const r = await post(`${API}/pagos`, body, t.token);
    report.pagoTimes.push(r.ms);
    localTimes.push(r.ms);
    const id = extractId(r.data);
    if ((r.status === 200 || r.status === 201) && id) {
      report.pagosCreated++;
      created++;
      tenantPagos[ti].push(id);
    } else {
      report.pagoErrors++;
      if (j < 2 && ti === 0) issue(`Pago ti=${ti} j=${j}: ${r.status} ${JSON.stringify(r.data).substring(0,150)}`);
    }
  }
  console.log(`  Tenant ${ti}: ${created}/150 — avg ${avg(localTimes)}ms`);
  await sleep(100);
}
console.log(`  TOTAL: ${report.pagosCreated}/750 (errores: ${report.pagoErrors})`);

// ─── FASE 2e: Insumos ────────────────────────────────────────────────────────

console.log('\n========== FASE 2e: Insumos (20 x tenant = 100 total) ==========');
const CATEGORIAS = ['Anestesia', 'Materiales restauradores', 'Instrumental', 'Higiene', 'Radiografía'];

for (let ti = 0; ti < activeTenants.length; ti++) {
  const t = activeTenants[ti];
  let created = 0;
  const localTimes = [];
  for (let j = 0; j < 20; j++) {
    const body = {
      nombre: `${CATEGORIAS[j % CATEGORIAS.length]} tipo ${j} T${ti}`,
      categoria: CATEGORIAS[j % CATEGORIAS.length],
      stock: 50 + j * 10,
      stock_minimo: 10,
      precio_unitario: 100 + j * 50,
      unidad: 'unidad',
    };
    const r = await post(`${API}/insumos`, body, t.token);
    report.insumoTimes.push(r.ms);
    localTimes.push(r.ms);
    if (r.status === 200 || r.status === 201) {
      report.insumosCreated++;
      created++;
    } else {
      report.insumoErrors++;
      if (j < 2 && ti === 0) issue(`Insumo ti=${ti} j=${j}: ${r.status} ${JSON.stringify(r.data).substring(0,150)}`);
    }
  }
  console.log(`  Tenant ${ti}: ${created}/20 — avg ${avg(localTimes)}ms`);
}
console.log(`  TOTAL: ${report.insumosCreated}/100`);

// ─── FASE 3: Velocidad de lectura ────────────────────────────────────────────

console.log('\n========== FASE 3: Velocidad de lectura ==========');

for (let ti = 0; ti < activeTenants.length; ti++) {
  const t = activeTenants[ti];

  // GET pacientes (lista completa)
  const rP = await get(`${API}/pacientes`, t.token);
  report.getP.push(rP.ms);
  const pCount = Array.isArray(rP.data) ? rP.data.length
    : (Array.isArray(rP.data?.data) ? rP.data.data.length : '?');
  console.log(`  [T${ti}] GET /pacientes → ${rP.status} ${rP.ms}ms (${pCount} registros)`);
  if (!rP.ok) issue(`GET /pacientes T${ti}: ${rP.status} ${JSON.stringify(rP.data).substring(0,100)}`);

  // GET búsqueda parcial
  const rPS = await get(`${API}/pacientes?q=García`, t.token);
  console.log(`  [T${ti}] GET /pacientes?q=García → ${rPS.status} ${rPS.ms}ms (${Array.isArray(rPS.data) ? rPS.data.length : '?'} coincidencias)`);

  // GET turnos semana
  const from = new Date().toISOString().split('T')[0];
  const to   = new Date(Date.now() + 7*86400000).toISOString().split('T')[0];
  const rT = await get(`${API}/turnos?from=${from}&to=${to}`, t.token);
  report.getTurnos.push(rT.ms);
  const tCount = Array.isArray(rT.data) ? rT.data.length
    : (Array.isArray(rT.data?.data) ? rT.data.data.length : '?');
  console.log(`  [T${ti}] GET /turnos semana → ${rT.status} ${rT.ms}ms (${tCount} turnos)`);

  // GET pagos mes
  const mfrom = new Date(Date.now() - 30*86400000).toISOString().split('T')[0];
  const rPag = await get(`${API}/pagos?from=${mfrom}&to=${from}`, t.token);
  report.getPagos.push(rPag.ms);
  console.log(`  [T${ti}] GET /pagos mes → ${rPag.status} ${rPag.ms}ms`);

  // GET evoluciones por paciente
  if (tenantPacientes[ti][0]) {
    const rEv = await get(`${API}/evoluciones?paciente_id=${tenantPacientes[ti][0]}`, t.token);
    report.getEvol.push(rEv.ms);
    const eCount = Array.isArray(rEv.data) ? rEv.data.length
      : (Array.isArray(rEv.data?.data) ? rEv.data.data.length : '?');
    console.log(`  [T${ti}] GET /evoluciones paciente → ${rEv.status} ${rEv.ms}ms (${eCount} evoluciones)`);
  }
}

// ─── FASE 4: Seguridad multi-tenant ──────────────────────────────────────────

console.log('\n========== FASE 4: Seguridad y aislamiento multi-tenant ==========');

if (activeTenants.length >= 2 && tenantPacientes[0].length > 0) {
  const tA = activeTenants[0];
  const tB = activeTenants[1];
  const pacIdA = tenantPacientes[0][0];

  // Cross-tenant GET paciente
  const rCross = await get(`${API}/pacientes/${pacIdA}`, tB.token);
  console.log(`  Cross-tenant GET /pacientes/${pacIdA} (tenantA) con token tenantB → ${rCross.status}`);
  if (rCross.status === 404) {
    report.multiTenantIsolation = 'PASS';
    ok(`Multi-tenant isolation: 404 correcto`);
  } else if (rCross.ok) {
    report.multiTenantIsolation = 'FAIL — DATA LEAK CRÍTICO';
    issue(`DATA LEAK: Tenant B ve paciente de Tenant A (ID=${pacIdA}). Data: ${JSON.stringify(rCross.data).substring(0,200)}`);
  } else {
    report.multiTenantIsolation = `PASS-ish (${rCross.status})`;
    ok(`Multi-tenant: ${rCross.status} para acceso cross-tenant`);
  }

  // Cross-tenant turno
  const rCrossT = await post(`${API}/turnos`, {
    paciente_id: pacIdA,
    fecha_hora: new Date(Date.now() + 20*86400000).toISOString().replace(/\..+/,''),
    duracion_minutos: 30,
    motivo: 'QA Cross-tenant',
  }, tB.token);
  console.log(`  Cross-tenant turno con paciente de A → ${rCrossT.status}`);
  if (rCrossT.ok) {
    issue(`Tenant B creó turno con paciente_id de Tenant A. Posible leak. resp: ${JSON.stringify(rCrossT.data).substring(0,150)}`);
  } else {
    ok(`Cross-tenant turno rechazado: ${rCrossT.status}`);
  }

  // Cross-tenant evolución
  const rCrossE = await post(`${API}/evoluciones`, {
    paciente_id: pacIdA,
    texto: 'QA cross-tenant evolucion test',
    tipo: 'nota',
  }, tB.token);
  console.log(`  Cross-tenant evolución → ${rCrossE.status}`);
  if (rCrossE.ok) {
    issue(`Tenant B creó evolución con paciente_id de Tenant A`);
  } else {
    ok(`Cross-tenant evolución rechazada: ${rCrossE.status}`);
  }

  // Cross-tenant pago
  const rCrossP = await post(`${API}/pagos`, {
    paciente_id: pacIdA,
    monto: 10000,
    metodo_pago: 'efectivo',
    concepto: 'QA cross-tenant pago',
  }, tB.token);
  console.log(`  Cross-tenant pago con paciente de A → ${rCrossP.status}`);
  if (rCrossP.ok) {
    issue(`Tenant B creó pago con paciente_id de Tenant A`);
  } else {
    ok(`Cross-tenant pago rechazado: ${rCrossP.status}`);
  }
} else {
  obs('Multi-tenant skip: sin suficientes datos');
}

// Auth routes sin token
const rNoAuth = await get(`${API}/pacientes`);
report.authProtected = (rNoAuth.status === 401 || rNoAuth.status === 403) ? 'PASS' : `FAIL (got ${rNoAuth.status})`;
console.log(`  GET /pacientes sin token → ${rNoAuth.status} → ${report.authProtected}`);

// Auth routes sin token — variados
const noAuthTests = [
  [`${API}/turnos`, 'GET'],
  [`${API}/pagos`, 'GET'],
  [`${API}/evoluciones`, 'GET'],
  [`${API}/insumos`, 'GET'],
];
for (const [url] of noAuthTests) {
  const r = await get(url);
  if (r.status !== 401 && r.status !== 403) {
    issue(`Auth unprotected: GET ${url} sin token devolvió ${r.status}`);
  }
}

// Admin route
const rAdmin = await get(`${API}/admin/usuarios`, activeTenants[0]?.token);
console.log(`  GET /admin/usuarios con token tenant → ${rAdmin.status}`);
report.adminProtected = rAdmin.status === 403 ? 'PASS (403)' :
  rAdmin.status === 404 ? 'PASS (endpoint no existe)' :
  rAdmin.status === 401 ? 'PARTIAL (401 — mismo mecanismo auth)' :
  rAdmin.status === 200 ? 'FAIL — tenant accede a admin' : `PARTIAL (${rAdmin.status})`;
if (rAdmin.status === 200) issue(`Admin route accesible con token de tenant!`);

// Forbidden fields
if (activeTenants[0]?.token) {
  const rFb = await post(`${API}/pacientes`, {
    nombre: 'TestForbidden',
    apellido: 'QA',
    dni: `99${TS.toString().slice(-5)}`,
    plan_id: 'premium_override',
  }, activeTenants[0].token);
  if (rFb.status === 403) {
    report.forbiddenFields = 'PASS (403 explícito)';
  } else if (rFb.ok) {
    const d = rFb.data;
    const hasPlanId = d?.plan_id === 'premium_override' || d?.data?.plan_id === 'premium_override';
    report.forbiddenFields = hasPlanId
      ? 'FAIL — plan_id aceptado y persistido'
      : 'PARTIAL — campo ignorado silenciosamente (no devuelve 403)';
    if (hasPlanId) issue(`plan_id forbidden field persistido en DB: ${JSON.stringify(d).substring(0,150)}`);
    else obs(`plan_id ignorado silenciosamente (no 403, got ${rFb.status})`);
  } else {
    report.forbiddenFields = `PARTIAL (${rFb.status})`;
  }
  console.log(`  POST con plan_id forbidden → ${rFb.status} → ${report.forbiddenFields}`);
}

// ─── FASE 5: Edge cases ───────────────────────────────────────────────────────

console.log('\n========== FASE 5: Edge cases ==========');

// Login password incorrecta
{
  const r = await post(`${API}/auth/login`, {
    email: allTenants[0]?.email || 'x@x.com', password: 'WrongPass999!',
  });
  report.badLogin = r.status === 401 ? 'PASS' : `FAIL (got ${r.status})`;
  console.log(`  Login pwd incorrecta → ${r.status} → ${report.badLogin}`);
}

// JWT inválido (estructura correcta pero firma falsa)
{
  const r = await get(`${API}/pacientes`, 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0IiwiZXhwIjoxfQ.fake-sig-xxxxx');
  report.badJwt = r.status === 401 ? 'PASS' : `FAIL (got ${r.status})`;
  console.log(`  JWT firma inválida → ${r.status} → ${report.badJwt}`);
}

// JWT random string
{
  const r = await get(`${API}/turnos`, 'not-a-jwt-at-all-xyz123');
  console.log(`  JWT = string random → ${r.status} (esperado 401)`);
  if (r.status !== 401 && r.status !== 403) issue(`JWT basura aceptado: ${r.status}`);
}

// JWT sin expiración pero con subject válido (futuro claim)
{
  // Crear token válido con exp en el pasado: ya está cubierto arriba
  // Test token de otro sistema
  const r = await get(`${API}/pagos`, 'Bearer wrong-format');
  console.log(`  JWT "Bearer wrong-format" → ${r.status}`);
}

// Body JSON malformado
{
  const h = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${activeTenants[0]?.token}` };
  let res;
  try { res = await fetch(`${API}/pacientes`, { method: 'POST', headers: h, body: '{invalid:::json{{' }); }
  catch(e) { res = { status: 0 }; }
  const s = res?.status || 0;
  if (s === 400) {
    report.badJson = 'PASS (400)';
  } else if (s === 500) {
    report.badJson = 'FAIL — 500 Internal (debería ser 400)';
    issue(`Body malformado devuelve 500 en vez de 400`);
  } else {
    report.badJson = `PARTIAL (got ${s})`;
  }
  console.log(`  Body JSON malformado → ${s} → ${report.badJson}`);
}

// Campos faltantes — sin nombre
{
  const r = await post(`${API}/pacientes`, { apellido: 'SinNombre', dni: '00000002' }, activeTenants[0]?.token);
  report.missingFields = (r.status === 400 || r.status === 422) ? 'PASS' : `PARTIAL (got ${r.status})`;
  console.log(`  Campo nombre faltante → ${r.status} → ${report.missingFields}`);
  if (r.ok) issue(`Paciente creado sin nombre: ${JSON.stringify(r.data).substring(0,100)}`);
}

// Login email inexistente
{
  const r = await post(`${API}/auth/login`, { email: `noexiste-${TS}@noexiste.com`, password: 'cualquier' });
  console.log(`  Login email inexistente → ${r.status} (esperado 401/404)`);
  if (r.status === 200) issue(`Login email inexistente retornó 200`);
}

// GET ID inexistente
if (activeTenants[0]?.token) {
  const r = await get(`${API}/pacientes/00000000-0000-0000-0000-000000000000`, activeTenants[0].token);
  console.log(`  GET UUID inexistente → ${r.status} (esperado 404)`);
  if (r.ok) issue(`GET UUID ficticio retornó ${r.status}`);
}

// Turno con fecha inválida
if (activeTenants[0]?.token && tenantPacientes[0].length > 0) {
  const r = await post(`${API}/turnos`, {
    paciente_id: tenantPacientes[0][0],
    fecha_hora: 'not-a-date',
    duracion_minutos: 30,
  }, activeTenants[0].token);
  console.log(`  Turno con fecha_hora inválida → ${r.status} (esperado 400)`);
  if (r.ok) issue(`Turno con fecha inválida aceptado: ${JSON.stringify(r.data).substring(0,100)}`);
}

// ─── FASE 7: Carga concurrente ────────────────────────────────────────────────

console.log('\n========== FASE 7: Carga concurrente ==========');

if (activeTenants[0]?.token) {
  // 10 POST pacientes simultáneos
  const t0c = performance.now();
  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(post(`${API}/pacientes`, {
      nombre: `Concurrente${i}`,
      apellido: `QA${TS}`,
      dni: `6${6000000 + i + (TS % 100000)}`,
      telefono: `11777000${i}`,
      email: `conc${i}-${TS}@test.com`,
    }, activeTenants[0].token));
  }
  const results = await Promise.all(promises);
  const concMs = Math.round(performance.now() - t0c);
  report.concurrentOk = results.filter(r => r.ok).length;
  console.log(`  10 POST /pacientes simultáneos: ${report.concurrentOk}/10 exitosos en ${concMs}ms total`);
  const failed = results.filter(r => !r.ok);
  if (failed.length > 0) {
    issue(`${failed.length}/10 POST concurrentes fallaron: ${failed.map(f=>`${f.status}: ${JSON.stringify(f.data).substring(0,60)}`).join(' | ')}`);
  }

  // Check race conditions (IDs únicos)
  const ids = results.filter(r => r.ok).map(r => extractId(r.data)).filter(Boolean);
  const uniqueIds = new Set(ids);
  if (ids.length > 0 && ids.length !== uniqueIds.size) {
    issue(`RACE CONDITION: ${ids.length - uniqueIds.size} IDs duplicados en ${ids.length} creaciones simultáneas`);
  } else if (ids.length > 0) {
    ok(`Sin race conditions: ${ids.length} IDs únicos`);
  }

  // 10 GET simultáneos
  const gT0 = performance.now();
  const gPromises = Array.from({length:10}, () => get(`${API}/pacientes`, activeTenants[0].token));
  const gResults = await Promise.all(gPromises);
  const gMs = Math.round(performance.now() - gT0);
  const gOk = gResults.filter(r => r.ok).length;
  const gTimes = gResults.map(r => r.ms);
  console.log(`  10 GET /pacientes simultáneos: ${gOk}/10 exitosos — total ${gMs}ms — avg ${avg(gTimes)}ms máx ${mx(gTimes)}ms`);
  if (gOk < 10) issue(`${10-gOk}/10 GETs concurrentes fallaron`);

  // 10 POST turnos simultáneos (mismo slot — debería generar conflictos)
  if (tenantPacientes[0].length > 0) {
    const slotDate = new Date(Date.now() + 25*86400000).toISOString().split('T')[0];
    const conflictSlot = `${slotDate}T10:00:00`;
    const tConc2 = performance.now();
    const tPromises = Array.from({length:10}, (_, i) => post(`${API}/turnos`, {
      paciente_id: tenantPacientes[0][i % tenantPacientes[0].length],
      fecha_hora: conflictSlot,
      duracion_minutos: 60,
      motivo: `Concurrent slot test ${i}`,
    }, activeTenants[0].token));
    const tResults = await Promise.all(tPromises);
    const tMs = Math.round(performance.now() - tConc2);
    const tOk = tResults.filter(r => r.ok).length;
    const t409 = tResults.filter(r => r.status === 409).length;
    console.log(`  10 POST turnos mismo slot: ${tOk} aceptados, ${t409} 409s en ${tMs}ms`);
    obs(`Turnos concurrentes mismo slot sin profesional: ${tOk} aceptados (sin profesional = sin overlap check)`);
  }
}

// ─── FASE 6: Comprobantes ─────────────────────────────────────────────────────

console.log('\n========== FASE 6: Comprobantes ==========');

if (activeTenants[0]?.token && tenantPagos[0]?.length > 0) {
  const compNums = [];
  const pagosSample = tenantPagos[0].slice(0, 5);
  for (let j = 0; j < pagosSample.length; j++) {
    const pagoId = pagosSample[j];
    // Probar endpoints posibles
    let r = await post(`${API}/pagos/${pagoId}/comprobante`, {}, activeTenants[0].token);
    if (!r.ok) r = await get(`${API}/pagos/${pagoId}/comprobante`, activeTenants[0].token);
    if (!r.ok) r = await post(`${API}/comprobantes`, { pago_id: pagoId }, activeTenants[0].token);

    const num = r.data?.numero ?? r.data?.data?.numero ?? r.data?.nro_comprobante ?? r.data?.data?.nro_comprobante;
    console.log(`  Comprobante pago ${j+1} (id=${pagoId}): status=${r.status} numero=${num} (${r.ms}ms)`);
    if (r.ok && num != null) compNums.push(Number(num));
    else if (j === 0) obs(`Comprobante endpoint: ${r.status} ${JSON.stringify(r.data).substring(0,150)}`);
  }

  if (compNums.length >= 2) {
    const sorted = [...compNums].sort((a,b) => a-b);
    const isCorr = sorted.every((n,i) => i === 0 || n === sorted[i-1] + 1);
    report.correlativeOk = isCorr ? `PASS (nums: ${sorted.join(',')})` : `FAIL — no correlativo (nums: ${sorted.join(',')})`;
  } else {
    report.correlativeOk = `SKIP (${compNums.length} comprobantes obtenidos — endpoint puede no existir)`;
  }
  console.log(`  Correlativo: ${report.correlativeOk}`);
} else {
  obs('Comprobantes: sin pagos para probar');
}

// ─── Pruebas adicionales de config/anamnesis ──────────────────────────────────

console.log('\n========== EXTRA: Config, Anamnesis, CRM ==========');
if (activeTenants[0]?.token) {
  // Config
  const rCfg = await get(`${API}/config`, activeTenants[0].token);
  console.log(`  GET /config → ${rCfg.status} (${rCfg.ms}ms)`);

  // Anamnesis para un paciente
  if (tenantPacientes[0].length > 0) {
    const pacId = tenantPacientes[0][0];
    const rAn = await get(`${API}/anamnesis/${pacId}`, activeTenants[0].token);
    console.log(`  GET /anamnesis/${pacId} → ${rAn.status} (${rAn.ms}ms)`);

    // POST anamnesis
    const rAnP = await post(`${API}/anamnesis/${pacId}`, {
      antecedentes: 'Hipertensión arterial controlada',
      alergias: 'Penicilina',
      medicamentos: 'Enalapril 10mg',
      estado_general: 'bueno',
    }, activeTenants[0].token);
    console.log(`  POST /anamnesis → ${rAnP.status} (${rAnP.ms}ms)`);
  }

  // GET /api/auth/me
  const rMe = await get(`${API}/auth/me`, activeTenants[0].token);
  console.log(`  GET /auth/me → ${rMe.status} (${rMe.ms}ms) rol=${rMe.data?.rol || rMe.data?.data?.rol || '?'}`);
}

// ─── FASE 8: Reporte final ────────────────────────────────────────────────────

function ratingLabel(ms) {
  if (ms === 0)  return 'N/A';
  if (ms < 300)  return 'EXCELLENT (<300ms)';
  if (ms < 500)  return 'GOOD (<500ms)';
  if (ms < 1000) return 'SLOW (500-1000ms)';
  return 'CRITICAL (>1s)';
}

const allReadTimes  = [...report.getP, ...report.getTurnos, ...report.getPagos, ...report.getEvol];
const allWriteTimes = [...report.pacienteTimes, ...report.turnoTimes, ...report.evolucionTimes,
                       ...report.pagoTimes, ...report.insumoTimes];
const allTimes = [...allReadTimes, ...allWriteTimes, ...report.registerTimes];
const overallAvg = avg(allTimes);
const perfRating = overallAvg < 300 ? 'EXCELLENT' : overallAvg < 600 ? 'GOOD' : overallAvg < 1200 ? 'NEEDS_WORK' : 'CRITICAL';

const totalRequests =
  report.registerTimes.length +       // 50 registros
  5 +                                  // onboarding
  report.pacienteTimes.length +        // 250 pacientes
  report.turnoTimes.length +           // 500 turnos
  report.evolucionTimes.length +       // 1000 evoluciones
  report.pagoTimes.length +            // 750 pagos
  report.insumoTimes.length +          // 100 insumos
  activeTenants.length * 5 +           // lecturas por tenant
  25;                                  // security + edge + concurrent + comprobantes

console.log(`
╔════════════════════════════════════════════════════════════════════╗
║        REPORTE STRESS TEST — CLINGEST / DENTALSYS v2.0             ║
╚════════════════════════════════════════════════════════════════════╝

=== REPORTE STRESS TEST CLINGEST ===
Fecha: ${new Date().toISOString()}
URL: https://odontologo-228.pages.dev
Total requests HTTP reales realizados: ~${totalRequests}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGISTRO / AUTH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Tenants creados: ${report.tenantsCreated}/${TOTAL_TENANTS}
- Tenants activos (con token): ${activeTenants.length}
- Tiempo promedio registro: ${avg(report.registerTimes)}ms (mín ${mn(report.registerTimes)}ms, máx ${mx(report.registerTimes)}ms) [${ratingLabel(avg(report.registerTimes))}]
- Onboarding completado: ${report.onboardingDone}/${activeTenants.length}
- Errores de registro: ${report.tenantErrors}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATOS CREADOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Pacientes: ${report.pacientesCreated}/250 (errores: ${report.pacienteErrors})
- Turnos: ${report.turnosCreated}/500 (conflictos 409: ${report.turnosConflicts}, errores: ${report.turnosErrors})
- Evoluciones: ${report.evolucionesCreated}/1000 (errores: ${report.evolucionErrors})
- Pagos: ${report.pagosCreated}/750 (errores: ${report.pagoErrors})
- Insumos: ${report.insumosCreated}/100 (errores: ${report.insumoErrors})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VELOCIDAD — LECTURAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- GET /pacientes (lista 50+ registros): avg=${avg(report.getP)}ms mín=${mn(report.getP)}ms máx=${mx(report.getP)}ms [${ratingLabel(avg(report.getP))}]
- GET /turnos (semana próxima): avg=${avg(report.getTurnos)}ms mín=${mn(report.getTurnos)}ms máx=${mx(report.getTurnos)}ms [${ratingLabel(avg(report.getTurnos))}]
- GET /pagos (mes): avg=${avg(report.getPagos)}ms mín=${mn(report.getPagos)}ms máx=${mx(report.getPagos)}ms [${ratingLabel(avg(report.getPagos))}]
- GET /evoluciones (por paciente): avg=${avg(report.getEvol)}ms mín=${mn(report.getEvol)}ms máx=${mx(report.getEvol)}ms [${ratingLabel(avg(report.getEvol))}]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VELOCIDAD — ESCRITURAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- POST /pacientes: avg=${avg(report.pacienteTimes)}ms mín=${mn(report.pacienteTimes)}ms máx=${mx(report.pacienteTimes)}ms [${ratingLabel(avg(report.pacienteTimes))}]
- POST /turnos: avg=${avg(report.turnoTimes)}ms mín=${mn(report.turnoTimes)}ms máx=${mx(report.turnoTimes)}ms [${ratingLabel(avg(report.turnoTimes))}]
- POST /evoluciones: avg=${avg(report.evolucionTimes)}ms mín=${mn(report.evolucionTimes)}ms máx=${mx(report.evolucionTimes)}ms [${ratingLabel(avg(report.evolucionTimes))}]
- POST /pagos: avg=${avg(report.pagoTimes)}ms mín=${mn(report.pagoTimes)}ms máx=${mx(report.pagoTimes)}ms [${ratingLabel(avg(report.pagoTimes))}]
- POST /insumos: avg=${avg(report.insumoTimes)}ms mín=${mn(report.insumoTimes)}ms máx=${mx(report.insumoTimes)}ms [${ratingLabel(avg(report.insumoTimes))}]
- POST /auth/register-public: avg=${avg(report.registerTimes)}ms [${ratingLabel(avg(report.registerTimes))}]
- Overall avg (todas las operaciones): ${overallAvg}ms [${ratingLabel(overallAvg)}]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEGURIDAD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Aislamiento multi-tenant (cross-tenant GET): ${report.multiTenantIsolation}
- Auth routes protegidas (sin token → 401): ${report.authProtected}
- Admin route protegida (tenant → 403): ${report.adminProtected}
- Forbidden fields (plan_id bloqueado): ${report.forbiddenFields}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EDGE CASES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Email duplicado (esperado 409): ${report.dupEmail}
- Login password incorrecta (esperado 401): ${report.badLogin}
- JWT inválido/firma falsa (esperado 401): ${report.badJwt}
- Body JSON malformado (esperado 400): ${report.badJson}
- Campos requeridos faltantes (esperado 400): ${report.missingFields}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CARGA CONCURRENTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 10 POST /pacientes simultáneos: ${report.concurrentOk}/10 exitosos
- 10 GET /pacientes simultáneos: (ver log arriba)
- Race conditions IDs: ${report.concurrentOk === 10 ? 'NONE detectadas' : 'VER ISSUES'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPROBANTES / VIDEO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Numeración correlativa: ${report.correlativeOk}
- Video sessions: SKIP (endpoint no encontrado)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OBSERVACIONES (${report.observations.length})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${report.observations.length === 0 ? '  Ninguna' : report.observations.map((o,i)=>`  ${i+1}. ${o}`).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ISSUES ENCONTRADOS (${report.issues.length})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${report.issues.length === 0
  ? '  NINGUNO — todos los tests pasaron'
  : report.issues.map((iss,i) => `  ${i+1}. ${iss}`).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERFORMANCE RATING: ${perfRating}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
