-- Migration 010: Tracking de último login por usuario
-- Permite al superadmin ver si los clientes están activos

ALTER TABLE usuarios ADD COLUMN last_login_at TEXT;
