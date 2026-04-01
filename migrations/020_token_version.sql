-- Migración 020: Agregar token_version a usuarios para invalidar JWTs al cambiar contraseña
-- Cada vez que el usuario cambia su contraseña, token_version se incrementa.
-- El JWT lleva el token_version en el payload; si no coincide con el DB, se rechaza.

ALTER TABLE usuarios ADD COLUMN token_version INTEGER DEFAULT 1;
