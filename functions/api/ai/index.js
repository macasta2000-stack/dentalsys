import { ok, err, cors } from '../../_lib/response.js'
import { newId } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

// ── Créditos IA helpers ──────────────────────────────────────────────────────

async function getMonthlyUsage(db, tenantId) {
  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)
  const r = await db.prepare(
    `SELECT COALESCE(SUM(creditos), 0) as usado FROM ai_usage WHERE tenant_id = ?1 AND created_at >= ?2`
  ).bind(tenantId, inicioMes.toISOString()).first()
  return r?.usado ?? 0
}

async function getCreditLimit(db, tenantId) {
  // Check features_override first (superadmin grants)
  const cfg = await db.prepare(
    `SELECT features_override FROM configuracion WHERE tenant_id = ?1`
  ).bind(tenantId).first()
  if (cfg?.features_override) {
    try {
      const override = JSON.parse(cfg.features_override)
      if (override.ia_creditos !== undefined) return override.ia_creditos
    } catch {}
  }

  // Check plan features
  const sub = await db.prepare(
    `SELECT sp.plan_features FROM tenant_subscriptions ts
     JOIN subscription_plans sp ON sp.id = ts.plan_id
     WHERE ts.tenant_id = ?1 AND ts.estado IN ('activa','trial')
     ORDER BY ts.created_at DESC LIMIT 1`
  ).bind(tenantId).first()
  if (sub?.plan_features) {
    try {
      const features = JSON.parse(sub.plan_features)
      if (features.ia_creditos !== undefined) return features.ia_creditos
    } catch {}
  }

  // Check user estado — trial gets full access
  const user = await db.prepare(`SELECT estado, trial_hasta FROM usuarios WHERE id = ?1`).bind(tenantId).first()
  if (user?.estado === 'trial') {
    const hoy = new Date().toISOString().split('T')[0]
    if (!user.trial_hasta || hoy <= user.trial_hasta) return 50 // trial: 50 créditos/mes
  }

  return 0 // sin plan = sin IA
}

async function checkAndDeductCredit(db, tenantId, tipo) {
  const [usado, limite] = await Promise.all([
    getMonthlyUsage(db, tenantId),
    getCreditLimit(db, tenantId),
  ])

  if (limite === 0) {
    return { allowed: false, error: 'Tu plan no incluye funciones de IA. Actualizá a Pro o Clínica para acceder.' }
  }
  if (limite !== -1 && usado >= limite) {
    return { allowed: false, error: `Alcanzaste el límite de ${limite} créditos IA este mes. Actualizá tu plan para más.` }
  }

  return { allowed: true, usado, limite }
}

async function logUsage(db, tenantId, tipo, tokensIn, tokensOut, resumen) {
  await db.prepare(
    `INSERT INTO ai_usage (id, tenant_id, tipo, tokens_in, tokens_out, creditos, prompt_resumen, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, datetime('now'))`
  ).bind(newId(), tenantId, tipo, tokensIn, tokensOut, resumen?.slice(0, 200) ?? null).run()
}

// ── Claude API call ──────────────────────────────────────────────────────────

async function callClaude(apiKey, systemPrompt, userMessage, maxTokens = 1024) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Claude API error ${res.status}: ${body}`)
  }

  const data = await res.json()
  return {
    text: data.content?.[0]?.text ?? '',
    tokensIn: data.usage?.input_tokens ?? 0,
    tokensOut: data.usage?.output_tokens ?? 0,
  }
}

// ── System prompts ───────────────────────────────────────────────────────────

const SYSTEM_NOTAS = `Sos un asistente clínico odontológico experto. Tu trabajo es ayudar al dentista a redactar notas clínicas profesionales (evoluciones) a partir de notas breves o abreviadas.

Reglas:
- Escribí en español rioplatense profesional (tercera persona)
- Usá terminología odontológica correcta (FDI para piezas dentales)
- Sé conciso pero completo: motivo de consulta, examen, diagnóstico, procedimiento, indicaciones
- NO inventés datos que no te dieron — si falta info, dejá [COMPLETAR]
- Formato: texto corrido, sin bullets ni headers
- Máximo 200 palabras`

const SYSTEM_TRATAMIENTO = `Sos un asistente clínico odontológico. Basándote en el estado del odontograma y la historia del paciente, sugerí opciones de tratamiento.

Reglas:
- Escribí en español rioplatense profesional
- Priorizá tratamientos de urgencia/dolor primero
- Listá opciones de tratamiento ordenadas por prioridad
- Incluí piezas dentales en notación FDI
- Sé breve: máximo 3-5 sugerencias con una línea de justificación cada una
- NUNCA reemplazás al juicio clínico del profesional — esto es una sugerencia`

const SYSTEM_WHATSAPP = `Sos un asistente que redacta mensajes de WhatsApp profesionales y amigables para un consultorio odontológico.

Reglas:
- Tono cálido pero profesional, tuteá al paciente
- Mensajes cortos (máximo 300 caracteres)
- Incluí el nombre del paciente si está disponible
- NO uses emojis excesivos (máximo 1-2)
- Adaptá el tono según el tipo de mensaje (recordatorio, seguimiento, confirmación, etc.)
- Escribí en español rioplatense`

const SYSTEM_RESUMEN = `Sos un asistente clínico odontológico. Tu trabajo es generar un resumen conciso del historial clínico de un paciente.

Reglas:
- Escribí en español rioplatense profesional
- Resaltá: diagnósticos principales, tratamientos realizados, alertas (alergias, medicación)
- Incluí piezas dentales en notación FDI cuando corresponda
- Máximo 150 palabras
- Formato: texto corrido, conciso y útil para el profesional`

// ── POST handler ─────────────────────────────────────────────────────────────

export async function onRequestPost({ request, data, env }) {
  const { user } = data

  if (!env.ANTHROPIC_API_KEY) {
    return err('La función de IA no está configurada. Contactá al administrador.', 503)
  }

  let body
  try { body = await request.json() } catch { return err('Body JSON inválido', 400) }

  const { tipo, contexto } = body
  if (!tipo || !contexto) return err('tipo y contexto son requeridos', 400)

  const tiposValidos = ['notas_clinicas', 'sugerencia_tratamiento', 'whatsapp', 'resumen_paciente']
  if (!tiposValidos.includes(tipo)) return err(`tipo inválido. Opciones: ${tiposValidos.join(', ')}`, 400)

  // Check credits
  const creditCheck = await checkAndDeductCredit(env.DB, user.sub, tipo)
  if (!creditCheck.allowed) return err(creditCheck.error, 402)

  // Build prompt
  let systemPrompt, userMessage, maxTokens

  switch (tipo) {
    case 'notas_clinicas': {
      systemPrompt = SYSTEM_NOTAS
      const { notas_breves, paciente_info, evoluciones_previas } = contexto
      if (!notas_breves) return err('contexto.notas_breves es requerido para notas_clinicas', 400)
      userMessage = `Paciente: ${paciente_info || 'No especificado'}\n`
      if (evoluciones_previas) userMessage += `Evoluciones anteriores:\n${evoluciones_previas}\n\n`
      userMessage += `Notas del profesional:\n${notas_breves}`
      maxTokens = 512
      break
    }
    case 'sugerencia_tratamiento': {
      systemPrompt = SYSTEM_TRATAMIENTO
      const { odontograma, diagnostico, paciente_info } = contexto
      if (!odontograma && !diagnostico) return err('contexto.odontograma o contexto.diagnostico es requerido', 400)
      userMessage = `Paciente: ${paciente_info || 'No especificado'}\n`
      if (diagnostico) userMessage += `Diagnóstico actual: ${diagnostico}\n`
      if (odontograma) userMessage += `Estado del odontograma:\n${odontograma}`
      maxTokens = 512
      break
    }
    case 'whatsapp': {
      systemPrompt = SYSTEM_WHATSAPP
      const { tipo_mensaje, paciente_nombre, detalles } = contexto
      if (!tipo_mensaje) return err('contexto.tipo_mensaje es requerido para whatsapp', 400)
      userMessage = `Tipo de mensaje: ${tipo_mensaje}\n`
      if (paciente_nombre) userMessage += `Paciente: ${paciente_nombre}\n`
      if (detalles) userMessage += `Detalles: ${detalles}`
      maxTokens = 256
      break
    }
    case 'resumen_paciente': {
      systemPrompt = SYSTEM_RESUMEN
      const { paciente_info, evoluciones, odontograma, anamnesis } = contexto
      if (!paciente_info) return err('contexto.paciente_info es requerido', 400)
      userMessage = `Datos del paciente: ${paciente_info}\n`
      if (anamnesis) userMessage += `Anamnesis: ${anamnesis}\n`
      if (odontograma) userMessage += `Odontograma: ${odontograma}\n`
      if (evoluciones) userMessage += `Evoluciones recientes:\n${evoluciones}`
      maxTokens = 400
      break
    }
  }

  try {
    const result = await callClaude(env.ANTHROPIC_API_KEY, systemPrompt, userMessage, maxTokens)

    // Log usage
    await logUsage(env.DB, user.sub, tipo, result.tokensIn, result.tokensOut, userMessage.slice(0, 200))

    return ok({
      texto: result.text,
      creditos_usados: creditCheck.usado + 1,
      creditos_limite: creditCheck.limite === -1 ? 'ilimitado' : creditCheck.limite,
    })
  } catch (e) {
    console.error('AI error:', e.message)
    return err('Error al procesar con IA. Intentá nuevamente.', 500)
  }
}

// ── GET: usage stats ─────────────────────────────────────────────────────────

export async function onRequestGet({ data, env }) {
  const { user } = data
  const [usado, limite] = await Promise.all([
    getMonthlyUsage(env.DB, user.sub),
    getCreditLimit(env.DB, user.sub),
  ])

  return ok({
    creditos_usados: usado,
    creditos_limite: limite === -1 ? 'ilimitado' : limite,
    creditos_restantes: limite === -1 ? 'ilimitado' : Math.max(0, limite - usado),
  })
}
