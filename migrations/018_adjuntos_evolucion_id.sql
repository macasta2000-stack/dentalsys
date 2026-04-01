-- Migration 018: Vincular adjuntos a evoluciones
ALTER TABLE adjuntos ADD COLUMN evolucion_id TEXT;

CREATE INDEX IF NOT EXISTS idx_adjuntos_evolucion
  ON adjuntos(evolucion_id, activo);
