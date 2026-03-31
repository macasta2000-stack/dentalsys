-- ============================================================
-- Clingest — Schema D1 (SQLite) — SCHEMA COMPLETO
-- Incorpora migraciones 001–021 + recetas + token_version
-- Para instancias nuevas: wrangler d1 execute dentalsys-db --file=schema.sql
-- Para instancias existentes: aplicar cada migration en orden
-- ============================================================

-- PRAGMAs removidos: D1 maneja journal_mode internamente

-- ============================================================
-- PLANES DE SUSCRIPCIÓN (catálogo global, no por tenant)
-- Creada antes que usuarios porque usuarios referencia plan_id
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio_mensual REAL NOT NULL,
  precio_anual REAL,
  max_pacientes INTEGER,
  max_colaboradores INTEGER DEFAULT 1,
  features TEXT DEFAULT '[]',
  plan_features TEXT DEFAULT '{}',
  activo INTEGER DEFAULT 1,
  orden INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- USUARIOS (auth interno)
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre TEXT,
  rol TEXT NOT NULL DEFAULT 'tenant',
  estado TEXT NOT NULL DEFAULT 'activo',
  trial_hasta TEXT,
  notas TEXT,
  plan_id TEXT REFERENCES subscription_plans(id),
  mp_customer_id TEXT,
  last_login_at TEXT,
  token_version INTEGER DEFAULT 1,
  reset_token TEXT,
  reset_token_expires TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- CONFIGURACION del consultorio
-- ============================================================
CREATE TABLE IF NOT EXISTS configuracion (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre_consultorio TEXT NOT NULL DEFAULT 'Mi Consultorio',
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
  firma_digital TEXT,
  onboarding_completado INTEGER DEFAULT 0,
  onboarding_data TEXT DEFAULT NULL,
  workflow_etapas TEXT DEFAULT '["consultorio"]',
  notif_email_turno INTEGER DEFAULT 0,
  notif_email_cancelacion INTEGER DEFAULT 0,
  notif_whatsapp_numero TEXT DEFAULT NULL,
  plantillas_evoluciones TEXT DEFAULT '[]',
  catalogo_farmacos TEXT DEFAULT '[]',
  tipo_cobro TEXT DEFAULT 'prestacion',
  pais TEXT DEFAULT 'AR',
  features_override TEXT DEFAULT NULL,
  permisos_roles TEXT DEFAULT NULL,
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
  tipo TEXT DEFAULT 'consulta',
  notas TEXT,
  piezas_tratadas TEXT DEFAULT '[]',
  prestacion_id TEXT REFERENCES prestaciones(id),
  prestacion_nombre TEXT,
  monto REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
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
  tenant_id TEXT,
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
-- ROLES DE USUARIO (colaboradores del consultorio)
-- Definida antes que turnos porque turnos referencia colaboradores
-- ============================================================
CREATE TABLE IF NOT EXISTS colaboradores (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nombre TEXT NOT NULL,
  apellido TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  rol TEXT NOT NULL DEFAULT 'recepcionista' CHECK (rol IN ('admin','profesional','recepcionista')),
  matricula TEXT DEFAULT '',
  firma_digital TEXT,
  duracion_default INTEGER DEFAULT 30,
  password_hash TEXT DEFAULT NULL,
  notas TEXT DEFAULT '',
  activo INTEGER DEFAULT 1,
  porcentaje_comision REAL DEFAULT 0,
  especialidad TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
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
  sesiones_autorizadas INTEGER,
  profesional_id TEXT REFERENCES colaboradores(id),
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
    'obra_social','cheque','otro'
  )),
  concepto TEXT,
  numero_recibo TEXT,
  notas TEXT,
  monto_os REAL DEFAULT 0,
  monto_copago REAL DEFAULT 0,
  turno_id TEXT,
  anulado INTEGER DEFAULT 0,
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
-- BLOQUES DE AGENDA (bloqueos de horario)
-- ============================================================
CREATE TABLE IF NOT EXISTS bloques_agenda (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha_hora_inicio TEXT NOT NULL,
  fecha_hora_fin TEXT NOT NULL,
  motivo TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- CONVENIOS (obras sociales)
-- ============================================================
CREATE TABLE IF NOT EXISTS convenios (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES usuarios(id),
  nombre_os TEXT NOT NULL,
  prestacion_id TEXT REFERENCES prestaciones(id),
  monto_os REAL DEFAULT 0,
  monto_copago REAL DEFAULT 0,
  activo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- ANAMNESIS
-- ============================================================
CREATE TABLE IF NOT EXISTS anamnesis (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES usuarios(id),
  paciente_id TEXT NOT NULL REFERENCES pacientes(id),
  motivo_consulta TEXT,
  enfermedades TEXT DEFAULT '{}',
  medicacion TEXT DEFAULT '[]',
  alergias TEXT,
  embarazada INTEGER DEFAULT 0,
  fumador INTEGER DEFAULT 0,
  anticoagulantes INTEGER DEFAULT 0,
  marcapasos INTEGER DEFAULT 0,
  ultima_visita_medico TEXT,
  cirugias_previas TEXT,
  antecedentes_odontologicos TEXT,
  firma_fecha TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- PLANES DE PAGO (cuotas)
-- ============================================================
CREATE TABLE IF NOT EXISTS planes_pago (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  paciente_id TEXT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  concepto TEXT NOT NULL,
  monto_total REAL NOT NULL,
  cuotas INTEGER NOT NULL DEFAULT 1,
  cuota_monto REAL NOT NULL,
  cuotas_pagadas INTEGER DEFAULT 0,
  estado TEXT DEFAULT 'activo' CHECK (estado IN ('activo','completado','cancelado')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cuotas_pago (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES planes_pago(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  numero_cuota INTEGER NOT NULL,
  monto REAL NOT NULL,
  fecha_vencimiento TEXT,
  fecha_pago TEXT,
  pago_id TEXT REFERENCES pagos(id),
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente','pagada','vencida'))
);

-- ============================================================
-- SUSCRIPCIONES (SaaS billing)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
  estado TEXT DEFAULT 'trial' CHECK (estado IN ('trial','activa','vencida','cancelada','pendiente_pago')),
  ciclo TEXT DEFAULT 'mensual' CHECK (ciclo IN ('mensual','anual')),
  fecha_inicio TEXT NOT NULL,
  fecha_fin TEXT NOT NULL,
  fecha_cancelacion TEXT,
  mp_preapproval_id TEXT,
  notas TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES usuarios(id),
  subscription_id TEXT REFERENCES tenant_subscriptions(id),
  mp_payment_id TEXT UNIQUE,
  mp_preference_id TEXT,
  tipo TEXT DEFAULT 'subscription' CHECK (tipo IN ('subscription','renewal','upgrade','trial','manual','refund')),
  estado TEXT NOT NULL CHECK (estado IN ('pending','approved','rejected','cancelled','refunded','manual')),
  monto REAL NOT NULL DEFAULT 0,
  moneda TEXT DEFAULT 'ARS',
  plan_id TEXT REFERENCES subscription_plans(id),
  ciclo TEXT DEFAULT 'mensual',
  raw_webhook TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES usuarios(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('welcome','trial_expiry','payment_receipt','renewal_reminder','suspension','activation')),
  destinatario TEXT NOT NULL,
  asunto TEXT NOT NULL,
  estado TEXT DEFAULT 'sent' CHECK (estado IN ('sent','failed','bounced')),
  resend_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SISTEMA CONFIG (configuración global — solo superadmin)
-- ============================================================
CREATE TABLE IF NOT EXISTS sistema_config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- LANDING CONFIG (configuración de la landing pública)
-- ============================================================
CREATE TABLE IF NOT EXISTS landing_config (
  id INTEGER PRIMARY KEY,
  config TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT
);

-- ============================================================
-- ADJUNTOS (archivos por paciente / evolución)
-- ============================================================
CREATE TABLE IF NOT EXISTS adjuntos (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  paciente_id TEXT NOT NULL,
  evolucion_id TEXT,
  nombre_archivo TEXT NOT NULL,
  tipo_mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  tamano INTEGER DEFAULT 0,
  r2_key TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  subido_por TEXT,
  subido_por_nombre TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  activo INTEGER DEFAULT 1
);

-- ============================================================
-- API KEYS (acceso programático)
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL DEFAULT 'Mi API Key',
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  activo INTEGER DEFAULT 1,
  last_used_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- RECETAS MÉDICAS
-- ============================================================
CREATE TABLE IF NOT EXISTS recetas (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  paciente_id TEXT NOT NULL,
  profesional_id TEXT,
  profesional_nombre TEXT,
  profesional_matricula TEXT,
  fecha TEXT NOT NULL,
  medicamentos TEXT NOT NULL DEFAULT '[]',
  indicaciones TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES usuarios(id),
  FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_pacientes_tenant ON pacientes(tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_pacientes_apellido ON pacientes(tenant_id, apellido);
CREATE INDEX IF NOT EXISTS idx_evoluciones_paciente ON evoluciones(paciente_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_turnos_fecha ON turnos(tenant_id, fecha_hora);
CREATE INDEX IF NOT EXISTS idx_turnos_tenant_fecha ON turnos(tenant_id, fecha_hora);
CREATE INDEX IF NOT EXISTS idx_turnos_tenant_estado ON turnos(tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_turnos_paciente ON turnos(paciente_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_turnos_profesional ON turnos(profesional_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_pagos_tenant_fecha ON pagos(tenant_id, fecha);
CREATE INDEX IF NOT EXISTS idx_pagos_paciente ON pagos(paciente_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_pagos_turno ON pagos(turno_id);
CREATE INDEX IF NOT EXISTS idx_odontograma_paciente ON odontograma(paciente_id);
CREATE INDEX IF NOT EXISTS idx_presupuestos_paciente ON presupuestos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_presupuesto_items_tenant ON presupuesto_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id, leida);
CREATE INDEX IF NOT EXISTS idx_colaboradores_email ON colaboradores(email, tenant_id);
CREATE INDEX IF NOT EXISTS idx_colaboradores_tenant ON colaboradores(tenant_id, activo);
CREATE INDEX IF NOT EXISTS idx_planes_pago_paciente ON planes_pago(paciente_id);
CREATE INDEX IF NOT EXISTS idx_cuotas_plan ON cuotas_pago(plan_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subs_tenant ON tenant_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subs_estado ON tenant_subscriptions(estado, fecha_fin);
CREATE INDEX IF NOT EXISTS idx_payment_txn_tenant ON payment_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_txn_mp ON payment_transactions(mp_payment_id);
CREATE INDEX IF NOT EXISTS idx_email_log_tenant ON email_log(tenant_id, tipo);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_adjuntos_paciente ON adjuntos(paciente_id, tenant_id, activo);
CREATE INDEX IF NOT EXISTS idx_adjuntos_evolucion ON adjuntos(evolucion_id, activo);
CREATE INDEX IF NOT EXISTS idx_recetas_tenant ON recetas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recetas_paciente ON recetas(tenant_id, paciente_id);
CREATE INDEX IF NOT EXISTS idx_recetas_profesional ON recetas(tenant_id, profesional_id);

-- ============================================================
-- GIFTCARDS
-- ============================================================
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

-- ============================================================
-- ENCUESTAS DE SATISFACCIÓN
-- ============================================================
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

-- ============================================================
-- SEED DATA — Planes de suscripción
-- ============================================================
INSERT OR IGNORE INTO subscription_plans (id, nombre, descripcion, precio_mensual, precio_anual, max_pacientes, max_colaboradores, features, plan_features, activo, orden) VALUES
(
  'plan_starter', 'Starter', 'Ideal para profesionales independientes',
  19900, 199000, 500, 2,
  '["Hasta 500 pacientes","2 profesionales","Agenda inteligente","Historia clínica digital","Diagrama clínico interactivo","Recetas con firma digital","Soporte por email"]',
  '{"max_profesionales":1,"max_secretarios":1,"firma_digital":false,"crm":false,"reportes_avanzados":false,"insumos":false,"recetas_completas":true,"recordatorios":false,"exportar":true,"api_access":false}',
  1, 1
),
(
  'plan_pro', 'Profesional', 'Para consultorios en crecimiento',
  39900, 399000, NULL, 5,
  '["Pacientes ilimitados","5 profesionales","Todo lo de Starter","Presupuestos y planes de pago","Caja y reportes financieros","Comisiones por profesional","App de escritorio (Windows/Mac)","Soporte prioritario"]',
  '{"max_profesionales":3,"max_secretarios":2,"firma_digital":true,"crm":true,"reportes_avanzados":false,"insumos":false,"recetas_completas":true,"recordatorios":true,"exportar":true,"api_access":false}',
  1, 2
),
(
  'plan_clinica', 'Clínica', 'Para clínicas con múltiples profesionales',
  69900, 699000, NULL, NULL,
  '["Profesionales ilimitados","Todo lo de Profesional","Encuestas de satisfacción (NPS)","Giftcards","Múltiples consultorios (próximamente)","API de integración","Onboarding personalizado","Soporte telefónico dedicado"]',
  '{"max_profesionales":999,"max_secretarios":999,"firma_digital":true,"crm":true,"reportes_avanzados":true,"insumos":true,"recetas_completas":true,"recordatorios":true,"exportar":true,"api_access":true}',
  1, 3
);

INSERT OR IGNORE INTO sistema_config (clave, valor) VALUES ('whatsapp_numero', '5491144755339');
INSERT OR IGNORE INTO sistema_config (clave, valor) VALUES ('whatsapp_activo', 'true');
INSERT OR IGNORE INTO sistema_config (clave, valor) VALUES ('app_nombre', 'Clingest');
INSERT OR IGNORE INTO sistema_config (clave, valor) VALUES ('app_url', 'https://clingest.app');
