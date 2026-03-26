import { signJWT, verifyPassword } from '../../_lib/auth.js'
import { ok, err, cors } from '../../_lib/response.js'
import { findOne } from '../../_lib/db.js'

export async function onRequestOptions() { return cors() }

export async function onRequestPost({ request, env }) {
  try {
    const { email, password } = await request.json()
    if (!email || !password) return err('Email y contraseña requeridos')

    const user = await findOne(env.DB, 'usuarios', { where: { email: email.toLowerCase() } })
    if (!user) return err('Credenciales incorrectas', 401)

    const valid = await verifyPassword(password, user.password_hash)
    if (!valid) return err('Credenciales incorrectas', 401)

    const token = await signJWT({ sub: user.id, email: user.email }, env.JWT_SECRET)

    // Cargar configuración del consultorio
    const config = await findOne(env.DB, 'configuracion', { where: { tenant_id: user.id } })

    return ok({
      token,
      user: { id: user.id, email: user.email, nombre: user.nombre },
      configuracion: config,
    })
  } catch (e) {
    return err('Error interno', 500)
  }
}
