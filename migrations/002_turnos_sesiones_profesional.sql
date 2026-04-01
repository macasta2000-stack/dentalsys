-- Agrega columnas faltantes en turnos (necesarias para el formulario de agenda)
ALTER TABLE turnos ADD COLUMN sesiones_autorizadas INTEGER;
ALTER TABLE turnos ADD COLUMN profesional_id TEXT REFERENCES colaboradores(id);
