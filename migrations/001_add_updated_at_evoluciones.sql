-- Agregar columna updated_at a evoluciones (faltaba en el schema original)
-- Ejecutar con: wrangler d1 execute dentalsys-db --file=migrations/001_add_updated_at_evoluciones.sql
ALTER TABLE evoluciones ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));
