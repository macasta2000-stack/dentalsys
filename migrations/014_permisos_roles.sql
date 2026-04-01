-- ============================================================
-- Migration 014: Permisos por rol + feature overrides
-- ============================================================

-- Capa 2: el superadmin puede activar features extra por tenant
ALTER TABLE configuracion ADD COLUMN features_override TEXT DEFAULT NULL;

-- Capa 3: el admin del consultorio configura qué ve cada rol
ALTER TABLE configuracion ADD COLUMN permisos_roles TEXT DEFAULT NULL;

-- Fix: todos los planes deben permitir al profesional emitir recetas/órdenes
UPDATE subscription_plans
SET plan_features = '{"max_profesionales":1,"max_secretarios":1,"firma_digital":false,"crm":false,"reportes_avanzados":false,"insumos":false,"recetas_completas":true,"recordatorios":false,"exportar":true}'
WHERE id = 'plan_starter';
