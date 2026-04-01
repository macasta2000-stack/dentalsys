-- ============================================================
-- MIGRACIÓN 028 — IA: créditos y uso por tenant
-- ============================================================

-- Uso de créditos IA por mes
CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('notas_clinicas','sugerencia_tratamiento','whatsapp','resumen_paciente')),
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  creditos INTEGER DEFAULT 1,
  modelo TEXT DEFAULT 'claude-haiku-4-5-20251001',
  prompt_resumen TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant_month ON ai_usage(tenant_id, created_at);

-- Agregar ai_creditos a plan_features de cada plan
UPDATE subscription_plans SET plan_features = json_set(plan_features, '$.ia_creditos', 0) WHERE id = 'plan_starter';
UPDATE subscription_plans SET plan_features = json_set(plan_features, '$.ia_creditos', 150) WHERE id = 'plan_pro';
UPDATE subscription_plans SET plan_features = json_set(plan_features, '$.ia_creditos', -1) WHERE id = 'plan_clinica';
-- -1 = ilimitado
