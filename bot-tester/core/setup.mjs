/**
 * Prepara los tenants QA:
 * 1. Login superadmin
 * 2. Para cada slot (0-49): intenta login, si falla → registra la cuenta
 * 3. Devuelve array de { email, token, id }
 */
import { CONFIG } from '../config.mjs'
import { createHttp } from './http.mjs'
import { qaEmail, sleep } from './data.mjs'

const http = createHttp()

export async function loginSuperadmin() {
  const r = await http.post('/auth/login', {
    email:    CONFIG.SUPERADMIN_EMAIL,
    password: CONFIG.SUPERADMIN_PASSWORD,
  })
  if (!r.ok) throw new Error(`Superadmin login falló: ${r.status} ${JSON.stringify(r.data)}`)
  const token = r.data?.data?.token
  if (!token) throw new Error('Superadmin login: no se recibió token')
  console.log('  ✅ Superadmin logueado')
  return token
}

export async function setupTenants() {
  // Intenta loguear cada cuenta QA directamente (ya deberían existir).
  // Si alguna no existe, intenta crearla vía superadmin (opcional).
  let adminToken = null
  try { adminToken = await loginSuperadmin() } catch {}

  const tenants = []
  const BATCH   = 10

  for (let start = 0; start < CONFIG.QA_COUNT; start += BATCH) {
    const batch = []
    for (let i = start; i < Math.min(start + BATCH, CONFIG.QA_COUNT); i++) {
      batch.push(setupOneTenant(i, adminToken))
    }
    const results = await Promise.all(batch)
    for (const t of results) {
      if (t) tenants.push(t)
    }
    process.stdout.write(`  Tenants preparados: ${tenants.length}/${CONFIG.QA_COUNT}\r`)
    await sleep(150)
  }

  if (tenants.length === 0) {
    throw new Error('Ninguna cuenta QA respondió. Verificá la URL y la conexión.')
  }

  console.log(`\n  ✅ ${tenants.length} tenants QA listos`)
  return tenants
}

async function setupOneTenant(n, adminToken) {
  const email    = qaEmail(n, CONFIG.QA_TS)
  const password = CONFIG.QA_PASSWORD

  // Intentar login directo (la cuenta ya debería existir)
  const loginRes = await http.post('/auth/login', { email, password })
  if (loginRes.ok) {
    const token = loginRes.data?.data?.token
    const id    = loginRes.data?.data?.id
    if (token) return { email, token, id, n }
  }

  // Si no existe y no hay superadmin token, no podemos crearla
  if (!adminToken) return null

  // Crear vía registro público
  const regRes = await http.post('/auth/register', {
    email,
    password,
    nombre:    'QA',
    apellido:  `Bot-${n}`,
    nombre_consultorio: `Consultorio QA ${n}`,
  })

  if (!regRes.ok) {
    // Si es duplicado (ya existe pero con distinto pass) ignorar
    return null
  }

  const token = regRes.data?.data?.token
  const id    = regRes.data?.data?.id
  if (!token) return null

  // Completar onboarding básico para que no redirija
  await http.post('/onboarding', {
    especialidad:       'odontologia_general',
    num_profesionales:  1,
    tiene_recepcion:    false,
    tipo_cobro:         'prestacion',
    nombre_consultorio: `Consultorio QA ${n}`,
  }, token)

  return { email, token, id, n }
}

// Re-login un tenant (los tokens expiran)
export async function refreshToken(tenant) {
  const r = await http.post('/auth/login', { email: tenant.email, password: CONFIG.QA_PASSWORD })
  if (r.ok) {
    tenant.token = r.data?.data?.token ?? tenant.token
  }
  return tenant
}
