-- ============================================================
-- DentalSys — Schema D1 (SQLite)
-- Ejecutar: npm run db:init
-- ============================================================

-- PRAGMAs removidos: D1 maneja journal_mode internamente
-- PRAGMA journal_mode=WAL;
-- PRAGMA foreign_keys=ON;

-- ============================================================
-- USUARIOS (auth interno)
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- CONFIGURACION del consultorio
-- ============================================================
CREATE TABLE IF NOT EXISTS configuracion (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre_consultorio TEXT NOT NULL DEFAULT 'Mi Consultorio Odontológico',
  nombre_profesional TEXT,
  matricula TEXT,
  especialidad TEXT DEFAULT 'Odontología General',
  telefono TEXT,
  email TEXT,
  direccion TEXT,
  ciudad TEXT DEFAULT 'Buenos Aires',
  cuit TEXT,
  duracion_turno_default INTEGER DEFAULT 60,
  horario_inicio TEXT DEFAULT '08:00',
  horario_fin TEXT DEFAULT '20:00',
  dias_laborales TEXT DEFAULT '1,2,3,4,5',
  moneda TEXT DEFAULT 'ARS',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- PACIENTES
-- ============================================================
CREATE TABLE IF NOT EXISTS pacientes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  dni TEXT,
  fecha_nacimiento TEXT,
  sexo TEXT CHECK (sexo IN ('masculino','femenino','otro','no_especifica')),
  telefono TEXT,
  telefono_alternativo TEXT,
  email TEXT,
  obra_social TEXT,
  numero_afiliado TEXT,
  plan_obra_social TEXT,
  direccion TEXT,
  ciudad TEXT,
  alergias TEXT,
  medicacion_actual TEXT,
  antecedentes_medicos TEXT,
  antecedentes_odontologicos TEXT,
  estado TEXT DEFAULT 'activo' CHECK (estado IN ('activo','inactivo','archivado')),
  notas TEXT,
  saldo REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- PRESTACIONES (catálogo de servicios)
-- ============================================================
CREATE TABLE IF NOT EXISTS prestaciones (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo TEXT,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio REAL NOT NULL DEFAULT 0,
  duracion_minutos INTEGER DEFAULT 60,
  categoria TEXT DEFAULT 'general',
  activo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- ODONTOGRAMA
-- ============================================================
CREATE TABLE IF NOT EXISTS odontograma (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  paciente_id TEXT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  numero_pieza INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'sano',
  caras_afectadas TEXT DEFAULT '[]',
  notas TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE (paciente_id, numero_pieza)
);

-- ============================================================
-- EVOLUCIONES (historia clínica)
-- ============================================================
CREATE TABLE IF NOT EXISTS evoluciones (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  paciente_id TEXT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  fecha TEXT DEFAULT (datetime('now')),
  descripcion TEXT NOT NULL,
  piezas_tratadas TEXT DEFAULT '[]',
  prestacion_id TEXT REFERENCES prestaciones(id),
  prestacion_nombre TEXT,
  monto REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- PRESUPUESTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS presupuestos (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  paciente_id TEXT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  numero INTEGER,
  fecha TEXT DEFAULT (datetime('now')),
  fecha_vencimiento TEXT,
  total REAL NOT NULL DEFAULT 0,
  total_pagado REAL DEFAULT 0,
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobado','rechazado','en_curso','completado','vencido')),
  notas TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- PRESUPUESTO_ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS presupuesto_items (
  id TEXT PRIMARY KEY,
  presupuesto_id TEXT NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
  prestacion_id TEXT REFERENCES prestaciones(id),
  descripcion TEXT NOT NULL,
  pieza_dental INTEGER,
  cantidad INTEGER DEFAULT 1,
  precio_unitario REAL NOT NULL DEFAULT 0,
  subtotal REAL NOT NULL DEFAULT 0,
  completado INTEGER DEFAULT 0,
  fecha_completado TEXT,
  orden INTEGER DEFAULT 0
);

-- ============================================================
-- TURNOS (agenda)
-- ============================================================
CREATE TABLE IF NOT EXISTS turnos (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  paciente_id TEXT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  fecha_hora TEXT NOT NULL,
  duracion_minutos INTEGER DEFAULT 60,
  motivo TEXT,
  prestacion_id TEXT REFERENCES prestaciones(id),
  estado TEXT DEFAULT 'programado' CHECK (estado IN ('programado','confirmado','presente','completado','ausente','cancelado')),
  notas TEXT,
  recordatorio_enviado INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- PAGOS
-- ============================================================
CREATE TABLE IF NOT EXISTS pagos (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  paciente_id TEXT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  presupuesto_id TEXT REFERENCES presupuestos(id),
  evolucion_id TEXT REFERENCES evoluciones(id),
  fecha TEXT DEFAULT (datetime('now')),
  monto REAL NOT NULL,
  metodo_pago TEXT NOT NULL DEFAULT 'efectivo' CHECK (metodo_pago IN (
    'efectivo','transferencia','tarjeta_debito','tarjeta_credito',
    'obra_social','cheque','mercadopago','otro'
  )),
  concepto TEXT,
  numero_recibo TEXT,
  notas TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- INSUMOS (inventario)
-- ============================================================
CREATE TABLE IF NOT EXISTS insumos (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  unidad TEXT DEFAULT 'unidad',
  stock_actual REAL DEFAULT 0,
  stock_minimo REAL DEFAULT 0,
  precio_unitario REAL DEFAULT 0,
  proveedor TEXT,
  categoria TEXT DEFAULT 'general',
  activo INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- MOVIMIENTOS_INSUMOS
-- ============================================================
CREATE TABLE IF NOT EXISTS movimientos_insumos (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  insumo_id TEXT NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','salida','ajuste')),
  cantidad REAL NOT NULL,
  motivo TEXT,
  fecha TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  prioridad TEXT DEFAULT 'info' CHECK (prioridad IN ('info','warning','danger','success')),
  titulo TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  leida INTEGER DEFAULT 0,
  link TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_pacientes_tenant ON pacientes(tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_pacientes_apellido ON pacientes(tenant_id, apellido);
CREATE INDEX IF NOT EXISTS idx_evoluciones_paciente ON evoluciones(paciente_id);
CREATE INDEX IF NOT EXISTS idx_turnos_fecha ON turnos(tenant_id, fecha_hora);
CREATE INDEX IF NOT EXISTS idx_turnos_paciente ON turnos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_pagos_tenant_fecha ON pagos(tenant_id, fecha);
CREATE INDEX IF NOT EXISTS idx_pagos_paciente ON pagos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_odontograma_paciente ON odontograma(paciente_id);
CREATE INDEX IF NOT EXISTS idx_presupuestos_paciente ON presupuestos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id, leida);
