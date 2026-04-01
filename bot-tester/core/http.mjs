import { CONFIG } from '../config.mjs'

export function createHttp(baseUrl = CONFIG.BASE_URL) {
  async function request(method, path, body, token) {
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const opts = { method, headers, signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT_MS) }
    if (body !== undefined && body !== null) opts.body = JSON.stringify(body)
    const url = `${baseUrl}/api${path}`
    const t0 = Date.now()
    try {
      const res = await fetch(url, opts)
      const ms  = Date.now() - t0
      let data  = null
      try { data = await res.json() } catch { data = null }
      return { ok: res.ok, status: res.status, ms, data, url, method }
    } catch (e) {
      return { ok: false, status: 0, ms: Date.now() - t0, data: null, error: e.message, url, method }
    }
  }

  // Versión con retry automático en 401: refresca el token del tenant y reintenta una vez
  async function requestWithRefresh(method, path, body, tenant) {
    const r1 = await request(method, path, body, tenant.token)
    if (r1.status !== 401) return r1
    // Token expirado → refresh inmediato
    try {
      const ref = await request('POST', '/auth/login',
        { email: tenant.email, password: CONFIG.QA_PASSWORD }, null)
      if (ref.ok) {
        const newToken = ref.data?.data?.token
        if (newToken) tenant.token = newToken
      }
    } catch {}
    return request(method, path, body, tenant.token)
  }

  return {
    get:    (path, token)        => request('GET',    path, null,  token),
    post:   (path, body, token)  => request('POST',   path, body,  token),
    patch:  (path, body, token)  => request('PATCH',  path, body,  token),
    delete: (path, token)        => request('DELETE', path, null,  token),
    // Versión con tenant object para auto-refresh en 401
    getT:   (path, tenant)        => requestWithRefresh('GET',    path, null,  tenant),
    postT:  (path, body, tenant)  => requestWithRefresh('POST',   path, body,  tenant),
    patchT: (path, body, tenant)  => requestWithRefresh('PATCH',  path, body,  tenant),
    raw:    request,
    base:   baseUrl,
  }
}
