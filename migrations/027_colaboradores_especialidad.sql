-- Migration 027: Campo especialidad en colaboradores
ALTER TABLE colaboradores ADD COLUMN especialidad TEXT DEFAULT '';
