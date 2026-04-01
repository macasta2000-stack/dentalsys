-- ============================================================
-- MIGRACIÓN 005 — SaaS Billing: planes, suscripciones, pagos
-- ============================================================

-- Planes de suscripción (catálogo global, no por tenant)
CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio_mensual REAL NOT NULL,
  precio_anual REAL,
  max_pacientes INTEGER,
  max_colaboradores INTEGER DEFAULT 1,
  features TEXT DEFAULT '[]',
  activo INTEGER DEFAULT 1,
  orden INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Suscripción activa por tenant
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
  estado TEXT DEFAULT 'trial' CHECK (estado IN ('trial','activa','vencida','cancelada','pendiente_pago')),
  ciclo TEXT DEFAULT 'mensual' CHECK (ciclo IN ('mensual','anual')),
  fecha_inicio TEXT NOT NULL,
  fecha_fin TEXT NOT NULL,
  fecha_cancelacion TEXT,
  mp_preapproval_id TEXT,
  notas TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Historial de transacciones de pago
CREATE TABLE IF NOT EXISTS payment_transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES usuarios(id),
  subscription_id TEXT REFERENCES tenant_subscriptions(id),
  mp_payment_id TEXT UNIQUE,
  mp_preference_id TEXT,
  tipo TEXT DEFAULT 'subscription' CHECK (tipo IN ('subscription','renewal','upgrade','trial','manual','refund')),
  estado TEXT NOT NULL CHECK (estado IN ('pending','approved','rejected','cancelled','refunded','manual')),
  monto REAL NOT NULL DEFAULT 0,
  moneda TEXT DEFAULT 'ARS',
  plan_id TEXT REFERENCES subscription_plans(id),
  ciclo TEXT DEFAULT 'mensual',
  raw_webhook TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Log de emails enviados
CREATE TABLE IF NOT EXISTS email_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES usuarios(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('welcome','trial_expiry','payment_receipt','renewal_reminder','suspension','activation')),
  destinatario TEXT NOT NULL,
  asunto TEXT NOT NULL,
  estado TEXT DEFAULT 'sent' CHECK (estado IN ('sent','failed','bounced')),
  resend_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Columnas adicionales en usuarios
ALTER TABLE usuarios ADD COLUMN plan_id TEXT REFERENCES subscription_plans(id);
ALTER TABLE usuarios ADD COLUMN mp_customer_id TEXT;

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_tenant_subs_tenant ON tenant_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subs_estado ON tenant_subscriptions(estado, fecha_fin);
CREATE INDEX IF NOT EXISTS idx_payment_txn_tenant ON payment_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_txn_mp ON payment_transactions(mp_payment_id);
CREATE INDEX IF NOT EXISTS idx_email_log_tenant ON email_log(tenant_id, tipo);
