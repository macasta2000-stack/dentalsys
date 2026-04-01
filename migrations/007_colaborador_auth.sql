-- ============================================================
-- Colaborador Auth: permite que cada colaborador tenga login
-- propio con email + contraseña
-- ============================================================

-- Password hash para login propio del colaborador
-- (firma_digital ya existía de una migración anterior)
ALTER TABLE colaboradores ADD COLUMN password_hash TEXT DEFAULT NULL;
