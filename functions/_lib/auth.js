// JWT puro con Web Crypto API (disponible en Workers)
// Sin librerías externas

const ALG = { name: 'HMAC', hash: 'SHA-256' }

async function getKey(secret) {
  const enc = new TextEncoder()
  return crypto.subtle.importKey('raw', enc.encode(secret), ALG, false, ['sign', 'verify'])
}

function b64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromB64url(str) {
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'))
}

export async function signJWT(payload, secret, expiresInHours = 24 * 7) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + expiresInHours * 3600 }))
  const data = `${header}.${body}`
  const key = await getKey(secret)
  const sig = await crypto.subtle.sign(ALG, key, new TextEncoder().encode(data))
  const sigB64 = b64url(String.fromCharCode(...new Uint8Array(sig)))
  return `${data}.${sigB64}`
}

export async function verifyJWT(token, secret) {
  try {
    const [header, body, sig] = token.split('.')
    if (!header || !body || !sig) return null
    const data = `${header}.${body}`
    const key = await getKey(secret)
    const sigBytes = Uint8Array.from(fromB64url(sig), c => c.charCodeAt(0))
    const valid = await crypto.subtle.verify(ALG, key, sigBytes, new TextEncoder().encode(data))
    if (!valid) return null
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')))
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export async function hashPassword(password) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('')
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
    keyMaterial, 256
  )
  const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `pbkdf2:${saltHex}:${hashHex}`
}

export async function verifyPassword(password, stored) {
  // Backward compat: si el hash es del formato viejo (salt:hash sin prefijo pbkdf2:)
  if (!stored.startsWith('pbkdf2:')) {
    // Formato viejo HMAC — verificar con el método anterior
    const [salt, storedHash] = stored.split(':')
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey('raw', enc.encode(password), ALG, false, ['sign'])
    const hash = await crypto.subtle.sign(ALG, key, enc.encode(salt))
    const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
    return hashHex === storedHash
  }
  // Formato nuevo PBKDF2
  const [, saltHex, storedHash] = stored.split(':')
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)))
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
    keyMaterial, 256
  )
  const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex === storedHash
}

export function uid() {
  return crypto.randomUUID()
}

// ── API Key helpers ──────────────────────────────────────────
export async function hashApiKey(key) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function getApiKeyUser(request, env) {
  const apiKey = request.headers.get('X-Api-Key')
  if (!apiKey?.startsWith('msy_')) return null
  try {
    const hash = await hashApiKey(apiKey)
    const row = await env.DB.prepare(
      `SELECT ak.id, ak.tenant_id, u.estado, u.trial_hasta
       FROM api_keys ak JOIN usuarios u ON u.id = ak.tenant_id
       WHERE ak.key_hash = ?1 AND ak.activo = 1`
    ).bind(hash).first()
    if (!row) return null
    // Fire and forget: update last_used_at
    env.DB.prepare(`UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?1`)
      .bind(row.id).run().catch(() => {})
    return { sub: row.tenant_id, rol: 'tenant', estado: row.estado, trial_hasta: row.trial_hasta, api_key_id: row.id }
  } catch {
    return null
  }
}

export async function getAuthUser(request, env) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const payload = await verifyJWT(token, env.JWT_SECRET)
  if (!payload) return null

  try {
    // ── Colaborador: verificar en tabla colaboradores (NO en usuarios) ──────
    // Si sobreescribiéramos con usuarios, el rol 'profesional' se reemplazaría
    // por 'tenant' del dueño — eso rompería todo el sistema de roles.
    if (payload.colab_id) {
      const colab = await env.DB.prepare(
        `SELECT id, rol, activo FROM colaboradores WHERE id = ?1 AND tenant_id = ?2`
      ).bind(payload.colab_id, payload.sub).first()
      if (!colab || !colab.activo) return null
      // Preservar rol del colaborador desde DB (no del JWT para evitar manipulación)
      return { ...payload, rol: colab.rol, estado: 'activo', trial_hasta: null }
    }

    // ── Owner: verificar estado fresco desde DB ──────────────────────────────
    const dbUser = await env.DB.prepare(
      `SELECT rol, estado, trial_hasta, token_version FROM usuarios WHERE id = ?1`
    ).bind(payload.sub).first()
    if (!dbUser) return null
    // Invalidar tokens anteriores si cambió la contraseña (token_version no coincide)
    if (payload.token_version !== undefined && payload.token_version !== (dbUser.token_version ?? 1)) return null
    return { ...payload, rol: dbUser.rol, estado: dbUser.estado, trial_hasta: dbUser.trial_hasta }
  } catch {
    // Do NOT fall back to raw JWT payload — if DB verification fails, deny access.
    // Returning an unverified payload would allow role spoofing via JWT claims.
    return null
  }
}
