import { ok, created, err, cors } from '../../_lib/response.js'
import { newId } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

// ── Helpers ──────────────────────────────────────────────────────────────────

function getChatIdentity(user) {
  // Colaborador or owner?
  if (user.colab_id) {
    return { user_type: 'colaborador', user_id: user.colab_id }
  }
  return { user_type: 'owner', user_id: user.sub }
}

// ── GET /api/chat — list my conversations with last message + unread count ───

export async function onRequestGet({ request, data, env }) {
  const { user } = data
  const { user_type, user_id } = getChatIdentity(user)
  const url = new URL(request.url)
  const unreadOnly = url.searchParams.get('unread') === '1'

  // Get all conversations I'm part of
  const convs = await env.DB.prepare(`
    SELECT c.id, c.tipo, c.nombre, c.created_at
    FROM chat_conversaciones c
    JOIN chat_participantes p ON p.conversacion_id = c.id
    WHERE c.tenant_id = ?1 AND p.user_type = ?2 AND p.user_id = ?3
    ORDER BY c.created_at DESC
  `).bind(user.sub, user_type, user_id).all()

  const conversations = []
  for (const conv of (convs?.results ?? [])) {
    // Last message
    const lastMsg = await env.DB.prepare(`
      SELECT sender_nombre, texto, created_at FROM chat_mensajes
      WHERE conversacion_id = ?1 ORDER BY created_at DESC LIMIT 1
    `).bind(conv.id).first()

    // Unread count
    const leido = await env.DB.prepare(`
      SELECT last_read_at FROM chat_leidos
      WHERE conversacion_id = ?1 AND user_type = ?2 AND user_id = ?3
    `).bind(conv.id, user_type, user_id).first()

    const lastReadAt = leido?.last_read_at || '1970-01-01'
    const unreadR = await env.DB.prepare(`
      SELECT COUNT(*) as cnt FROM chat_mensajes
      WHERE conversacion_id = ?1 AND created_at > ?2
        AND NOT (sender_type = ?3 AND sender_id = ?4)
    `).bind(conv.id, lastReadAt, user_type, user_id).first()

    const unread = unreadR?.cnt ?? 0
    if (unreadOnly && unread === 0) continue

    // Participants (for private chats, show the other person's name)
    let otherName = null
    if (conv.tipo === 'privado') {
      const other = await env.DB.prepare(`
        SELECT p.user_type, p.user_id,
          CASE WHEN p.user_type = 'owner' THEN (SELECT nombre FROM usuarios WHERE id = p.user_id)
               ELSE (SELECT nombre || ' ' || apellido FROM colaboradores WHERE id = p.user_id)
          END as nombre
        FROM chat_participantes p
        WHERE p.conversacion_id = ?1 AND NOT (p.user_type = ?2 AND p.user_id = ?3)
        LIMIT 1
      `).bind(conv.id, user_type, user_id).first()
      otherName = other?.nombre?.trim() || null
    }

    conversations.push({
      id: conv.id,
      tipo: conv.tipo,
      nombre: conv.tipo === 'privado' ? (otherName || 'Chat privado') : (conv.nombre || 'Equipo'),
      ultimo_mensaje: lastMsg ? { texto: lastMsg.texto, sender: lastMsg.sender_nombre, fecha: lastMsg.created_at } : null,
      no_leidos: unread,
    })
  }

  // Sort: unread first, then by last message date
  conversations.sort((a, b) => {
    if (a.no_leidos > 0 && b.no_leidos === 0) return -1
    if (b.no_leidos > 0 && a.no_leidos === 0) return 1
    const aDate = a.ultimo_mensaje?.fecha || a.created_at || ''
    const bDate = b.ultimo_mensaje?.fecha || b.created_at || ''
    return bDate.localeCompare(aDate)
  })

  return ok(conversations)
}

// ── POST /api/chat — create conversation or auto-get group ───────────────────

export async function onRequestPost({ request, data, env }) {
  const { user } = data
  const me = getChatIdentity(user)

  let body
  try { body = await request.json() } catch { return err('Body JSON inválido', 400) }

  const { tipo, target_type, target_id } = body

  // ── Create or get group chat ───
  if (tipo === 'grupo') {
    // Check if group already exists for this tenant
    let grupo = await env.DB.prepare(`
      SELECT id FROM chat_conversaciones WHERE tenant_id = ?1 AND tipo = 'grupo' LIMIT 1
    `).bind(user.sub).first()

    if (!grupo) {
      const grupoId = newId()
      await env.DB.prepare(`
        INSERT INTO chat_conversaciones (id, tenant_id, tipo, nombre) VALUES (?1, ?2, 'grupo', 'Equipo')
      `).bind(grupoId, user.sub).run()

      // Add owner as participant
      await env.DB.prepare(`
        INSERT OR IGNORE INTO chat_participantes (id, conversacion_id, user_type, user_id)
        VALUES (?1, ?2, 'owner', ?3)
      `).bind(newId(), grupoId, user.sub).run()

      // Add all active colaboradores
      const colabs = await env.DB.prepare(
        `SELECT id FROM colaboradores WHERE tenant_id = ?1 AND activo = 1`
      ).bind(user.sub).all()
      for (const c of (colabs?.results ?? [])) {
        await env.DB.prepare(`
          INSERT OR IGNORE INTO chat_participantes (id, conversacion_id, user_type, user_id)
          VALUES (?1, ?2, 'colaborador', ?3)
        `).bind(newId(), grupoId, c.id).run()
      }

      grupo = { id: grupoId }
    }

    return ok({ conversacion_id: grupo.id })
  }

  // ── Create or get private chat ───
  if (tipo === 'privado') {
    if (!target_type || !target_id) return err('target_type y target_id requeridos para chat privado', 400)

    // Check if private chat already exists between these two users
    const existing = await env.DB.prepare(`
      SELECT c.id FROM chat_conversaciones c
      WHERE c.tenant_id = ?1 AND c.tipo = 'privado'
        AND c.id IN (
          SELECT conversacion_id FROM chat_participantes WHERE user_type = ?2 AND user_id = ?3
        )
        AND c.id IN (
          SELECT conversacion_id FROM chat_participantes WHERE user_type = ?4 AND user_id = ?5
        )
      LIMIT 1
    `).bind(user.sub, me.user_type, me.user_id, target_type, target_id).first()

    if (existing) return ok({ conversacion_id: existing.id })

    // Create new private chat
    const convId = newId()
    await env.DB.prepare(`
      INSERT INTO chat_conversaciones (id, tenant_id, tipo) VALUES (?1, ?2, 'privado')
    `).bind(convId, user.sub).run()

    // Add both participants
    await env.DB.prepare(`
      INSERT INTO chat_participantes (id, conversacion_id, user_type, user_id) VALUES (?1, ?2, ?3, ?4)
    `).bind(newId(), convId, me.user_type, me.user_id).run()
    await env.DB.prepare(`
      INSERT INTO chat_participantes (id, conversacion_id, user_type, user_id) VALUES (?1, ?2, ?3, ?4)
    `).bind(newId(), convId, target_type, target_id).run()

    return created({ conversacion_id: convId })
  }

  return err('tipo debe ser "grupo" o "privado"', 400)
}
