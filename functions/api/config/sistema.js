// ============================================================
// GET  /api/config/sistema  — Configuración pública del sistema (GET is public)
// PATCH /api/config/sistema — Solo superadmin puede editar
// The middleware passes /api/config/sistema GET through without auth.
// PATCH is protected: middleware requires a valid JWT and then we verify superadmin here.
// ============================================================
import { ok, err, forbidden, cors } from '../../_lib/response.js'

export async function onRequestOptions() { return cors() }

// Claves editables por el superadmin
const CLAVES_EDITABLES = ['whatsapp_numero', 'whatsapp_activo', 'app_nombre', 'app_url']

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT clave, valor FROM sistema_config WHERE clave IN ('whatsapp_numero','whatsapp_activo','app_nombre','app_url')`
    ).all()
    const config = {}
    results.forEach(r => { config[r.clave] = r.valor })
    return ok(config)
  } catch (e) {
    return err('Error al obtener configuración', 500)
  }
}

export async function onRequestPatch({ request, data, env }) {
  // data.user is set by the middleware for authenticated requests
  const user = data?.user
  if (!user || user.rol !== 'superadmin') {
    return forbidden('Solo superadmin puede modificar la configuración del sistema')
  }

  try {
    const body = await request.json()
    for (const [clave, valor] of Object.entries(body)) {
      if (!CLAVES_EDITABLES.includes(clave)) continue
      await env.DB.prepare(
        `INSERT INTO sistema_config (clave, valor, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)
         ON CONFLICT(clave) DO UPDATE SET valor = ?2, updated_at = CURRENT_TIMESTAMP`
      ).bind(clave, String(valor)).run()
    }
    return ok({ updated: true })
  } catch (e) {
    console.error('[config/sistema] Error:', e?.message)
    return err('Error al guardar la configuración del sistema', 500)
  }
}
