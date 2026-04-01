-- ============================================================
-- SEED — Planes de suscripción Clingest
-- ============================================================

INSERT OR IGNORE INTO subscription_plans (id, nombre, descripcion, precio_mensual, precio_anual, max_pacientes, max_colaboradores, features, activo, orden) VALUES
(
  'plan_starter',
  'Starter',
  'Ideal para profesionales independientes',
  8900,
  89000,
  500,
  2,
  '["Hasta 500 pacientes","2 profesionales","Agenda inteligente","Historia clínica digital","Diagrama clínico interactivo","Recetas con firma digital","Soporte por email"]',
  1,
  1
),
(
  'plan_pro',
  'Pro',
  'Para consultorios en crecimiento',
  16900,
  169000,
  NULL,
  5,
  '["Pacientes ilimitados","5 profesionales","Todo lo de Starter","Presupuestos y planes de pago","Caja y reportes financieros","App de escritorio (Windows/Mac)","Soporte prioritario"]',
  1,
  2
),
(
  'plan_clinica',
  'Clínica',
  'Para clínicas con múltiples profesionales',
  28900,
  289000,
  NULL,
  NULL,
  '["Profesionales ilimitados","Todo lo de Pro","Múltiples consultorios (próximamente)","API de integración (próximamente)","Onboarding personalizado","Soporte telefónico dedicado"]',
  1,
  3
);
