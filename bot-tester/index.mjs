/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         CLINGEST BOT TESTER — Auditoría Beta                 ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Uso:
 *   node bot-tester/index.mjs            → solo API (millones de tests)
 *   node bot-tester/index.mjs --browser  → API + browser real (Playwright)
 *
 * Requiere Node 18+ (fetch nativo).
 * Para tests de browser: cd bot-tester && npm install && npm run install-browser
 */

import { CONFIG }          from './config.mjs'
import { setupTenants }    from './core/setup.mjs'
import { createReporter, STATS } from './core/report.mjs'
import { sleep, rand, randInt } from './core/data.mjs'
import { runWorkflow }     from './scenarios/workflow.mjs'
import { runSecurityTests }from './scenarios/security.mjs'
import { runEdgeCases }    from './scenarios/edge.mjs'
import { runStress }       from './scenarios/stress.mjs'
import { runBrowserTests } from './browser/ui-tests.mjs'

// ── Escenarios disponibles con sus pesos (más peso = más frecuencia) ──────
const SCENARIOS = [
  { name: 'workflow',  weight: 50, fn: (t, all) => runWorkflow(t) },
  { name: 'edge',      weight: 20, fn: (t, all) => runEdgeCases(t) },
  { name: 'stress',    weight: 15, fn: (t, all) => runStress(all) },
  { name: 'security',  weight: 15, fn: (t, all) => runSecurityTests(all) },
]

// Weighted random pick
function pickScenario() {
  const total  = SCENARIOS.reduce((s, sc) => s + sc.weight, 0)
  let   pick   = Math.random() * total
  for (const sc of SCENARIOS) {
    pick -= sc.weight
    if (pick <= 0) return sc
  }
  return SCENARIOS[0]
}

// ── Worker: un "usuario virtual" que corre en loop ────────────────────────
// Cada worker tiene su PROPIA copia del tenant — no comparten token
// ── Contador TOTAL de requests (presupuesto mensual) ─────────────────────
let totalRequests = CONFIG.REQUESTS_ALREADY_USED || 0
const MONTHLY_LIMIT = CONFIG.MONTHLY_REQUEST_LIMIT || 8_700_000

// Sincronizar contador con STATS para que el dashboard lo muestre
STATS.dailyLimit = MONTHLY_LIMIT  // reusar campo para mostrar en dashboard
let _reqCount = 0
setInterval(() => {
  totalRequests += (STATS.total - _reqCount)
  _reqCount = STATS.total
  STATS.dailyRequests = totalRequests  // reusar campo
}, 1000)

async function apiWorker(workerId, tenants) {
  const myTenant = { ...tenants[workerId % tenants.length] }

  while (true) {
    // ── Freno si se supera el límite MENSUAL ─────────────────────────────
    if (totalRequests >= MONTHLY_LIMIT) {
      const pct = ((totalRequests / 10_000_000) * 100).toFixed(1)
      process.stdout.write(`\n🛑  Límite mensual alcanzado: ${totalRequests.toLocaleString()} / 10M (${pct}%). Bot detenido para proteger tu plan.\r`)
      await sleep(60_000)
      continue
    }

    const scenario = pickScenario()
    try {
      await scenario.fn(myTenant, tenants)
    } catch {}

    await sleep(CONFIG.WORKER_MIN_PAUSE_MS + randInt(0, 100))
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.clear()
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║         🦷 CLINGEST BOT TESTER — Auditoría Beta              ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log()
  console.log(`  URL:      ${CONFIG.BASE_URL}`)
  console.log(`  Workers:  ${CONFIG.API_WORKERS} API + ${CONFIG.BROWSER_ENABLED ? CONFIG.BROWSER_WORKERS : 0} browser`)
  console.log(`  QA tenants: ${CONFIG.QA_COUNT}`)
  console.log()

  // Preparar tenants
  let tenants
  try {
    tenants = await setupTenants()
  } catch (e) {
    console.error('\n❌ No se pudo preparar los tenants QA:', e.message)
    console.error('   Verificá que la app esté en línea y las credenciales sean correctas.')
    process.exit(1)
  }

  if (tenants.length === 0) {
    console.error('\n❌ No hay tenants disponibles. Verificá las credenciales.')
    process.exit(1)
  }

  // Iniciar reporter (refresca pantalla cada 2s, guarda AUDIT_REPORT.md cada 60s)
  const reporter = createReporter()

  // Lanzar workers API en paralelo (no esperamos a que terminen — corren para siempre)
  const workers = []
  for (let i = 0; i < CONFIG.API_WORKERS; i++) {
    workers.push(apiWorker(i, tenants))
  }

  // Lanzar workers de browser si se pidió
  if (CONFIG.BROWSER_ENABLED) {
    const browserLoop = async () => {
      while (true) {
        await runBrowserTests(tenants)
        await sleep(5000) // pausa entre ciclos de browser
      }
    }
    for (let i = 0; i < CONFIG.BROWSER_WORKERS; i++) {
      workers.push(browserLoop())
    }
  }

  // Ctrl+C graceful
  process.on('SIGINT', () => {
    reporter.stop()
    const duration = Math.floor((Date.now() - STATS.startTime) / 1000)
    const rate     = STATS.total > 0 ? ((STATS.pass / STATS.total) * 100).toFixed(2) : '0.00'
    console.log('\n')
    console.log('═'.repeat(60))
    console.log('  RESUMEN FINAL')
    console.log('═'.repeat(60))
    console.log(`  Duración:   ${Math.floor(duration/3600)}h ${Math.floor((duration%3600)/60)}m ${duration%60}s`)
    console.log(`  Total:      ${STATS.total.toLocaleString()}`)
    console.log(`  Pass:       ${STATS.pass.toLocaleString()}`)
    console.log(`  Fail:       ${STATS.fail.toLocaleString()}`)
    console.log(`  Tasa éxito: ${rate}%`)
    console.log(`  Informe:    AUDIT_REPORT.md`)
    console.log('═'.repeat(60))
    if (parseFloat(rate) >= 99.5) {
      console.log('\n  ✅ APTO PARA BETA — tasa de éxito excelente\n')
    } else if (parseFloat(rate) >= 95) {
      console.log('\n  ⚠️  REVISAR ANTES DEL LAUNCH — hay fallas a investigar\n')
    } else {
      console.log('\n  ❌ NO APTO PARA BETA — demasiados errores\n')
    }
    process.exit(0)
  })

  // Esperar para siempre (los workers nunca terminan)
  await Promise.race(workers)
}

main().catch(e => {
  console.error('Error fatal:', e)
  process.exit(1)
})
