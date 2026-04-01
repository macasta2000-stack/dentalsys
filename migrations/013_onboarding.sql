-- Migration 013: Onboarding wizard y configuración extendida
-- Agrega campos de onboarding a configuracion y workflow de atención

ALTER TABLE configuracion ADD COLUMN onboarding_completado INTEGER DEFAULT 0;
ALTER TABLE configuracion ADD COLUMN onboarding_data TEXT DEFAULT NULL;

-- Workflow de atención (etapas configurables como JSON)
-- Ej: '["recepcion","sala_espera","consultorio","cobro","salida"]'
ALTER TABLE configuracion ADD COLUMN workflow_etapas TEXT DEFAULT '["consultorio"]';

-- Configuración de notificaciones
ALTER TABLE configuracion ADD COLUMN notif_email_turno INTEGER DEFAULT 0;
ALTER TABLE configuracion ADD COLUMN notif_email_cancelacion INTEGER DEFAULT 0;
ALTER TABLE configuracion ADD COLUMN notif_whatsapp_numero TEXT DEFAULT NULL;

-- Plantillas de evoluciones frecuentes (JSON array)
ALTER TABLE configuracion ADD COLUMN plantillas_evoluciones TEXT DEFAULT '[]';

-- Catálogo de fármacos del centro (JSON array)
ALTER TABLE configuracion ADD COLUMN catalogo_farmacos TEXT DEFAULT '[]';

-- Tipo de cobro: 'consulta' | 'prestacion' | 'mixto'
ALTER TABLE configuracion ADD COLUMN tipo_cobro TEXT DEFAULT 'prestacion';

-- País para configuración regional
ALTER TABLE configuracion ADD COLUMN pais TEXT DEFAULT 'AR';
