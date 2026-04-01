-- Agrega columnas faltantes a la tabla colaboradores
-- La tabla original no tenía apellido, telefono ni notas
ALTER TABLE colaboradores ADD COLUMN apellido TEXT DEFAULT '';
ALTER TABLE colaboradores ADD COLUMN telefono TEXT DEFAULT '';
ALTER TABLE colaboradores ADD COLUMN notas TEXT DEFAULT '';
