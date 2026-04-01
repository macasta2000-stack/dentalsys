-- Migration 024: Fix email_log CHECK + add video_sessions + facturas

-- 1. Recrear email_log con tipo expandido (SQLite no permite ALTER CHECK)
DROP TABLE IF EXISTS email_log_old;
ALTER TABLE email_log RENAME TO email_log_old;

CREATE TABLE email_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES usuarios(id),
  tipo TEXT NOT NULL CHECK (tipo IN (
    'welcome','trial_expiry','payment_receipt','renewal_reminder',
    'suspension','activation','password_reset',
    'turno_confirmacion','turno_recordatorio','turno_cancelacion'
  )),
  destinatario TEXT NOT NULL,
  asunto TEXT NOT NULL,
  estado TEXT DEFAULT 'sent' CHECK (estado IN ('sent','failed','bounced')),
  resend_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO email_log SELECT * FROM email_log_old;
DROP TABLE email_log_old;

-- 2. Video sessions (Jitsi Meet)
CREATE TABLE IF NOT EXISTS video_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  turno_id TEXT REFERENCES turnos(id) ON DELETE SET NULL,
  paciente_id TEXT REFERENCES pacientes(id) ON DELETE SET NULL,
  room_name TEXT NOT NULL UNIQUE,
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','finalizada','cancelada')),
  iniciada_at TEXT,
  finalizada_at TEXT,
  link_paciente TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 3. Comprobantes / facturas internas
CREATE TABLE IF NOT EXISTS comprobantes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  paciente_id TEXT REFERENCES pacientes(id) ON DELETE SET NULL,
  numero INTEGER NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'recibo' CHECK (tipo IN ('recibo','presupuesto_aprobado')),
  fecha TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]',  -- JSON array [{descripcion, cantidad, precio_unitario, subtotal}]
  subtotal REAL NOT NULL DEFAULT 0,
  descuento REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  pago_id TEXT REFERENCES pagos(id) ON DELETE SET NULL,
  notas TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Sequence for comprobante numbers per tenant
CREATE TABLE IF NOT EXISTS comprobante_seq (
  tenant_id TEXT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  ultimo_numero INTEGER NOT NULL DEFAULT 0
);
