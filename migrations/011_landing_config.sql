-- Migration 011: Configuración dinámica de la landing page
CREATE TABLE IF NOT EXISTS landing_config (
  id INTEGER PRIMARY KEY,
  config TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT
);
