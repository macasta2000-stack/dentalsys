-- Agrega campo de matrícula para colaboradores profesionales
-- (firma_digital ya fue agregado directamente vía D1 console)
ALTER TABLE colaboradores ADD COLUMN matricula TEXT DEFAULT '';
