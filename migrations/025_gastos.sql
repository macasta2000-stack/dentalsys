-- Feature: Gastos (Expense tracking)
CREATE TABLE IF NOT EXISTS gastos (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT (date('now')),
  descripcion TEXT NOT NULL,
  categoria TEXT DEFAULT 'general',
  monto REAL NOT NULL CHECK(monto > 0),
  metodo_pago TEXT DEFAULT 'efectivo',
  proveedor TEXT,
  comprobante_nro TEXT,
  notas TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gastos_tenant ON gastos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(tenant_id, fecha);
CREATE INDEX IF NOT EXISTS idx_gastos_cat ON gastos(tenant_id, categoria);
