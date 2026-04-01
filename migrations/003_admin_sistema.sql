-- ============================================================
-- MIGRACIÓN 003: Sistema de administración y suscripciones
-- ============================================================
-- Agrega rol, estado y datos de suscripción a la tabla usuarios

ALTER TABLE usuarios ADD COLUMN rol TEXT NOT NULL DEFAULT 'tenant';
ALTER TABLE usuarios ADD COLUMN estado TEXT NOT NULL DEFAULT 'activo';
ALTER TABLE usuarios ADD COLUMN trial_hasta TEXT;
ALTER TABLE usuarios ADD COLUMN notas TEXT;

-- IMPORTANTE: Luego de correr esta migración, ejecutar:
-- UPDATE usuarios SET rol = 'superadmin' WHERE email = 'TU_EMAIL_AQUI';
