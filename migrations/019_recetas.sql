-- Migración 019: Completar tabla recetas — agregar columna profesional_id y sus índices
-- La tabla recetas ya existía en producción pero sin profesional_id.
-- El endpoint la usa para filtrar recetas por profesional autenticado.

ALTER TABLE recetas ADD COLUMN profesional_id TEXT;

CREATE INDEX IF NOT EXISTS idx_recetas_tenant    ON recetas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recetas_paciente  ON recetas(tenant_id, paciente_id);
CREATE INDEX IF NOT EXISTS idx_recetas_profesional ON recetas(tenant_id, profesional_id);
