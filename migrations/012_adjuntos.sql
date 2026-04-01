-- Migration 012: Adjuntos / archivos por paciente
CREATE TABLE IF NOT EXISTS adjuntos (
  id TEXT PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  paciente_id INTEGER NOT NULL,
  nombre_archivo TEXT NOT NULL,
  tipo_mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  tamano INTEGER DEFAULT 0,
  r2_key TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  subido_por INTEGER,
  subido_por_nombre TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  activo INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_adjuntos_paciente
  ON adjuntos(paciente_id, tenant_id, activo);
