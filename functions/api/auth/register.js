import { signJWT, hashPassword, uid } from '../../_lib/auth.js'
import { ok, err, cors } from '../../_lib/response.js'
import { findOne, insert } from '../../_lib/db.js'
import { PRESTACIONES_DEFAULT } from '../../_lib/preset.js'

export async function onRequestOptions() { return cors() }

// El registro público está deshabilitado.
// Las cuentas las crea el superadmin desde /admin
export async function onRequestPost() {
  return err('El registro público está deshabilitado. Contactá al administrador para obtener acceso.', 403)
}

export async function _onRequestPostOriginal({ request, env }) {
  try {
    const { email, password, nombre } = await request.json()
    if (!email || !password) return err('Email y contraseña requeridos')
    if (password.length < 8) return err('La contraseña debe tener al menos 8 caracteres')

    const existing = await findOne(env.DB, 'usuarios', { where: { email: email.toLowerCase() } })
    if (existing) return err('El email ya está registrado')

    const userId = uid()
    const passwordHash = await hashPassword(password)

    // Crear usuario
    await insert(env.DB, 'usuarios', {
      id: userId,
      email: email.toLowerCase(),
      password_hash: passwordHash,
      nombre: nombre ?? null,
    })

    // Provisionar configuración vacía
    await insert(env.DB, 'configuracion', {
      id: uid(),
      tenant_id: userId,
      nombre_consultorio: 'Mi Consultorio',
    })

    // Provisionar prestaciones default del preset
    const prestacionesStmt = env.DB.prepare(
      `INSERT INTO prestaciones (id, tenant_id, codigo, nombre, precio, duracion_minutos, categoria, activo)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)`
    )
    const batch = PRESTACIONES_DEFAULT.map(p =>
      prestacionesStmt.bind(uid(), userId, p.codigo, p.nombre, p.precio, p.duracion_minutos, p.categoria)
    )
    await env.DB.batch(batch)

    const token = await signJWT({ sub: userId, email: email.toLowerCase() }, env.JWT_SECRET)

    return ok({
      token,
      user: { id: userId, email: email.toLowerCase(), nombre: nombre ?? null },
    })
  } catch (e) {
    console.error(e)
    return err('Error interno', 500)
  }
}
