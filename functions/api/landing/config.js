// ============================================================
// Landing Config API — en el proyecto principal (tiene D1 bound)
// GET  /api/landing/config  → config pública
// POST /api/landing/config  → actualizar (requiere password)
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
}

const DEFAULT_CONFIG = {
  // Contacto
  whatsapp_numero: '5491144755339',
  whatsapp_mensaje: 'Hola! Quiero solicitar acceso a Clingest. ¿Me podés dar más info?',
  email_contacto: 'macasta2000@gmail.com',
  texto_cta: 'Escribinos por WhatsApp',

  // Hero
  hero_badge: '🇦🇷 Hecho en Argentina · Para profesionales de la salud',
  hero_titulo_1: 'El sistema de gestión médica',
  hero_titulo_2: 'que tu consultorio necesita',
  hero_subtitulo: 'Historia clínica digital, agenda inteligente, recetas con firma, caja y reportes. Para cualquier especialidad médica — funciona en el navegador y como app de escritorio.',
  hero_cta_texto: 'Empezar gratis por 7 días',
  hero_nota: '✅ Sin tarjeta de crédito · ✅ 7 días gratis · ✅ Cancelá cuando quieras',

  // Estadísticas
  stats_label: 'Usado por profesionales de la salud en todo el país',
  stat1_num: '500+',
  stat1_label: 'Consultorios',
  stat2_num: '50.000+',
  stat2_label: 'Pacientes gestionados',
  stat3_num: '4.9 ⭐',
  stat3_label: 'Satisfacción',
  stat4_num: '99.9%',
  stat4_label: 'Uptime',

  // Demo
  demo_titulo: 'Probalo ahora mismo, sin registrarte',
  demo_subtitulo: 'Explorá la versión demo de Clingest con datos de ejemplo. Conocé cada funcionalidad antes de decidir.',

  // Planes
  mostrar_precios: true,
  plan_starter_nombre: 'Starter',
  plan_starter_desc: 'Para profesionales independientes',
  plan_starter_precio: '$8.900/mes',
  plan_starter_mensual: '8.900',
  plan_starter_anual: '7.417',
  plan_pro_nombre: 'Pro',
  plan_pro_desc: 'Para consultorios en crecimiento',
  plan_pro_precio: '$16.900/mes',
  plan_pro_mensual: '16.900',
  plan_pro_anual: '14.083',
  plan_clinica_nombre: 'Clínica',
  plan_clinica_desc: 'Para clínicas con múltiples profesionales',
  plan_clinica_precio: '$28.900/mes',
  plan_clinica_mensual: '28.900',
  plan_clinica_anual: '24.083',

  // CTA Final
  cta_final_titulo: 'Empezá hoy, gratis',
  cta_final_subtitulo: '7 días de prueba completa. Sin tarjeta de crédito. Sin compromiso.',
  cta_final_btn: 'Crear mi cuenta gratis',

  // Página de solicitud
  registro_titulo: 'Solicitar acceso a Clingest',
  registro_subtitulo: 'Los accesos son gestionados personalmente.\nContactanos y te configuramos tu cuenta en minutos.',
  dias_trial: '7',

  // Estadísticas dinámicas
  stats_dynamic: true,
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

async function getConfig(env) {
  try {
    const row = await env.DB.prepare(
      `SELECT config FROM landing_config WHERE id = 1`
    ).first()
    if (!row) return DEFAULT_CONFIG
    return { ...DEFAULT_CONFIG, ...JSON.parse(row.config) }
  } catch {
    return DEFAULT_CONFIG
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function onRequestGet({ env }) {
  const config = await getConfig(env)
  return json({ ok: true, data: config })
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json()
    const { password, ...updates } = body

    const adminPass = env.LANDING_ADMIN_PASS
    if (!adminPass || password !== adminPass) {
      return json({ ok: false, error: 'No autorizado' }, 401)
    }

    const current = await getConfig(env)
    const newConfig = { ...current, ...updates }

    await env.DB.prepare(`
      INSERT INTO landing_config (id, config, updated_at)
      VALUES (1, ?1, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET config = ?1, updated_at = datetime('now')
    `).bind(JSON.stringify(newConfig)).run()

    return json({ ok: true, data: newConfig })
  } catch (e) {
    console.error('[landing/config] Error al guardar:', e?.message)
    return json({ ok: false, error: 'Error al guardar la configuración.' }, 500)
  }
}
