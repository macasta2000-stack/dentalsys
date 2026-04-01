import { ok, cors } from '../../_lib/response.js'

export async function onRequestOptions() { return cors() }

// GET /api/chat/miembros — list all team members I can chat with

export async function onRequestGet({ data, env }) {
  const { user } = data
  const miembros = []

  // Owner (clinic admin)
  const owner = await env.DB.prepare(
    `SELECT id, nombre, email FROM usuarios WHERE id = ?1`
  ).bind(user.sub).first()
  if (owner) {
    miembros.push({
      user_type: 'owner',
      user_id: owner.id,
      nombre: owner.nombre || owner.email?.split('@')[0] || 'Admin',
      rol: 'Administrador',
      es_yo: !user.colab_id,
    })
  }

  // Colaboradores
  const colabs = await env.DB.prepare(
    `SELECT id, nombre, apellido, rol, email FROM colaboradores WHERE tenant_id = ?1 AND activo = 1 ORDER BY nombre`
  ).bind(user.sub).all()

  for (const c of (colabs?.results ?? [])) {
    const rolLabel = c.rol === 'profesional' ? 'Profesional' : c.rol === 'recepcionista' ? 'Recepcionista' : 'Admin'
    miembros.push({
      user_type: 'colaborador',
      user_id: c.id,
      nombre: `${c.nombre} ${c.apellido}`.trim(),
      rol: rolLabel,
      es_yo: user.colab_id === c.id,
    })
  }

  return ok(miembros)
}
