-- Migration 019: Índices faltantes + constraints de integridad
-- ============================================================

-- presupuesto_items: tenant_id NO puede ser NULL (integridad multi-tenant)
-- Primero aseguramos que todos los items existentes tengan tenant_id asignado via su presupuesto padre
UPDATE presupuesto_items
SET tenant_id = (SELECT tenant_id FROM presupuestos WHERE presupuestos.id = presupuesto_items.presupuesto_id)
WHERE tenant_id IS NULL;

-- Índice para búsquedas de items por presupuesto (muy frecuente)
CREATE INDEX IF NOT EXISTS idx_presupuesto_items_presupuesto ON presupuesto_items(presupuesto_id);

-- Índice para pagos NO anulados (filtro frecuente en reportes y caja)
CREATE INDEX IF NOT EXISTS idx_pagos_anulado ON pagos(tenant_id, anulado, fecha);

-- Índice para presupuestos por estado (pipeline comercial)
CREATE INDEX IF NOT EXISTS idx_presupuestos_estado ON presupuestos(tenant_id, estado);

-- Índice para evoluciones por fecha (historial clínico ordenado)
CREATE INDEX IF NOT EXISTS idx_evoluciones_fecha ON evoluciones(tenant_id, fecha DESC);

-- Índice para comprobantes por número (numeración correlativa)
CREATE INDEX IF NOT EXISTS idx_comprobantes_numero ON comprobantes(tenant_id, numero DESC);

-- Índice para planes de pago activos
CREATE INDEX IF NOT EXISTS idx_planes_pago_estado ON planes_pago(tenant_id, estado);
