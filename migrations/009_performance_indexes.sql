-- Migration 009: Performance indexes for multi-tenant queries
-- These indexes dramatically speed up common queries on large datasets

-- Turnos: queries by tenant + date range (agenda, dashboard)
CREATE INDEX IF NOT EXISTS idx_turnos_tenant_fecha ON turnos(tenant_id, fecha_hora);
CREATE INDEX IF NOT EXISTS idx_turnos_tenant_estado ON turnos(tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_turnos_paciente ON turnos(paciente_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_turnos_profesional ON turnos(profesional_id, tenant_id);

-- Pagos: queries by tenant + date range (caja, reportes)
CREATE INDEX IF NOT EXISTS idx_pagos_tenant_fecha ON pagos(tenant_id, fecha);
CREATE INDEX IF NOT EXISTS idx_pagos_paciente ON pagos(paciente_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_pagos_turno ON pagos(turno_id);

-- Pacientes: search queries
CREATE INDEX IF NOT EXISTS idx_pacientes_tenant ON pacientes(tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_pacientes_apellido ON pacientes(tenant_id, apellido);

-- Evoluciones: queries by patient
CREATE INDEX IF NOT EXISTS idx_evoluciones_paciente ON evoluciones(paciente_id, tenant_id);

-- Colaboradores: login lookup
CREATE INDEX IF NOT EXISTS idx_colaboradores_email ON colaboradores(email, tenant_id);
CREATE INDEX IF NOT EXISTS idx_colaboradores_tenant ON colaboradores(tenant_id, activo);
