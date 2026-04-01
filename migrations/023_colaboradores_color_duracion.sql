-- Migración 023: Agregar color y duracion_default a colaboradores
ALTER TABLE colaboradores ADD COLUMN color TEXT DEFAULT '#4F46E5';
ALTER TABLE colaboradores ADD COLUMN duracion_default INTEGER DEFAULT 30;
