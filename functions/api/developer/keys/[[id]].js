// ============================================================
// API Keys — gestión de claves de acceso programático
// GET    /api/developer/keys      → listar claves del tenant
// POST   /api/developer/keys      → crear nueva clave (devuelve la clave completa UNA vez)
// DELETE /api/developer/keys/:id  → revocar clave
// ============================================================
import { ok, created, err, notFound, forbidden, cors } from '../../../_lib/response.js'
import { hashApiKey } from '../../../_lib/auth.js'

export async function onRequestOptions() { return cors() }

// Only tenant owners (and superadmin) can manage API keys.
// Colaboradores (profesional, recepcionista, admin) must never access this endpoint.
const CAN_MANAGE_KEYS = new Set(['tenant', 'superadmin'])

// ── GET: listar claves ────────────────────────────────────────
export async function onRequestGet({ data, env }) {
  const { user } = data
  // Las API keys no pueden gestionar otras API keys
  if (user.api_key_id) return forbidden('Usá tus credenciales de sesión para gestionar claves API')
  if (!CAN_MANAGE_KEYS.has(user.rol)) return forbidden('Solo el titular de la cuenta puede gestionar claves API')

  const { results } = await env.DB.prepare(
    `SELECT id, nombre, key_prefix, activo, last_used_at, created_at
     FROM api_keys WHERE tenant_id = ?1 ORDER BY created_at DESC`
  ).bind(user.sub).all()

  return ok(results ?? [])
}

// ── POST: crear nueva clave ───────────────────────────────────
export async function onRequestPost({ request, data, env }) {
  const { user } = data
  if (user.api_key_id) return forbidden('Usá tus credenciales de sesión para gestionar claves API')
  if (!CAN_MANAGE_KEYS.has(user.rol)) return forbidden('Solo el titular de la cuenta puede gestionar claves API')

  const body = await request.json().catch(() => ({}))
  const nombre = body.nombre?.trim() || 'Mi API Key'

  // Generar clave: msy_ + 48 hex chars (192 bits de entropía)
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  const fullKey = 'msy_' + hex
  const prefix = fullKey.slice(0, 12) // 'msy_' + 8 chars para mostrar

  const hash = await hashApiKey(fullKey)
  const id = crypto.randomUUID()

  await env.DB.prepare(
    `INSERT INTO api_keys (id, tenant_id, nombre, key_prefix, key_hash, activo, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 1, datetime('now'))`
  ).bind(id, user.sub, nombre, prefix, hash).run()

  // Devolver la clave completa UNA SOLA VEZ — no se puede recuperar después
  return created({ id, nombre, key_prefix: prefix, full_key: fullKey, created_at: new Date().toISOString() })
}

// ── DELETE: revocar clave ─────────────────────────────────────
export async function onRequestDelete({ data, env, params }) {
  const { user } = data
  if (user.api_key_id) return forbidden('Usá tus credenciales de sesión para gestionar claves API')
  if (!CAN_MANAGE_KEYS.has(user.rol)) return forbidden('Solo el titular de la cuenta puede gestionar claves API')

  const id = params?.id?.[0]
  if (!id) return err('ID requerido')

  const row = await env.DB.prepare(
    `SELECT id FROM api_keys WHERE id = ?1 AND tenant_id = ?2`
  ).bind(id, user.sub).first()
  if (!row) return notFound('API key')

  await env.DB.prepare(`DELETE FROM api_keys WHERE id = ?1 AND tenant_id = ?2`).bind(id, user.sub).run()
  return ok({ deleted: true })
}
