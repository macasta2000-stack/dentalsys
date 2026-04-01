-- Migración 021: Agregar tenant_id a presupuesto_items para aislamiento multi-tenant
-- Esto permite filtrar items directamente por tenant sin JOIN a presupuestos.

ALTER TABLE presupuesto_items ADD COLUMN tenant_id TEXT;

-- Backfill: asignar tenant_id desde el presupuesto padre
UPDATE presupuesto_items
SET tenant_id = (
  SELECT tenant_id FROM presupuestos WHERE presupuestos.id = presupuesto_items.presupuesto_id
)
WHERE tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_presupuesto_items_tenant ON presupuesto_items(tenant_id);
