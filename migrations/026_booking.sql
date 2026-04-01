-- Feature: Agendamiento online para pacientes
ALTER TABLE configuracion ADD COLUMN booking_slug TEXT;
ALTER TABLE configuracion ADD COLUMN booking_activo INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS solicitudes_turno (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  apellido TEXT,
  telefono TEXT,
  email TEXT,
  fecha_hora TEXT NOT NULL,
  duracion_minutos INTEGER DEFAULT 30,
  motivo TEXT,
  profesional_id TEXT,
  estado TEXT DEFAULT 'pendiente' CHECK(estado IN ('pendiente','confirmada','rechazada','cancelada')),
  notas_internas TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_solicitudes_tenant ON solicitudes_turno(tenant_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON solicitudes_turno(tenant_id, estado);
