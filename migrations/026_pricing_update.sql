-- Migration 026: Actualizar precios para competir con Reservo
-- Starter: $19.900/mes, Pro: $39.900/mes, Clínica: $69.900/mes

UPDATE subscription_plans SET
  precio_mensual = 19900,
  precio_anual = 199000,
  nombre = 'Starter',
  descripcion = 'Ideal para profesionales independientes',
  features = '["Hasta 500 pacientes","2 profesionales","Agenda inteligente","Historia clínica digital","Diagrama clínico interactivo","Recetas con firma digital","Soporte por email"]'
WHERE id = 'plan_starter';

UPDATE subscription_plans SET
  precio_mensual = 39900,
  precio_anual = 399000,
  nombre = 'Profesional',
  descripcion = 'Para consultorios en crecimiento',
  features = '["Pacientes ilimitados","5 profesionales","Todo lo de Starter","Presupuestos y planes de pago","Caja y reportes financieros","Comisiones por profesional","App de escritorio (Windows/Mac)","Soporte prioritario"]'
WHERE id = 'plan_pro';

UPDATE subscription_plans SET
  precio_mensual = 69900,
  precio_anual = 699000,
  nombre = 'Clínica',
  descripcion = 'Para clínicas con múltiples profesionales',
  features = '["Profesionales ilimitados","Todo lo de Profesional","Encuestas de satisfacción (NPS)","Giftcards","Múltiples consultorios (próximamente)","API de integración","Onboarding personalizado","Soporte telefónico dedicado"]'
WHERE id = 'plan_clinica';
