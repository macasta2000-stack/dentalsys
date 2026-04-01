// Offline-aware API wrapper.
//
// GET requests  → try network (3 s timeout), fall back to IndexedDB cache.
//                 Always updates local cache in background on success.
//
// Mutations (pacientes, evoluciones, pagos, insumos):
//   - If online: execute against real API immediately.
//     On success: update local record with server response.
//     On failure: push to sync_queue.
//   - If offline: write to IndexedDB optimistically, push to sync_queue.
//
// Turnos (agenda): ALWAYS online-only.
//   Reads are cached for offline viewing, but writes throw when offline.
//   This prevents double-booking between self-service and manual scheduling.

import { _http, ApiError } from './httpClient.js'
import {
  localGet,
  localGetAll,
  localPut,
  localDelete,
  queueMutation,
} from './localDB.js'

// ---------------------------------------------------------------------------
// Map URL prefixes → IndexedDB store names
// ---------------------------------------------------------------------------
const ENDPOINT_STORE_MAP = {
  '/turnos': 'turnos',
  '/pacientes': 'pacientes',
  '/evoluciones': 'evoluciones',
  '/pagos': 'caja_movimientos',   // pagos se cachean en el store 'caja_movimientos'
  '/insumos': 'insumos',
  // Nota: no existe endpoint /caja — los datos de caja provienen de /pagos
}

function resolveStore(path) {
  for (const [prefix, store] of Object.entries(ENDPOINT_STORE_MAP)) {
    if (path.startsWith(prefix)) return store
  }
  return null
}

function extractId(path) {
  const parts = path.split('?')[0].split('/').filter(Boolean)
  const last = parts[parts.length - 1]
  if (!last || ENDPOINT_STORE_MAP[`/${last}`] !== undefined) return null
  return isNaN(Number(last)) ? last : Number(last)
}

// ---------------------------------------------------------------------------
// GET — stale-while-revalidate (network first, cache fallback)
// ---------------------------------------------------------------------------

async function offlineGet(path) {
  const store = resolveStore(path)

  try {
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), 3000)

    const token = localStorage.getItem('ds_token')
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`/api${path}`, { headers, signal: controller.signal })
    clearTimeout(tid)

    if (res.ok) {
      const json = await res.json().catch(() => ({}))
      const data = json?.data ?? json

      // Update local cache in background
      if (store && data) {
        const records = Array.isArray(data) ? data : [data]
        records.forEach(r => { if (r?.id) localPut(store, r) })
      }

      return data
    }

    // Non-OK but reachable — propagate error (don't fall to stale cache)
    const errJson = await res.json().catch(() => ({}))
    if (res.status === 401) {
      localStorage.removeItem('ds_token')
      sessionStorage.setItem('session_expired', '1')
      window.location.href = '/login'
    }
    throw new ApiError(errJson?.error ?? `Error ${res.status}`, res.status)
  } catch (e) {
    if (e instanceof ApiError) throw e
    // Network timeout / offline — fall through to local cache
  }

  // Fallback: return from IndexedDB
  if (!store) return null

  const id = extractId(path)
  if (id) return localGet(store, id)

  // Apply query filters to cached data so date-filtered queries don't return stale unfiltered results
  const all = await localGetAll(store)
  if (!all) return []

  try {
    const qs = new URL(`http://x${path}`).searchParams
    const from = qs.get('from')
    const to = qs.get('to')
    const pacienteId = qs.get('paciente_id')

    return all.filter(r => {
      if (pacienteId && String(r.paciente_id) !== String(pacienteId)) return false
      if (from || to) {
        const fecha = (r.fecha_hora ?? r.fecha ?? '').substring(0, 10)
        if (fecha && from && fecha < from) return false
        if (fecha && to && fecha > to) return false
      }
      return true
    })
  } catch {
    return all
  }
}

// ---------------------------------------------------------------------------
// Mutations — optimistic local write + queue on failure
// ---------------------------------------------------------------------------

async function offlineMutate(method, path, body) {
  const store = resolveStore(path)
  const id = extractId(path)
  const isOnline = navigator.onLine
  const token = localStorage.getItem('ds_token')

  const optimistic = {
    ...(body || {}),
    id: id ?? body?.id ?? `local_${Date.now()}`,
    _pending: true,
  }

  // Write optimistically to local DB
  if (store) {
    if (method === 'DELETE' && id) {
      await localDelete(store, id)
    } else {
      await localPut(store, optimistic)
    }
  }

  // Attempt real API call if online
  if (isOnline && token) {
    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      const res = await fetch(`/api${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      })

      if (res.ok) {
        const json = await res.json().catch(() => ({}))
        const serverData = json?.data ?? json
        if (store && serverData?.id) {
          await localPut(store, { ...serverData, _pending: false })
        }
        return serverData
      } else if (res.status === 401) {
        localStorage.removeItem('ds_token')
        sessionStorage.setItem('session_expired', '1')
        window.location.href = '/login'
        throw new ApiError('Sesión expirada', 401)
      } else if (res.status >= 400 && res.status < 500) {
        // Client error — propagate, don't queue
        const errJson = await res.json().catch(() => ({}))
        throw new ApiError(errJson?.error ?? `Error ${res.status}`, res.status)
      }
      // Server error — fall through to queue
    } catch (e) {
      if (e instanceof ApiError) throw e
      // Network error — fall through to queue
    }
  }

  // Queue the mutation for later sync
  await queueMutation({
    method,
    url: `/api${path}`,
    body: body || null,
    tenant_id: null,
  })

  return optimistic
}

// ---------------------------------------------------------------------------
// Online-only mutation — throws when offline (used for turnos)
// ---------------------------------------------------------------------------

async function onlineMutate(method, path, body) {
  if (!navigator.onLine) {
    throw new ApiError('La agenda requiere conexión a internet para evitar turnos duplicados', 0)
  }
  // Use the raw HTTP client directly (no queue, no optimistic local write)
  if (method === 'GET') return _http.get(path)
  if (method === 'POST') return _http.post(path, body)
  if (method === 'PATCH') return _http.patch(path, body)
  if (method === 'DELETE') return _http.delete(path)
}

// ---------------------------------------------------------------------------
// Exported api object — same interface as the old api.js
// ---------------------------------------------------------------------------

export const apiOffline = {
  get: (path) => offlineGet(path),
  post: (path, body) => offlineMutate('POST', path, body),
  patch: (path, body) => offlineMutate('PATCH', path, body),
  put: (path, body) => offlineMutate('PUT', path, body),
  delete: (path) => offlineMutate('DELETE', path, null),

  auth: _http.auth,

  // Offline-capable (reads cached, writes queued when offline)
  pacientes: {
    list: (q = '', estado = 'activo') => offlineGet(`/pacientes?q=${encodeURIComponent(q)}&estado=${estado}`),
    get: (id) => offlineGet(`/pacientes/${id}`),
    create: (body) => offlineMutate('POST', '/pacientes', body),
    update: (id, body) => offlineMutate('PATCH', `/pacientes/${id}`, body),
    delete: (id) => offlineMutate('DELETE', `/pacientes/${id}`, null),
  },

  // Offline-capable reads; writes queued when offline
  evoluciones: {
    list: (pacienteId) => offlineGet(`/evoluciones?paciente_id=${pacienteId}`),
    listByPaciente: (pacienteId, limit = 3) => offlineGet(`/evoluciones?paciente_id=${pacienteId}&limit=${limit}`),
    create: (body) => offlineMutate('POST', '/evoluciones', body),
    update: (id, body) => offlineMutate('PATCH', `/evoluciones/${id}`, body),
  },

  // Offline-capable reads; writes queued when offline
  pagos: {
    list: ({ from, to, paciente_id } = {}) => {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (paciente_id) params.set('paciente_id', paciente_id)
      return offlineGet(`/pagos?${params}`)
    },
    create: (body) => {
      const localDate = new Date()
      const yyyy = localDate.getFullYear()
      const mm = String(localDate.getMonth() + 1).padStart(2, '0')
      const dd = String(localDate.getDate()).padStart(2, '0')
      const fechaLocal = `${yyyy}-${mm}-${dd}`
      return offlineMutate('POST', '/pagos', { fecha: fechaLocal, ...body })
    },
    anular: (id) => offlineMutate('DELETE', `/pagos/${id}`, null),
  },

  // Offline-capable reads; writes queued when offline
  insumos: {
    list: () => offlineGet('/insumos'),
    get: (id) => offlineGet(`/insumos/${id}`),
    create: (body) => offlineMutate('POST', '/insumos', body),
    update: (id, body) => offlineMutate('PATCH', `/insumos/${id}`, body),
  },

  // AGENDA: reads cached, writes ONLINE-ONLY (prevent double-booking)
  turnos: {
    list: ({ from, to, paciente_id, profesional_id } = {}) => {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (paciente_id) params.set('paciente_id', paciente_id)
      if (profesional_id) params.set('profesional_id', profesional_id)
      return offlineGet(`/turnos?${params}`)
    },
    get: (id) => offlineGet(`/turnos/${id}`),
    create: (body) => onlineMutate('POST', '/turnos', body),
    update: (id, body) => onlineMutate('PATCH', `/turnos/${id}`, body),
    cancel: (id) => onlineMutate('DELETE', `/turnos/${id}`),
    marcarAtendido: (id) => onlineMutate('PATCH', `/turnos/${id}`, { estado: 'completado' }),
  },

  // Pass-throughs — always online
  videoSessions: _http.videoSessions,
  comprobantes: _http.comprobantes,
  odontograma: _http.odontograma,
  presupuestos: _http.presupuestos,
  prestaciones: _http.prestaciones,
  config: _http.config,
  convenios: _http.convenios,
  anamnesis: _http.anamnesis,
  reportes: _http.reportes,
  importar: _http.importar,
  colaboradores: _http.colaboradores,
  crm: _http.crm,
  recetas: _http.recetas,
  planesPago: _http.planesPago,
  adjuntos: _http.adjuntos,
  onboarding: _http.onboarding,
  developer: _http.developer,
  giftcards: _http.giftcards,
  gastos: _http.gastos,
  booking: _http.booking,
  encuestas: _http.encuestas,
  ai: _http.ai,
  chat: _http.chat,
}

export default apiOffline
