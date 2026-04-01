-- Migración 022: Corregir tipos de ID en adjuntos (INTEGER → TEXT)
-- En SQLite no se pueden cambiar tipos de columnas directamente.
-- Se recrea la tabla con los tipos correctos.

-- Crear tabla temporal con tipos correctos
CREATE TABLE IF NOT EXISTS adjuntos_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  paciente_id TEXT NOT NULL,
  evolucion_id TEXT,
  nombre_archivo TEXT NOT NULL,
  tipo_mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  tamano INTEGER DEFAULT 0,
  r2_key TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  subido_por TEXT,
  subido_por_nombre TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  activo INTEGER DEFAULT 1
);

-- Copiar datos existentes (convierte INTEGER a TEXT automáticamente en SQLite)
INSERT OR IGNORE INTO adjuntos_new
  SELECT id, CAST(tenant_id AS TEXT), CAST(paciente_id AS TEXT), evolucion_id,
         nombre_archivo, tipo_mime, tamano, r2_key, descripcion,
         CAST(subido_por AS TEXT), subido_por_nombre, created_at, activo
  FROM adjuntos;

-- Eliminar tabla antigua y renombrar
DROP TABLE adjuntos;
ALTER TABLE adjuntos_new RENAME TO adjuntos;

-- Recrear índices
CREATE INDEX IF NOT EXISTS idx_adjuntos_paciente ON adjuntos(paciente_id, tenant_id, activo);
CREATE INDEX IF NOT EXISTS idx_adjuntos_evolucion ON adjuntos(evolucion_id, activo);
