-- ============================================================
-- Migration 006: Plan features + Sistema config
-- ============================================================

-- Agregar features JSON a cada plan
ALTER TABLE subscription_plans ADD COLUMN plan_features TEXT DEFAULT '{}';

UPDATE subscription_plans SET plan_features = '{"max_profesionales":1,"max_secretarios":1,"firma_digital":false,"crm":false,"reportes_avanzados":false,"insumos":false,"recetas_completas":false,"recordatorios":false,"exportar":true}' WHERE id = 'plan_starter';

UPDATE subscription_plans SET plan_features = '{"max_profesionales":3,"max_secretarios":2,"firma_digital":true,"crm":true,"reportes_avanzados":false,"insumos":false,"recetas_completas":true,"recordatorios":true,"exportar":true}' WHERE id = 'plan_pro';

UPDATE subscription_plans SET plan_features = '{"max_profesionales":999,"max_secretarios":999,"firma_digital":true,"crm":true,"reportes_avanzados":true,"insumos":true,"recetas_completas":true,"recordatorios":true,"exportar":true}' WHERE id = 'plan_clinica';

-- Tabla de configuración global del sistema (editable por superadmin)
CREATE TABLE IF NOT EXISTS sistema_config (
  clave    TEXT PRIMARY KEY,
  valor    TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO sistema_config (clave, valor) VALUES ('whatsapp_numero', '5491144755339');
INSERT OR IGNORE INTO sistema_config (clave, valor) VALUES ('whatsapp_activo', 'true');
INSERT OR IGNORE INTO sistema_config (clave, valor) VALUES ('app_nombre', 'Clingest');
INSERT OR IGNORE INTO sistema_config (clave, valor) VALUES ('app_url', 'https://clingest.app');
