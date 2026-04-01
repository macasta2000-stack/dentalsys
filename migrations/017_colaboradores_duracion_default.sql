-- Agrega campo duracion_default a colaboradores para configurar
-- la duración de turno por defecto de cada profesional
ALTER TABLE colaboradores ADD COLUMN duracion_default INTEGER DEFAULT 30;
