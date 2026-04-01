-- Agrega columnas tipo y notas a evoluciones
-- tipo: clasifica la evolución (consulta, tratamiento, control, urgencia, etc.)
-- notas: campo libre para anotaciones adicionales del profesional
ALTER TABLE evoluciones ADD COLUMN tipo TEXT DEFAULT 'consulta';
ALTER TABLE evoluciones ADD COLUMN notas TEXT;
