// Raw HTTP client — pure network, no offline logic.
// Imported by apiOffline.js for pass-through endpoints.
// Do NOT import from apiOffline.js here (would create circular dep).

const BASE = '/api'

function getToken() {
  return localStorage.getItem('ds_token')
}

export async function request(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (_) {
    throw new ApiError('Sin conexión. Verificá tu red e intentá nuevamente.', 0)
  }

  if (res.status === 401 && token) {
    localStorage.removeItem('ds_token')
    sessionStorage.setItem('session_expired', '1')
    window.location.href = '/login'
    throw new ApiError('Sesión expirada', 401)
  }

  let data = {}
  try {
    data = await res.json()
  } catch (_) {
    if (!res.ok) {
      throw new ApiError(`Servidor no disponible (${res.status}). Intentá en unos minutos.`, res.status)
    }
  }

  if (!res.ok) {
    const error = data?.error ?? `Error ${res.status}`
    throw new ApiError(error, res.status)
  }

  return data?.data ?? data
}

export async function uploadFile(path, formData) {
  const token = getToken()
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: formData })
  if (res.status === 401 && token) {
    localStorage.removeItem('ds_token')
    sessionStorage.setItem('session_expired', '1')
    window.location.href = '/login'
    throw new ApiError('Sesión expirada', 401)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data?.error ?? `Error ${res.status}`, res.status)
  return data?.data ?? data
}

export async function fetchBlob(path) {
  const token = getToken()
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { headers })
  if (!res.ok) throw new ApiError('No se pudo obtener el archivo', res.status)
  return res.blob()
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

// The raw HTTP api object — used internally by apiOffline.js for pass-throughs.
// External code should import `api` from `api.js` (the offline-capable version).
export const _http = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),

  auth: {
    login: (email, password) => request('POST', '/auth/login', { email, password }),
    me: () => request('GET', '/auth/me'),
    forgotPassword: (email) => request('POST', '/auth/forgot-password', { email }),
    resetPassword: (email, token, nueva_password) => request('POST', '/auth/reset-password', { email, token, nueva_password }),
  },
  odontograma: {
    get: (pacienteId) => request('GET', `/odontograma?paciente_id=${pacienteId}`),
    save: (body) => request('POST', '/odontograma', body),
  },
  presupuestos: {
    list: (pacienteId) => request('GET', `/presupuestos${pacienteId ? `?paciente_id=${pacienteId}` : ''}`),
    get: (id) => request('GET', `/presupuestos/${id}`),
    create: (body) => request('POST', '/presupuestos', body),
    update: (id, body) => request('PATCH', `/presupuestos/${id}`, body),
  },
  prestaciones: {
    list: () => request('GET', '/prestaciones'),
    create: (body) => request('POST', '/prestaciones', body),
    update: (id, body) => request('PATCH', `/prestaciones/${id}`, body),
  },
  config: {
    get: () => request('GET', '/config'),
    update: (body) => request('PATCH', '/config', body),
  },
  convenios: {
    list: (nombre_os) => request('GET', `/convenios${nombre_os ? `?nombre_os=${encodeURIComponent(nombre_os)}` : ''}`),
    get: (id) => request('GET', `/convenios/${id}`),
    create: (body) => request('POST', '/convenios', body),
    update: (id, body) => request('PATCH', `/convenios/${id}`, body),
    delete: (id) => request('DELETE', `/convenios/${id}`),
  },
  anamnesis: {
    get: (pacienteId) => request('GET', `/anamnesis?paciente_id=${pacienteId}`),
    save: (body) => request('POST', '/anamnesis', body),
  },
  reportes: {
    mensual: (anio, mes) => request('GET', `/reportes?tipo=mensual&anio=${anio}&mes=${mes}`),
    anual: (anio) => request('GET', `/reportes?tipo=anual&anio=${anio}`),
    prestaciones: (anio, mes) => request('GET', `/reportes?tipo=prestaciones&anio=${anio}&mes=${mes}`),
    pacientes: (anio, mes) => request('GET', `/reportes?tipo=pacientes&anio=${anio}&mes=${mes}`),
    comisiones: (anio, mes) => request('GET', `/reportes?tipo=comisiones&anio=${anio}&mes=${mes}`),
  },
  importar: {
    pacientes: (registros) => request('POST', '/import', { tipo: 'pacientes', registros }),
    turnos: (registros) => request('POST', '/import', { tipo: 'turnos', registros }),
    pagos: (registros) => request('POST', '/import', { tipo: 'pagos', registros }),
  },
  colaboradores: {
    list: () => request('GET', '/colaboradores'),
    create: (body) => request('POST', '/colaboradores', body),
    update: (id, body) => request('PATCH', `/colaboradores/${id}`, body),
    delete: (id) => request('DELETE', `/colaboradores/${id}`),
  },
  crm: {
    inactivos: (dias = 90) => request('GET', `/crm?tipo=inactivos&dias=${dias}`),
    cumpleanos: () => request('GET', '/crm?tipo=cumpleanos'),
    recordatorios: () => request('GET', '/crm?tipo=recordatorios'),
    deudores: () => request('GET', '/crm?tipo=deudores'),
    estadisticas: () => request('GET', '/crm?tipo=estadisticas'),
  },
  recetas: {
    list: (pacienteId) => request('GET', `/recetas${pacienteId ? `?paciente_id=${pacienteId}` : ''}`),
    get: (id) => request('GET', `/recetas/${id}`),
    create: (body) => request('POST', '/recetas', body),
    update: (id, body) => request('PATCH', `/recetas/${id}`, body),
    delete: (id) => request('DELETE', `/recetas/${id}`),
  },
  planesPago: {
    list: (pacienteId) => request('GET', `/planes-pago${pacienteId ? `?paciente_id=${pacienteId}` : ''}`),
    get: (id) => request('GET', `/planes-pago/${id}`),
    create: (body) => request('POST', '/planes-pago', body),
    pagarCuota: (planId, cuotaId, pagoId) => request('PATCH', `/planes-pago/${planId}`, { cuota_id: cuotaId, pago_id: pagoId }),
    cancelar: (id) => request('DELETE', `/planes-pago/${id}`),
  },
  adjuntos: {
    list: (pacienteId) => request('GET', `/adjuntos?paciente_id=${pacienteId}`),
    upload: (formData) => uploadFile('/adjuntos', formData),
    getBlob: (id) => fetchBlob(`/adjuntos/${id}/file`),
    delete: (id) => request('DELETE', `/adjuntos/${id}`),
  },
  onboarding: {
    get: () => request('GET', '/onboarding'),
    complete: (data) => request('POST', '/onboarding', data),
    cargarPreset: (especialidad) => request('POST', '/onboarding/preset', { especialidad }),
  },
  developer: {
    listKeys: () => request('GET', '/developer/keys'),
    createKey: (nombre) => request('POST', '/developer/keys', { nombre }),
    deleteKey: (id) => request('DELETE', `/developer/keys/${id}`),
  },
  giftcards: {
    list: (params = {}) => {
      const q = new URLSearchParams()
      if (params.estado) q.set('estado', params.estado)
      if (params.codigo) q.set('codigo', params.codigo)
      if (params.paciente_id) q.set('paciente_id', params.paciente_id)
      return request('GET', `/giftcards${q.toString() ? '?' + q : ''}`)
    },
    get: (id) => request('GET', `/giftcards/${id}`),
    create: (body) => request('POST', '/giftcards', body),
    update: (id, body) => request('PATCH', `/giftcards/${id}`, body),
    anular: (id) => request('DELETE', `/giftcards/${id}`),
  },
  encuestas: {
    list: () => request('GET', '/encuestas'),
    resumen: () => request('GET', '/encuestas?tipo=resumen'),
    create: (body) => request('POST', '/encuestas', body),
    responder: (id, body) => request('PATCH', `/encuestas/${id}`, body),
    comisiones: (anio, mes) => request('GET', `/reportes?tipo=comisiones&anio=${anio}&mes=${mes}`),
  },
  videoSessions: {
    get: (turnoId) => request('GET', `/video-sessions?turno_id=${turnoId}`),
    create: (body) => request('POST', '/video-sessions', body),
    finalizar: (id) => request('PATCH', `/video-sessions/${id}`, { estado: 'finalizada' }),
  },
  comprobantes: {
    list: (pacienteId) => request('GET', `/comprobantes${pacienteId ? `?paciente_id=${pacienteId}` : ''}`),
    get: (id) => request('GET', `/comprobantes/${id}`),
    create: (body) => request('POST', '/comprobantes', body),
    delete: (id) => request('DELETE', `/comprobantes/${id}`),
  },
}
