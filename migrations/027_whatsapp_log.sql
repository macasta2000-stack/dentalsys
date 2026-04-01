-- Feature: WhatsApp notification log
CREATE TABLE IF NOT EXISTS whatsapp_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  paciente_id TEXT,
  telefono TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  tipo TEXT DEFAULT 'manual' CHECK(tipo IN ('manual','confirmacion','recordatorio','cancelacion','seguimiento')),
  estado TEXT DEFAULT 'generado' CHECK(estado IN ('generado','enviado','fallido')),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wa_log_tenant ON whatsapp_log(tenant_id);
