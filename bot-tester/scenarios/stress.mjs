/**
 * Prueba de carga: muchos usuarios simultáneos haciendo operaciones reales.
 * Detecta race conditions, deadlocks en D1, errores 500 bajo presión.
 */
import { createHttp } from '../core/http.mjs'
import { record } from '../core/report.mjs'
import { fakePaciente, fakeTurno, fakePago, sleep } from '../core/data.mjs'
import { refreshToken } from '../core/setup.mjs'

const http = createHttp()
const CAT  = 'carga'

const D = (r) => r.ok ? '' : `${r.status} ${r.error ?? JSON.stringify(r.data?.error ?? r.data).slice(0,60)}`

// Pool persistente por módulo — tokens refrescados sobreviven entre llamadas
let _pool = null

export async function runStress(tenants) {
  if (!tenants.length) return

  // Copias privadas — máximo 8 concurrentes (D1/SQLite no tolera más sin errores)
  // Se reutiliza el pool para que los tokens refrescados persistan entre llamadas
  if (!_pool) _pool = tenants.slice(0, 8).map(t => ({ ...t }))
  const pool = _pool
  const hoy  = new Date().toISOString().slice(0,10)

  // ── Test 1: Múltiples tenants leen su agenda simultáneamente ──────────────
  await Promise.all(pool.map(async t => {
    const r = await http.getT(`/turnos?fecha=${hoy}`, t)
    record(CAT, 'agenda-concurrente', r.ok, r.ms, D(r))
  }))

  // ── Test 2: 20 tenants crean pacientes al mismo tiempo ────────────────────
  const results = (await Promise.all(pool.map(async (t, i) => {
    const r = await http.postT('/pacientes', fakePaciente(Date.now() + i), t)
    record(CAT, 'paciente-concurrente', r.ok, r.ms, D(r))
    return r.ok ? { tenant: t, pacId: r.data?.data?.id } : null
  }))).filter(Boolean)

  // ── Test 3: Los mismos tenants crean turnos ───────────────────────────────
  await Promise.all(results.slice(0, 10).map(async ({ tenant, pacId }) => {
    if (!pacId) return
    const r = await http.postT('/turnos', fakeTurno(pacId), tenant)
    record(CAT, 'turno-concurrente', r.ok, r.ms, D(r))
  }))

  // ── Test 4: Ráfaga de lecturas (moderada — no sobresaturar D1) ──────────────
  if (pool[0]) {
    await Promise.all(Array.from({ length: 8 }, () =>
      http.getT(`/turnos?fecha=${hoy}`, pool[0])
        .then(r => record(CAT, 'rafaga-lectura', r.ok, r.ms, D(r)))
    ))
  }

  // ── Test 5: Escrituras concurrentes sobre el mismo paciente ──────────────
  if (results[0]?.pacId) {
    const { pacId, tenant } = results[0]
    await Promise.all(Array.from({ length: 10 }, (_, i) =>
      http.patchT(`/pacientes/${pacId}`, { notas: `Conc ${i}` }, tenant)
        .then(r => record(CAT, 'escritura-concurrente', r.ok, r.ms, D(r)))
    ))
  }

  // ── Test 6: Pagos simultáneos ─────────────────────────────────────────────
  await Promise.all(results.slice(0, 8).map(async ({ tenant, pacId }) => {
    if (!pacId) return
    const r = await http.postT('/pagos', fakePago(pacId), tenant)
    record(CAT, 'pago-concurrente', r.ok, r.ms, D(r))
  }))
}
