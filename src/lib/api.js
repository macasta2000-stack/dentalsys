// Cliente HTTP interno — todas las calls van a /api/*
// Token se guarda en localStorage

const BASE = '/api'

function getToken() {
  return localStorage.getItem('ds_token')
}

async function request(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  // Auto-logout on 401 (token expired/invalid)
  if (res.status === 401 && token) {
    localStorage.removeItem('ds_token')
    window.location.href = '/login'
    throw new ApiError('Sesión expirada', 401)
  }

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const error = data?.error ?? `Error ${res.status}`
    throw new ApiError(error, res.status)
  }

  return data?.data ?? data
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),

  // Auth
  auth: {
    login: (email, password) => request('POST', '/auth/login', { email, password }),
    register: (email, password, nombre) => request('POST', '/auth/register', { email, password, nombre }),
    me: () => request('GET', '/auth/me'),
  },

  // Pacientes
  pacientes: {
    list: (q = '', estado = 'activo') => request('GET', `/pacientes?q=${encodeURIComponent(q)}&estado=${estado}`),
    get: (id) => request('GET', `/pacientes/${id}`),
    create: (body) => request('POST', '/pacientes', body),
    update: (id, body) => request('PATCH', `/pacientes/${id}`, body),
    delete: (id) => request('DELETE', `/pacientes/${id}`),
  },

  // Turnos
  turnos: {
    list: ({ from, to, paciente_id } = {}) => {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (paciente_id) params.set('paciente_id', paciente_id)
      return request('GET', `/turnos?${params}`)
    },
    get: (id) => request('GET', `/turnos/${id}`),
    create: (body) => request('POST', '/turnos', body),
    update: (id, body) => request('PATCH', `/turnos/${id}`, body),
    cancel: (id) => request('DELETE', `/turnos/${id}`),
  },

  // Pagos
  pagos: {
    list: ({ from, to, paciente_id } = {}) => {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (paciente_id) params.set('paciente_id', paciente_id)
      return request('GET', `/pagos?${params}`)
    },
    create: (body) => request('POST', '/pagos', body),
  },

  // Odontograma
  odontograma: {
    get: (pacienteId) => request('GET', `/odontograma?paciente_id=${pacienteId}`),
    save: (body) => request('POST', '/odontograma', body),
  },

  // Evoluciones
  evoluciones: {
    list: (pacienteId) => request('GET', `/evoluciones?paciente_id=${pacienteId}`),
    create: (body) => request('POST', '/evoluciones', body),
    update: (id, body) => request('PATCH', `/evoluciones/${id}`, body),
  },

  // Presupuestos
  presupuestos: {
    list: (pacienteId) => request('GET', `/presupuestos${pacienteId ? `?paciente_id=${pacienteId}` : ''}`),
    get: (id) => request('GET', `/presupuestos/${id}`),
    create: (body) => request('POST', '/presupuestos', body),
    update: (id, body) => request('PATCH', `/presupuestos/${id}`, body),
  },

  // Prestaciones
  prestaciones: {
    list: () => request('GET', '/prestaciones'),
    create: (body) => request('POST', '/prestaciones', body),
    update: (id, body) => request('PATCH', `/prestaciones/${id}`, body),
  },

  // Insumos
  insumos: {
    list: () => request('GET', '/insumos'),
    get: (id) => request('GET', `/insumos/${id}`),
    create: (body) => request('POST', '/insumos', body),
    update: (id, body) => request('PATCH', `/insumos/${id}`, body),
  },

  // Config
  config: {
    get: () => request('GET', '/config'),
    update: (body) => request('PATCH', '/config', body),
  },
}
