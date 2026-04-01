/**
 * Tests de UI real con Playwright.
 * Simula un profesional usando la app exactamente como lo haría un humano:
 * click, escribir, drag, abrir modales, arrastrar texto.
 *
 * Corre con: node bot-tester/index.mjs --browser
 * Requiere: cd bot-tester && npm install && npm run install-browser
 */
import { record } from '../core/report.mjs'
import { CONFIG } from '../config.mjs'
import { fakePaciente, sleep } from '../core/data.mjs'

const CAT = 'ui-browser'

async function withPage(browser, fn) {
  const ctx  = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  try {
    await fn(page)
  } catch (e) {
    record(CAT, 'browser-exception', false, 0, e.message?.slice(0, 120))
  } finally {
    await ctx.close()
  }
}

// ── Login ─────────────────────────────────────────────────────────────────
async function testLogin(page, email, password) {
  const t0 = Date.now()
  await page.goto(CONFIG.BASE_URL, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button:has-text("Ingresar")')
  try {
    await page.waitForURL(/\/$/, { timeout: 8000 })
    record(CAT, 'login-ui', true, Date.now() - t0)
    return true
  } catch {
    record(CAT, 'login-ui', false, Date.now() - t0, 'No navegó al dashboard')
    return false
  }
}

// ── Crear paciente desde UI ────────────────────────────────────────────────
async function testCrearPaciente(page) {
  const t0 = Date.now()
  try {
    await page.click('a[href="/pacientes"]', { timeout: 5000 })
    await page.waitForSelector('button:has-text("Nuevo")', { timeout: 5000 })
    await page.click('button:has-text("Nuevo")')
    await page.waitForSelector('.modal-overlay', { timeout: 3000 })

    const p = fakePaciente(Date.now())
    await page.fill('input[name="nombre"]',   p.nombre)
    await page.fill('input[name="apellido"]', p.apellido)
    await page.fill('input[name="telefono"]', p.telefono)
    await page.fill('input[name="email"]',    p.email)

    await page.click('button:has-text("Guardar")')
    await sleep(800)

    const modalGone = await page.$('.modal-overlay')
    record(CAT, 'crear-paciente-ui', !modalGone, Date.now() - t0,
      modalGone ? 'Modal no se cerró tras guardar' : '')
  } catch (e) {
    record(CAT, 'crear-paciente-ui', false, Date.now() - t0, e.message?.slice(0,80))
  }
}

// ── Test CRÍTICO: el drag-close bug ────────────────────────────────────────
// Reproduce exactamente lo que el usuario reportó:
// Mousedown dentro del modal (en un input) → arrastrar hacia fuera → soltar en overlay
// El modal NO debe cerrarse.
async function testModalDragClose(page) {
  const t0 = Date.now()
  try {
    // Abrir un modal que tenga inputs (ej: nuevo paciente)
    await page.click('a[href="/pacientes"]', { timeout: 5000 })
    await page.waitForSelector('button:has-text("Nuevo")', { timeout: 5000 })
    await page.click('button:has-text("Nuevo")')
    await page.waitForSelector('.modal-overlay', { timeout: 3000 })
    await sleep(300)

    // Obtener posición del input (dentro del modal)
    const input = await page.$('input[name="nombre"]')
    const iBox  = await input.boundingBox()

    // Obtener posición del overlay (fuera del modal)
    const overlay = await page.$('.modal-overlay')
    const oBox    = await overlay.boundingBox()

    if (!iBox || !oBox) {
      record(CAT, 'modal-drag-close', false, 0, 'No se pudo obtener bounding boxes')
      return
    }

    // Simular drag: mousedown en el input → mover al borde del overlay → soltar
    const startX = iBox.x + iBox.width / 2
    const startY = iBox.y + iBox.height / 2
    const endX   = oBox.x + 5   // esquina del overlay (fuera del modal)
    const endY   = oBox.y + 5

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await sleep(50)
    // Mover gradualmente para simular drag real
    for (let step = 0; step <= 10; step++) {
      const x = startX + (endX - startX) * (step / 10)
      const y = startY + (endY - startY) * (step / 10)
      await page.mouse.move(x, y)
      await sleep(20)
    }
    await page.mouse.up()
    await sleep(400)

    // El modal DEBE seguir visible
    const modalAun = await page.$('.modal-overlay')
    record(CAT, 'modal-drag-close', !!modalAun, Date.now() - t0,
      !modalAun ? '🐛 BUG CONFIRMADO: drag cierra el modal' : 'Modal resistió el drag ✅')

    // Cerrar con X o Cancel
    try {
      const cancelBtn = await page.$('button:has-text("Cancelar")')
      if (cancelBtn) await cancelBtn.click()
      else {
        const xBtn = await page.$('.modal-overlay button[aria-label="cerrar"]') ??
                     await page.$('.modal-overlay .btn-icon')
        if (xBtn) await xBtn.click()
      }
    } catch {}
  } catch (e) {
    record(CAT, 'modal-drag-close', false, Date.now() - t0, e.message?.slice(0,80))
  }
}

// ── Test: click en overlay NO cierra el modal ─────────────────────────────
async function testModalOverlayClick(page) {
  const t0 = Date.now()
  try {
    await page.click('a[href="/pacientes"]', { timeout: 5000 })
    await page.waitForSelector('button:has-text("Nuevo")', { timeout: 5000 })
    await page.click('button:has-text("Nuevo")')
    await page.waitForSelector('.modal-overlay', { timeout: 3000 })
    await sleep(300)

    // Click directo en el overlay (esquina superior izquierda = afuera del modal box)
    const overlay = await page.$('.modal-overlay')
    const oBox    = await overlay.boundingBox()
    if (oBox) {
      await page.mouse.click(oBox.x + 5, oBox.y + 5)
      await sleep(400)
      const modalAun = await page.$('.modal-overlay')
      record(CAT, 'modal-overlay-click-no-cierra', !!modalAun, Date.now() - t0,
        !modalAun ? 'Click en overlay cerró el modal (esperado según nueva regla)' : 'Modal NO cerró en click directo ✅')
    }

    // Limpiar
    try {
      const cancelBtn = await page.$('button:has-text("Cancelar")')
      if (cancelBtn) await cancelBtn.click()
    } catch {}
  } catch (e) {
    record(CAT, 'modal-overlay-click-no-cierra', false, Date.now() - t0, e.message?.slice(0,80))
  }
}

// ── Flujo completo: login → paciente → turno ──────────────────────────────
async function testFullFlow(page, email, password) {
  const logged = await testLogin(page, email, password)
  if (!logged) return

  await testCrearPaciente(page)
  await testModalDragClose(page)
  await testModalOverlayClick(page)

  // Dashboard carga
  const t0 = Date.now()
  await page.goto(CONFIG.BASE_URL, { waitUntil: 'networkidle' })
  const dash = await page.$('.dashboard, main, [class*="dashboard"]')
  record(CAT, 'dashboard-carga', !!dash, Date.now() - t0)

  // Navegar a agenda
  const t1 = Date.now()
  await page.click('a[href="/agenda"]').catch(() => {})
  await sleep(1000)
  record(CAT, 'agenda-ui-carga', !!(await page.$('.agenda, [class*="agenda"]')), Date.now() - t1)

  // Navegar a caja
  const t2 = Date.now()
  await page.click('a[href="/caja"]').catch(() => {})
  await sleep(800)
  record(CAT, 'caja-ui-carga', !!(await page.$('main')), Date.now() - t2)
}

// ── Runner principal ──────────────────────────────────────────────────────
export async function runBrowserTests(tenants) {
  let chromium
  try {
    const pw = await import('playwright')
    chromium = pw.chromium
  } catch {
    record(CAT, 'playwright-disponible', false, 0, 'npm install en bot-tester/ para habilitar tests de UI')
    return
  }

  const browser = await chromium.launch({ headless: true })
  try {
    for (let i = 0; i < 3 && i < tenants.length; i++) {
      await withPage(browser, async (page) => {
        await testFullFlow(page, tenants[i].email, CONFIG.QA_PASSWORD)
      })
    }
  } finally {
    await browser.close()
  }
}
