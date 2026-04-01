-- ============================================================
-- MIGRACIÓN 029 — Chat interno del equipo
-- ============================================================

-- Conversaciones: grupales (equipo completo) o privadas (1:1)
CREATE TABLE IF NOT EXISTS chat_conversaciones (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'grupo' CHECK (tipo IN ('grupo','privado')),
  nombre TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Participantes de cada conversación
CREATE TABLE IF NOT EXISTS chat_participantes (
  id TEXT PRIMARY KEY,
  conversacion_id TEXT NOT NULL REFERENCES chat_conversaciones(id) ON DELETE CASCADE,
  user_type TEXT NOT NULL CHECK (user_type IN ('owner','colaborador')),
  user_id TEXT NOT NULL,
  joined_at TEXT DEFAULT (datetime('now')),
  UNIQUE(conversacion_id, user_type, user_id)
);

-- Mensajes
CREATE TABLE IF NOT EXISTS chat_mensajes (
  id TEXT PRIMARY KEY,
  conversacion_id TEXT NOT NULL REFERENCES chat_conversaciones(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('owner','colaborador')),
  sender_id TEXT NOT NULL,
  sender_nombre TEXT NOT NULL,
  texto TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Último mensaje leído por cada participante
CREATE TABLE IF NOT EXISTS chat_leidos (
  id TEXT PRIMARY KEY,
  conversacion_id TEXT NOT NULL REFERENCES chat_conversaciones(id) ON DELETE CASCADE,
  user_type TEXT NOT NULL CHECK (user_type IN ('owner','colaborador')),
  user_id TEXT NOT NULL,
  last_read_at TEXT DEFAULT (datetime('now')),
  UNIQUE(conversacion_id, user_type, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_conv_tenant ON chat_conversaciones(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_part_conv ON chat_participantes(conversacion_id);
CREATE INDEX IF NOT EXISTS idx_chat_part_user ON chat_participantes(user_type, user_id);
CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON chat_mensajes(conversacion_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_leidos_user ON chat_leidos(user_type, user_id);
