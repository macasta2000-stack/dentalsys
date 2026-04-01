-- Migration 017: Add password reset token fields to usuarios
-- Used by forgot-password / reset-password flow

ALTER TABLE usuarios ADD COLUMN reset_token TEXT;
ALTER TABLE usuarios ADD COLUMN reset_token_expires TEXT;
