// ============================================================
// EMAIL — Módulo de envío vía Resend.com
// ============================================================

const FROM = 'Clingest <noreply@clingest.app>'
const RESEND_API = 'https://api.resend.com/emails'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Escapa caracteres HTML para prevenir XSS en templates de email
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

// ── Templates ────────────────────────────────────────────────

function baseLayout(content) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 0; }
  .wrap { max-width: 560px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
  .header { background: #0369a1; padding: 32px 40px; text-align: center; }
  .header h1 { color: #fff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
  .header p { color: #bae6fd; margin: 6px 0 0; font-size: 13px; }
  .body { padding: 36px 40px; color: #1e293b; line-height: 1.6; }
  .body h2 { font-size: 18px; font-weight: 700; margin: 0 0 12px; color: #0f172a; }
  .body p { margin: 0 0 16px; font-size: 15px; color: #334155; }
  .btn { display: inline-block; background: #0369a1; color: #fff !important; text-decoration: none; padding: 13px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 8px 0 20px; }
  .info-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px 20px; margin: 20px 0; font-size: 14px; color: #0369a1; }
  .info-box strong { display: block; margin-bottom: 4px; color: #0c4a6e; }
  .divider { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
  .footer { padding: 20px 40px; background: #f8fafc; text-align: center; font-size: 12px; color: #94a3b8; }
  .footer a { color: #64748b; }
</style></head><body>
<div class="wrap">
  <div class="header">
    <h1>🏥 Clingest</h1>
    <p>Sistema de Gestión Médica</p>
  </div>
  <div class="body">${content}</div>
  <div class="footer">
    <p>Clingest · <a href="https://clingest.app">clingest.app</a></p>
    <p>Si tenés alguna consulta, escribinos a <a href="mailto:soporte@clingest.app">soporte@clingest.app</a></p>
  </div>
</div></body></html>`
}

function tplWelcome({ nombre, email, password_temp, plan_nombre, trial_hasta, login_url }) {
  const subject = '¡Bienvenido a Clingest! Tu cuenta está lista 🏥'
  const html = baseLayout(`
    <h2>¡Hola, ${esc(nombre) || 'bienvenido'}!</h2>
    <p>Tu cuenta en <strong>Clingest</strong> fue creada exitosamente. Ya podés empezar a gestionar tu consultorio.</p>
    <div class="info-box">
      <strong>Tus datos de acceso:</strong>
      📧 Email: <strong>${esc(email)}</strong><br>
      🔐 Contraseña: <strong>${password_temp || '(la que elegiste al registrarte)'}</strong>
    </div>
    ${trial_hasta ? `<p>🎁 Tu período de prueba gratuita está activo hasta el <strong>${trial_hasta}</strong>.</p>` : ''}
    ${plan_nombre ? `<p>📦 Plan activo: <strong>${plan_nombre}</strong></p>` : ''}
    <a class="btn" href="${login_url || 'https://app.clingest.app'}">Ingresar a Clingest →</a>
    <hr class="divider">
    <p style="font-size:13px;color:#64748b;">También podés instalar Clingest como app desde tu navegador (PWA).</p>
  `)
  return { subject, html }
}

function tplTrialExpiry({ nombre, trial_hasta, dias_restantes, upgrade_url }) {
  const urgente = dias_restantes <= 1
  const subject = urgente
    ? `⚠️ Tu período de prueba vence HOY — Activá tu cuenta`
    : `⏳ Tu prueba gratuita vence en ${dias_restantes} días`
  const html = baseLayout(`
    <h2>${urgente ? '⚠️ Último aviso' : '⏳ Tu prueba está por vencer'}</h2>
    <p>Hola ${esc(nombre) || ''},</p>
    <p>${urgente
      ? '<strong>Hoy vence tu período de prueba gratuita.</strong> A partir de mañana no podrás acceder a Clingest.'
      : `Tu período de prueba gratuita vence el <strong>${trial_hasta}</strong> (en ${dias_restantes} días).`
    }</p>
    <p>Para continuar usando Clingest sin interrupciones, elegí tu plan:</p>
    <a class="btn" href="${upgrade_url || 'https://clingest.app/precios'}">Ver planes y precios →</a>
    <div class="info-box">
      <strong>¿Por qué elegir Clingest?</strong>
      ✅ Historia clínica digital completa<br>
      ✅ Agenda con turnos en tiempo real<br>
      ✅ Recetas con firma digital<br>
      ✅ App de escritorio incluida
    </div>
  `)
  return { subject, html }
}

function tplPaymentReceipt({ nombre, monto, plan_nombre, ciclo, fecha_fin, mp_payment_id }) {
  const subject = `✅ Pago recibido — Clingest ${plan_nombre}`
  const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
  const html = baseLayout(`
    <h2>✅ Pago confirmado</h2>
    <p>Hola ${esc(nombre) || ''},</p>
    <p>Recibimos tu pago correctamente. Tu cuenta Clingest está activa.</p>
    <div class="info-box">
      <strong>Detalle del pago:</strong>
      📦 Plan: <strong>${plan_nombre}</strong> (${ciclo === 'anual' ? 'Anual' : 'Mensual'})<br>
      💰 Monto: <strong>${fmt(monto)}</strong><br>
      📅 Próximo vencimiento: <strong>${fecha_fin}</strong>
    </div>
    <a class="btn" href="https://app.clingest.app">Ir a mi consultorio →</a>
    <p style="font-size:13px;color:#64748b;">Guardá este email como comprobante de pago.</p>
  `)
  return { subject, html }
}

function tplRenewalReminder({ nombre, fecha_fin, dias_restantes, renewal_url }) {
  const subject = `🔔 Renovación en ${dias_restantes} días — Clingest`
  const html = baseLayout(`
    <h2>🔔 Tu suscripción vence pronto</h2>
    <p>Hola ${esc(nombre) || ''},</p>
    <p>Tu suscripción a Clingest vence el <strong>${fecha_fin}</strong> (en ${dias_restantes} días).</p>
    <p>Para renovar, contactanos por WhatsApp y te activamos el plan de inmediato.</p>
    <a class="btn" href="${renewal_url || 'https://app.clingest.app/suscripcion'}">Ver mi suscripción →</a>
    <p style="font-size:13px;color:#64748b;">Si ya renovaste y recibís este mensaje, ignoralo. Si tenés dudas escribinos a soporte@clingest.app</p>
  `)
  return { subject, html }
}

function tplSuspension({ nombre }) {
  const subject = '⛔ Tu cuenta Clingest fue suspendida'
  const html = baseLayout(`
    <h2>Tu cuenta fue suspendida</h2>
    <p>Hola ${esc(nombre) || ''},</p>
    <p>Tu cuenta en Clingest fue <strong>suspendida</strong> porque tu suscripción venció y no se recibió un pago de renovación.</p>
    <p>Tus datos están guardados y no se perdió ninguna información. Para reactivar tu cuenta:</p>
    <a class="btn" href="https://clingest.app/precios">Reactivar mi cuenta →</a>
    <p style="font-size:13px;color:#64748b;">¿Necesitás ayuda? Escribinos a <a href="mailto:soporte@clingest.app">soporte@clingest.app</a></p>
  `)
  return { subject, html }
}

function tplActivation({ nombre, plan_nombre }) {
  const subject = '🎉 Tu cuenta Clingest está activa'
  const html = baseLayout(`
    <h2>🎉 Cuenta activada</h2>
    <p>Hola ${esc(nombre) || ''},</p>
    <p>Tu cuenta Clingest con el plan <strong>${plan_nombre || 'Pro'}</strong> fue activada exitosamente.</p>
    <a class="btn" href="https://app.clingest.app">Ir a mi consultorio →</a>
  `)
  return { subject, html }
}

function tplTurnoConfirmacion({ nombre_paciente, nombre_profesional, fecha_hora, prestacion, direccion, video_link }) {
  const subject = `✅ Turno confirmado — ${fecha_hora}`
  const html = baseLayout(`
    <h2>✅ Tu turno está confirmado</h2>
    <p>Hola ${nombre_paciente || ''},</p>
    <p>Tu turno fue registrado exitosamente.</p>
    <div class="info-box">
      <strong>Detalle del turno:</strong>
      📅 Fecha y hora: <strong>${esc(fecha_hora)}</strong><br>
      👨‍⚕️ Profesional: <strong>${esc(nombre_profesional) || 'Su profesional'}</strong><br>
      ${prestacion ? `🦷 Prestación: <strong>${esc(prestacion)}</strong><br>` : ''}
      ${direccion ? `📍 Dirección: <strong>${esc(direccion)}</strong>` : ''}
    </div>
    ${video_link && /^https?:\/\//i.test(video_link) ? `
    <div class="info-box" style="background:#f0fdf4;border-color:#86efac">
      <strong>📹 Teleconsulta — Link de videollamada:</strong><br>
      <a href="${esc(video_link)}" style="color:#15803d;word-break:break-all">${esc(video_link)}</a><br>
      <span style="font-size:12px;opacity:.8">Hacé clic en el link al momento del turno desde cualquier dispositivo.</span>
    </div>` : ''}
    <p style="font-size:13px;color:#64748b;">Si necesitás cancelar o reprogramar, contactá al consultorio con anticipación.</p>
  `)
  return { subject, html }
}

function tplTurnoRecordatorio({ nombre_paciente, nombre_profesional, fecha_hora, prestacion, video_link }) {
  const subject = `🔔 Recordatorio: tenés turno mañana — ${fecha_hora}`
  const html = baseLayout(`
    <h2>🔔 Recordatorio de turno</h2>
    <p>Hola ${nombre_paciente || ''},</p>
    <p>Te recordamos que mañana tenés un turno programado.</p>
    <div class="info-box">
      <strong>Tu turno:</strong>
      📅 <strong>${esc(fecha_hora)}</strong><br>
      👨‍⚕️ ${esc(nombre_profesional) || 'Su profesional'}<br>
      ${prestacion ? `🦷 ${esc(prestacion)}` : ''}
    </div>
    ${video_link ? `
    <a class="btn" href="${video_link}" style="background:#15803d">Unirse a la videollamada →</a>` : ''}
    <p style="font-size:13px;color:#64748b;">Si no podés asistir, avisá con anticipación para liberar el turno.</p>
  `)
  return { subject, html }
}

function tplTurnoCancelacion({ nombre_paciente, fecha_hora }) {
  const subject = `❌ Turno cancelado — ${fecha_hora}`
  const html = baseLayout(`
    <h2>Turno cancelado</h2>
    <p>Hola ${nombre_paciente || ''},</p>
    <p>Tu turno del <strong>${esc(fecha_hora)}</strong> fue cancelado.</p>
    <p>Si querés reprogramarlo, contactá al consultorio.</p>
  `)
  return { subject, html }
}

function tplPasswordReset({ nombre, token }) {
  const subject = 'Código para restablecer tu contraseña — Clingest'
  const html = baseLayout(`
    <h2>Restablecer contraseña</h2>
    <p>Hola ${esc(nombre) || ''},</p>
    <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en Clingest.</p>
    <div class="info-box" style="text-align:center">
      <strong>Tu código de verificación:</strong>
      <div style="font-size:2.4rem;font-weight:800;letter-spacing:.3rem;color:#0c4a6e;margin:12px 0">${token}</div>
      <span style="font-size:.83rem;color:#0369a1">Válido por 1 hora</span>
    </div>
    <p>Ingresá este código en la pantalla de restablecimiento de contraseña para continuar.</p>
    <hr class="divider">
    <p style="font-size:13px;color:#64748b;">Si no solicitaste este código, ignorá este email. Tu contraseña no cambiará.</p>
  `)
  return { subject, html }
}

// ── Dispatch ─────────────────────────────────────────────────

const TEMPLATES = {
  welcome: tplWelcome,
  trial_expiry: tplTrialExpiry,
  payment_receipt: tplPaymentReceipt,
  renewal_reminder: tplRenewalReminder,
  suspension: tplSuspension,
  activation: tplActivation,
  password_reset: tplPasswordReset,
  turno_confirmacion: tplTurnoConfirmacion,
  turno_recordatorio: tplTurnoRecordatorio,
  turno_cancelacion: tplTurnoCancelacion,
}

export async function sendEmail(env, tipo, data) {
  if (!env.RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY no configurada — email no enviado:', tipo)
    return { ok: false, id: null }
  }

  const tpl = TEMPLATES[tipo]
  if (!tpl) throw new Error(`Template de email desconocido: ${tipo}`)

  const { subject, html } = tpl(data)
  const to = data.email

  // Validar email antes de intentar enviar
  if (!to || !EMAIL_RE.test(String(to))) {
    console.warn('[Email] Dirección inválida, email no enviado:', to)
    return { ok: false, id: null }
  }

  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    })

    const result = await res.json().catch(() => ({}))

    // Loguear en email_log si hay DB
    if (env.DB && data.tenant_id) {
      try {
        await env.DB.prepare(
          `INSERT INTO email_log (id, tenant_id, tipo, destinatario, asunto, estado, resend_id, created_at)
           VALUES (lower(hex(randomblob(8))), ?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))`
        ).bind(
          data.tenant_id, tipo, to, subject,
          res.ok ? 'sent' : 'failed',
          result.id ?? null
        ).run()
      } catch (e) { /* log opcional, no bloquear */ }
    }

    return { ok: res.ok, id: result.id }
  } catch (e) {
    console.error('[Email] Error enviando:', e?.message)
    return { ok: false, id: null }
  }
}
