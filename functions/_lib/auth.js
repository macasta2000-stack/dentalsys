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
  const salt = crypto.randomUUID()
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(password), ALG, false, ['sign'])
  const hash = await crypto.subtle.sign(ALG, key, enc.encode(salt))
  const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `${salt}:${hashHex}`
}

export async function verifyPassword(password, stored) {
  const [salt, storedHash] = stored.split(':')
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(password), ALG, false, ['sign'])
  const hash = await crypto.subtle.sign(ALG, key, enc.encode(salt))
  const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex === storedHash
}

export function uid() {
  return crypto.randomUUID()
}

export async function getAuthUser(request, env) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const payload = await verifyJWT(token, env.JWT_SECRET)
  return payload
}
