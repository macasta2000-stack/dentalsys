import { ok, created, err, cors } from '../../_lib/response.js'
import { newId } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

function getChatIdentity(user) {
  if (user.colab_id) return { user_type: 'colaborador', user_id: user.colab_id }
  return { user_type: 'owner', user_id: user.sub }
}

// ── GET /api/chat/mensajes?conversacion_id=X&after=ISO ───────────────────────

export async function onRequestGet({ request, data, env }) {
  const { user } = data
  const me = getChatIdentity(user)
  const url = new URL(request.url)
  const convId = url.searchParams.get('conversacion_id')
  if (!convId) return err('conversacion_id requerido', 400)

  // Verify I'm a participant
  const participant = await env.DB.prepare(`
    SELECT id FROM chat_participantes
    WHERE conversacion_id = ?1 AND user_type = ?2 AND user_id = ?3
  `).bind(convId, me.user_type, me.user_id).first()
  if (!participant) return err('No tenés acceso a esta conversación', 403)

  const after = url.searchParams.get('after') || '1970-01-01'
  const limit = Math.min(Number(url.searchParams.get('limit') || 100), 200)

  const msgs = await env.DB.prepare(`
    SELECT id, sender_type, sender_id, sender_nombre, texto, created_at
    FROM chat_mensajes
    WHERE conversacion_id = ?1 AND created_at > ?2
    ORDER BY created_at ASC LIMIT ?3
  `).bind(convId, after, limit).all()

  return ok(msgs?.results ?? [])
}

// ── POST /api/chat/mensajes — send message ───────────────────────────────────

export async function onRequestPost({ request, data, env }) {
  const { user } = data
  const me = getChatIdentity(user)

  let body
  try { body = await request.json() } catch { return err('Body JSON inválido', 400) }

  const { conversacion_id, texto } = body
  if (!conversacion_id || !texto?.trim()) return err('conversacion_id y texto requeridos', 400)

  // Verify conversation exists and belongs to this tenant
  const conv = await env.DB.prepare(`
    SELECT id FROM chat_conversaciones WHERE id = ?1 AND tenant_id = ?2
  `).bind(conversacion_id, user.sub).first()
  if (!conv) return err('Conversación no encontrada', 404)

  // Verify I'm a participant
  const participant = await env.DB.prepare(`
    SELECT id FROM chat_participantes
    WHERE conversacion_id = ?1 AND user_type = ?2 AND user_id = ?3
  `).bind(conversacion_id, me.user_type, me.user_id).first()
  if (!participant) return err('No tenés acceso a esta conversación', 403)

  // Get sender name
  let senderNombre = 'Usuario'
  if (me.user_type === 'owner') {
    const u = await env.DB.prepare(`SELECT nombre FROM usuarios WHERE id = ?1`).bind(me.user_id).first()
    senderNombre = u?.nombre || user.email?.split('@')[0] || 'Admin'
  } else {
    const c = await env.DB.prepare(`SELECT nombre, apellido FROM colaboradores WHERE id = ?1`).bind(me.user_id).first()
    senderNombre = c ? `${c.nombre} ${c.apellido}`.trim() : 'Colaborador'
  }

  const msg = {
    id: newId(),
    conversacion_id,
    sender_type: me.user_type,
    sender_id: me.user_id,
    sender_nombre: senderNombre,
    texto: texto.trim().slice(0, 2000),
    created_at: new Date().toISOString(),
  }

  await env.DB.prepare(`
    INSERT INTO chat_mensajes (id, conversacion_id, sender_type, sender_id, sender_nombre, texto, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
  `).bind(msg.id, msg.conversacion_id, msg.sender_type, msg.sender_id, msg.sender_nombre, msg.texto, msg.created_at).run()

  // Auto-mark as read for sender
  await env.DB.prepare(`
    INSERT INTO chat_leidos (id, conversacion_id, user_type, user_id, last_read_at)
    VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT (conversacion_id, user_type, user_id) DO UPDATE SET last_read_at = ?5
  `).bind(newId(), conversacion_id, me.user_type, me.user_id, msg.created_at).run()

  return created(msg)
}

// ── PATCH /api/chat/mensajes — mark as read ──────────────────────────────────

export async function onRequestPatch({ request, data, env }) {
  const { user } = data
  const me = getChatIdentity(user)

  let body
  try { body = await request.json() } catch { return err('Body JSON inválido', 400) }

  const { conversacion_id } = body
  if (!conversacion_id) return err('conversacion_id requerido', 400)

  const now = new Date().toISOString()
  await env.DB.prepare(`
    INSERT INTO chat_leidos (id, conversacion_id, user_type, user_id, last_read_at)
    VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT (conversacion_id, user_type, user_id) DO UPDATE SET last_read_at = ?5
  `).bind(newId(), conversacion_id, me.user_type, me.user_id, now).run()

  return ok({ marked: true })
}
