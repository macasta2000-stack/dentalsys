import { writeFileSync, appendFileSync } from 'fs'
import { CONFIG } from '../config.mjs'

// ── Estado global compartido entre workers ────────────────────────────────
export const STATS = {
  startTime:      Date.now(),
  total:          0,
  pass:           0,
  fail:           0,
  slow:           0,
  categories:     {},   // { auth: { pass, fail, times[] }, ... }
  failures:       [],   // últimas 100 fallas
  times:          [],   // últimas 5000 latencias (circular)
  reqPerSec:      0,
  _lastTotal:     0,
  _lastTick:      Date.now(),
  dailyRequests:  0,
  dailyLimit:     0,
}

export function record(category, label, passed, ms, detail = '') {
  STATS.total++
  if (passed) STATS.pass++
  else {
    STATS.fail++
    const entry = { ts: new Date().toISOString(), category, label, detail }
    STATS.failures.unshift(entry)
    if (STATS.failures.length > 100) STATS.failures.pop()
    try {
      appendFileSync(CONFIG.LOG_FILE, JSON.stringify(entry) + '\n')
    } catch {}
  }
  if (ms > CONFIG.SLOW_THRESHOLD_MS) STATS.slow++
  STATS.times.push(ms)
  if (STATS.times.length > 5000) STATS.times.shift()

  if (!STATS.categories[category]) STATS.categories[category] = { pass: 0, fail: 0, times: [] }
  if (passed) STATS.categories[category].pass++
  else        STATS.categories[category].fail++
  STATS.categories[category].times.push(ms)
  if (STATS.categories[category].times.length > 1000) STATS.categories[category].times.shift()
}

function pct(arr, p) {
  if (!arr.length) return 0
  const s = [...arr].sort((a,b) => a-b)
  return s[Math.floor(s.length * p / 100)]
}
function avg(arr) { return arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0 }
function elapsed() {
  const s = Math.floor((Date.now() - STATS.startTime) / 1000)
  const h = String(Math.floor(s/3600)).padStart(2,'0')
  const m = String(Math.floor((s%3600)/60)).padStart(2,'0')
  const ss= String(s%60).padStart(2,'0')
  return `${h}:${m}:${ss}`
}

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  cyan:  '\x1b[36m', white: '\x1b[37m', gray: '\x1b[90m',
  bgBlue: '\x1b[44m', bgRed: '\x1b[41m', bgGreen: '\x1b[42m',
}

function colorRate(rate) {
  if (rate >= 99.5) return `${C.green}${rate.toFixed(2)}%${C.reset}`
  if (rate >= 95)   return `${C.yellow}${rate.toFixed(2)}%${C.reset}`
  return `${C.red}${rate.toFixed(2)}%${C.reset}`
}

export function printDashboard() {
  // Calcular req/s
  const now    = Date.now()
  const delta  = (now - STATS._lastTick) / 1000
  STATS.reqPerSec = Math.round((STATS.total - STATS._lastTotal) / delta)
  STATS._lastTotal = STATS.total
  STATS._lastTick  = now

  const rate   = STATS.total > 0 ? (STATS.pass / STATS.total) * 100 : 0
  const avgMs  = avg(STATS.times)
  const p95    = pct(STATS.times, 95)
  const p99    = pct(STATS.times, 99)
  const W      = 66

  const line = '─'.repeat(W)
  const dline= '═'.repeat(W)

  process.stdout.write('\x1b[2J\x1b[H') // clear screen

  console.log(`${C.cyan}${C.bold}╔${dline}╗${C.reset}`)
  console.log(`${C.cyan}${C.bold}║${C.reset}${C.bold}        🦷 CLINGEST BOT TESTER — AUDITORIA BETA ${C.reset}${' '.repeat(W-47)}${C.cyan}${C.bold}║${C.reset}`)
  console.log(`${C.cyan}${C.bold}╠${dline}╣${C.reset}`)
  const urlLine = ` ⏱  ${elapsed()}    📡 ${CONFIG.BASE_URL}`
  console.log(`${C.cyan}║${C.reset} ${urlLine}${' '.repeat(W - urlLine.length - 1)}${C.cyan}║${C.reset}`)
  console.log(`${C.cyan}╠${line}╣${C.reset}`)

  // totals
  const totalLine = ` TOTAL        PASS           FAIL          TASA           req/s`
  console.log(`${C.cyan}║${C.reset}${C.bold}${totalLine}${' '.repeat(W-totalLine.length)}${C.cyan}║${C.reset}`)
  const nums = ` ${String(STATS.total).padEnd(13)} ${String(STATS.pass).padEnd(14)} ${String(STATS.fail).padEnd(13)} ${colorRate(rate)}${' '.repeat(14-colorRate(rate).replace(/\x1b\[\d+m/g,'').length)} ${STATS.reqPerSec}`
  // Color manual para fail
  const failStr = STATS.fail > 0 ? `${C.red}${STATS.fail}${C.reset}` : `${C.green}${STATS.fail}${C.reset}`
  const numsClean = ` ${String(STATS.total).padEnd(13)} ${C.green}${String(STATS.pass).padEnd(14)}${C.reset} ${failStr}${' '.repeat(14-String(STATS.fail).length)} ${colorRate(rate)}${' '.repeat(15-rate.toFixed(2).length-1)} ${String(STATS.reqPerSec).padEnd(6)}`
  console.log(`${C.cyan}║${C.reset}${numsClean}${' '.repeat(Math.max(0,W+1 - numsClean.replace(/\x1b\[\d+m/g,'').length))}${C.cyan}║${C.reset}`)

  console.log(`${C.cyan}╠${line}╣${C.reset}`)

  // Performance
  const perfLine = ` ⚡ avg ${avgMs}ms    p95 ${p95}ms    p99 ${p99}ms    🐢 lentos ${STATS.slow}`
  console.log(`${C.cyan}║${C.reset}${perfLine}${' '.repeat(W-perfLine.length)}${C.cyan}║${C.reset}`)
  console.log(`${C.cyan}╠${line}╣${C.reset}`)

  // Categories
  const cats = Object.entries(STATS.categories)
  if (cats.length) {
    console.log(`${C.cyan}║${C.reset}${C.bold}  CATEGORIA         PASS    FAIL    TASA        avg ms       ${C.reset}${' '.repeat(W-57)}${C.cyan}║${C.reset}`)
    console.log(`${C.cyan}║${C.reset}${' '.repeat(W)}${C.cyan}║${C.reset}`)
    for (const [cat, s] of cats) {
      const catRate  = (s.pass+s.fail) > 0 ? (s.pass/(s.pass+s.fail))*100 : 0
      const catAvg   = avg(s.times)
      const icon     = catRate >= 99 ? `${C.green}✅${C.reset}` : catRate >= 95 ? `${C.yellow}⚠️${C.reset}` : `${C.red}❌${C.reset}`
      const catLine  = `  ${icon} ${cat.padEnd(16)} ${String(s.pass).padEnd(7)} ${String(s.fail).padEnd(7)} ${colorRate(catRate).padEnd(8)}    ${catAvg}ms`
      console.log(`${C.cyan}║${C.reset}${catLine}${' '.repeat(Math.max(0,W - catLine.replace(/\x1b\[\d+m/g,'').length))}${C.cyan}║${C.reset}`)
    }
  }

  console.log(`${C.cyan}╠${line}╣${C.reset}`)
  // Últimas fallas
  console.log(`${C.cyan}║${C.reset}${C.bold}${C.red}  ÚLTIMAS FALLAS:${C.reset}${' '.repeat(W-17)}${C.cyan}║${C.reset}`)
  const recentFails = STATS.failures.slice(0, 5)
  if (recentFails.length === 0) {
    console.log(`${C.cyan}║${C.reset}  ${C.green}Sin fallas recientes 🎉${C.reset}${' '.repeat(W-24)}${C.cyan}║${C.reset}`)
  } else {
    for (const f of recentFails) {
      const line2 = `  ${f.ts.slice(11,19)} [${f.category}] ${f.label}: ${f.detail}`.slice(0, W-2)
      console.log(`${C.cyan}║${C.reset}${C.red}${line2}${C.reset}${' '.repeat(W-line2.length)}${C.cyan}║${C.reset}`)
    }
  }
  console.log(`${C.cyan}╚${dline}╝${C.reset}`)
  console.log(`${C.gray}  Informe en AUDIT_REPORT.md · Ctrl+C para detener${C.reset}`)
  if (STATS.dailyLimit > 0) {
    const pct = ((STATS.dailyRequests / STATS.dailyLimit) * 100).toFixed(1)
    console.log(`${C.gray}  Presupuesto diario: ${STATS.dailyRequests.toLocaleString()} / ${STATS.dailyLimit.toLocaleString()} req (${pct}%) — 10M/mes Cloudflare Workers${C.reset}`)
  }
}

export function generateReportFile() {
  const rate = STATS.total > 0 ? ((STATS.pass / STATS.total) * 100).toFixed(2) : '0.00'
  const avgMs = avg(STATS.times)
  const p95   = pct(STATS.times, 95)
  const p99   = pct(STATS.times, 99)

  let md = `# AUDIT REPORT — ClinGest Beta QA\n\n`
  md += `**Generado:** ${new Date().toISOString()}  \n`
  md += `**Tiempo de ejecución:** ${elapsed()}  \n`
  md += `**URL:** ${CONFIG.BASE_URL}  \n\n`
  md += `## Resumen General\n\n`
  md += `| Métrica | Valor |\n|---------|-------|\n`
  md += `| Total auditorías | ${STATS.total.toLocaleString()} |\n`
  md += `| Pasadas | ${STATS.pass.toLocaleString()} |\n`
  md += `| Fallidas | ${STATS.fail.toLocaleString()} |\n`
  md += `| Tasa de éxito | **${rate}%** |\n`
  md += `| Velocidad | ${STATS.reqPerSec} req/s |\n`
  md += `| Tiempo respuesta promedio | ${avgMs}ms |\n`
  md += `| Tiempo respuesta p95 | ${p95}ms |\n`
  md += `| Tiempo respuesta p99 | ${p99}ms |\n`
  md += `| Tests lentos (>${CONFIG.SLOW_THRESHOLD_MS}ms) | ${STATS.slow} |\n\n`

  md += `## Por Categoría\n\n`
  md += `| Categoría | Pass | Fail | Tasa | Avg ms |\n|-----------|------|------|------|--------|\n`
  for (const [cat, s] of Object.entries(STATS.categories)) {
    const r = (s.pass+s.fail) > 0 ? ((s.pass/(s.pass+s.fail))*100).toFixed(1) : '0.0'
    md += `| ${cat} | ${s.pass} | ${s.fail} | ${r}% | ${avg(s.times)}ms |\n`
  }

  md += `\n## Últimas 50 Fallas\n\n`
  if (STATS.failures.length === 0) {
    md += `_Sin fallas registradas — excelente estado para la beta_ ✅\n`
  } else {
    for (const f of STATS.failures.slice(0, 50)) {
      md += `- \`${f.ts}\` **[${f.category}]** ${f.label}: \`${f.detail}\`\n`
    }
  }

  try {
    writeFileSync(CONFIG.REPORT_FILE, md)
  } catch {}
}

export function createReporter() {
  const interval = setInterval(() => {
    printDashboard()
    generateReportFile()
  }, 2000)

  return {
    record,
    stop() {
      clearInterval(interval)
      generateReportFile()
      console.log('\n\n✅ Informe final guardado en AUDIT_REPORT.md\n')
    }
  }
}
