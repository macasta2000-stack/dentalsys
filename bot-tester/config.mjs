export const CONFIG = {
  BASE_URL:            'https://odontologo-228.pages.dev',
  SUPERADMIN_EMAIL:    'macasta2000@gmail.com',
  SUPERADMIN_PASSWORD: 'Superadmin321',
  QA_PASSWORD:         'QATest2024!',
  QA_TS:               '1774903578029',
  QA_COUNT:            50,
  API_WORKERS:         20,
  BROWSER_WORKERS:     2,
  BROWSER_ENABLED:     process.argv.includes('--browser'),
  REPORT_INTERVAL_MS:  60_000,
  REPORT_FILE:         '../AUDIT_REPORT.md',
  LOG_FILE:            '../audit-log.jsonl',
  REQUEST_TIMEOUT_MS:  15_000,
  SLOW_THRESHOLD_MS:   2_000,

  // ── Presupuesto Cloudflare Workers ($5/mes = 10M requests) ────────────────
  // Límite TOTAL del bot este mes: 8.7M (deja 1.3M de buffer para users reales)
  // El bot se auto-frena al llegar a este número — no gasta más
  MONTHLY_REQUEST_LIMIT: 8_700_000,

  // Ya consumidos en runs anteriores (se suma al contador al arrancar)
  REQUESTS_ALREADY_USED: 300_000,

  // Pausa entre ciclos de worker (ms) — 300ms × 20 workers ≈ 60 req/s
  WORKER_MIN_PAUSE_MS: 300,
}
