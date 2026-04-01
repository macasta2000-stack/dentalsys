-- ============================================================
-- Migration 015: API Keys para acceso programático
-- ============================================================

-- Tabla de claves API (una por tenant, puede tener varias)
CREATE TABLE IF NOT EXISTS api_keys (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  nombre      TEXT NOT NULL DEFAULT 'Mi API Key',
  key_prefix  TEXT NOT NULL,             -- primeros 12 chars (para mostrar)
  key_hash    TEXT NOT NULL UNIQUE,      -- SHA-256 de la clave completa
  activo      INTEGER DEFAULT 1,
  last_used_at TIMESTAMP,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash   ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);

-- Agregar api_access a los planes (solo plan_clinica lo tiene)
UPDATE subscription_plans
SET plan_features = '{"max_profesionales":1,"max_secretarios":1,"firma_digital":false,"crm":false,"reportes_avanzados":false,"insumos":false,"recetas_completas":true,"recordatorios":false,"exportar":true,"api_access":false}'
WHERE id = 'plan_starter';

UPDATE subscription_plans
SET plan_features = '{"max_profesionales":3,"max_secretarios":2,"firma_digital":true,"crm":true,"reportes_avanzados":false,"insumos":false,"recetas_completas":true,"recordatorios":true,"exportar":true,"api_access":false}'
WHERE id = 'plan_pro';

UPDATE subscription_plans
SET plan_features = '{"max_profesionales":999,"max_secretarios":999,"firma_digital":true,"crm":true,"reportes_avanzados":true,"insumos":true,"recetas_completas":true,"recordatorios":true,"exportar":true,"api_access":true}'
WHERE id = 'plan_clinica';
