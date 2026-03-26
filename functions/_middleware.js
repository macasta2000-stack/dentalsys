import { getAuthUser } from './_lib/auth.js'
import { unauthorized, cors } from './_lib/response.js'

const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
]

export async function onRequest(context) {
  const { request, env, next } = context

  // OPTIONS preflight
  if (request.method === 'OPTIONS') return cors()

  const url = new URL(request.url)

  // Rutas públicas
  if (PUBLIC_ROUTES.some(r => url.pathname === r)) {
    return next()
  }

  // Solo aplica middleware a /api/*
  if (!url.pathname.startsWith('/api/')) {
    return next()
  }

  // Verificar JWT
  const user = await getAuthUser(request, env)
  if (!user) return unauthorized()

  context.data.user = user
  return next()
}
