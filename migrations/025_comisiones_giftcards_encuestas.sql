-- Migration 025: Comisiones por profesional, Giftcards, Encuestas de satisfacción

-- Comisiones: porcentaje de comisión por colaborador
ALTER TABLE colaboradores ADD COLUMN porcentaje_comision REAL DEFAULT 0;

-- Giftcards
CREATE TABLE IF NOT EXISTS giftcards (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  monto_original REAL NOT NULL,
  monto_restante REAL NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','usado','vencido','anulado')),
  paciente_id TEXT REFERENCES pacientes(id),
  fecha_vencimiento TEXT,
  notas TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(codigo, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_giftcards_tenant ON giftcards(tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_giftcards_codigo ON giftcards(tenant_id, codigo);

-- Encuestas de satisfacción
CREATE TABLE IF NOT EXISTS encuestas (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  turno_id TEXT REFERENCES turnos(id),
  paciente_id TEXT REFERENCES pacientes(id),
  token TEXT NOT NULL UNIQUE,
  nps INTEGER CHECK (nps BETWEEN 0 AND 10),
  comentario TEXT DEFAULT '',
  respondida INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  respondida_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_encuestas_tenant ON encuestas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_encuestas_token ON encuestas(token);
CREATE INDEX IF NOT EXISTS idx_encuestas_turno ON encuestas(turno_id);
