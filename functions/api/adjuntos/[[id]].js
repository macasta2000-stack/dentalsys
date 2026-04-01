// ============================================================
// Adjuntos API — archivos adjuntos por paciente
// Almacenamiento en Cloudflare R2
//
// GET  /api/adjuntos?paciente_id=X  → listar adjuntos
// POST /api/adjuntos                → subir archivo (multipart/form-data)
// GET  /api/adjuntos/:id/file       → servir archivo desde R2
// DELETE /api/adjuntos/:id          → eliminar (soft delete)
//
// Permisos:
//   - Subir/eliminar: tenant, admin, profesional (NO recepcionista)
//   - Ver/listar: todos los roles autenticados del mismo tenant
// ============================================================

import { ok, created, err, notFound, forbidden, cors } from '../../_lib/response.js'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
}

const MAX_SIZE_BYTES = 20 * 1024 * 1024 // 20MB

// Tipos permitidos — previene subida de HTML/JS malicioso
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/zip', 'application/x-zip-compressed',
])

const UPLOAD_ROLES = new Set(['tenant', 'superadmin', 'admin', 'profesional'])

function newId() {
  return crypto.randomUUID().replace(/-/g, '')
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

// ── GET ──────────────────────────────────────────────────────
export async function onRequestGet({ request, data, env, params }) {
  const { user } = data
  const segments = params?.id ?? []
  const id = segments[0]
  const sub = segments[1]

  // GET /api/adjuntos/:id/file — servir archivo desde R2
  if (id && sub === 'file') {
    const adj = await env.DB.prepare(
      `SELECT * FROM adjuntos WHERE id = ?1 AND tenant_id = ?2 AND activo = 1`
    ).bind(id, user.sub).first()
    if (!adj) return notFound('Adjunto')

    const object = await env.BUCKET.get(adj.r2_key)
    if (!object) return notFound('Archivo en storage')

    const headers = new Headers({
      'Content-Type': adj.tipo_mime || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(adj.nombre_archivo)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
      ...CORS_HEADERS,
    })
    return new Response(object.body, { headers })
  }

  // GET /api/adjuntos?paciente_id=X — listar adjuntos (opcionalmente filtrado por evolucion_id)
  const url = new URL(request.url)
  const pacienteId = url.searchParams.get('paciente_id')
  if (!pacienteId) return err('paciente_id requerido')

  const result = await env.DB.prepare(
    `SELECT id, nombre_archivo, tipo_mime, tamano, descripcion,
            subido_por_nombre, created_at, evolucion_id
     FROM adjuntos
     WHERE paciente_id = ?1 AND tenant_id = ?2 AND activo = 1
     ORDER BY created_at DESC`
  ).bind(pacienteId, user.sub).all()

  return ok(result?.results ?? [])
}

// ── POST — subir archivo ──────────────────────────────────────
export async function onRequestPost({ request, data, env }) {
  const { user } = data

  if (!UPLOAD_ROLES.has(user.rol)) {
    return forbidden('Solo profesionales pueden subir archivos')
  }

  let formData
  try {
    formData = await request.formData()
  } catch {
    return err('Request debe ser multipart/form-data')
  }

  const file = formData.get('file')
  const pacienteId = formData.get('paciente_id')
  const descripcion = formData.get('descripcion') ?? ''
  const evolucionId = formData.get('evolucion_id') ?? null

  if (!file || typeof file === 'string') return err('Archivo requerido')
  if (!pacienteId) return err('paciente_id requerido')
  if (file.size > MAX_SIZE_BYTES) return err('El archivo supera el límite de 20 MB')
  const mimeType = file.type || 'application/octet-stream'
  if (!ALLOWED_TYPES.has(mimeType)) return err('Tipo de archivo no permitido. Se aceptan: imágenes, PDF, Word, Excel, texto y ZIP.')

  // Verificar que el paciente pertenece a este tenant
  const paciente = await env.DB.prepare(
    `SELECT id FROM pacientes WHERE id = ?1 AND tenant_id = ?2`
  ).bind(pacienteId, user.sub).first()
  if (!paciente) return notFound('Paciente')

  const id = newId()
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._\-áéíóúÁÉÍÓÚñÑ ]/g, '_')
  const r2Key = `${user.sub}/${pacienteId}/${id}_${safeFilename}`

  // Subir a R2
  const buffer = await file.arrayBuffer()
  await env.BUCKET.put(r2Key, buffer, {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
    customMetadata: { tenant_id: String(user.sub), paciente_id: String(pacienteId) },
  })

  // Guardar metadata en D1
  const subidoPorNombre = [user.nombre, user.apellido].filter(Boolean).join(' ') || user.email || 'Profesional'

  await env.DB.prepare(
    `INSERT INTO adjuntos (id, tenant_id, paciente_id, evolucion_id, nombre_archivo, tipo_mime, tamano, r2_key, descripcion, subido_por, subido_por_nombre, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'))`
  ).bind(
    id, user.sub, pacienteId, evolucionId || null,
    safeFilename,
    file.type || 'application/octet-stream',
    file.size,
    r2Key,
    descripcion || null,
    user.id ?? null,
    subidoPorNombre,
  ).run()

  const adj = await env.DB.prepare(
    `SELECT id, nombre_archivo, tipo_mime, tamano, descripcion, subido_por_nombre, created_at, evolucion_id FROM adjuntos WHERE id = ?1`
  ).bind(id).first()

  return created(adj)
}

// ── DELETE — eliminar adjunto ─────────────────────────────────
export async function onRequestDelete({ data, env, params }) {
  const { user } = data
  const id = params?.id?.[0]
  if (!id) return err('ID requerido')

  if (!UPLOAD_ROLES.has(user.rol)) {
    return forbidden('Sin permisos para eliminar archivos')
  }

  const adj = await env.DB.prepare(
    `SELECT * FROM adjuntos WHERE id = ?1 AND tenant_id = ?2 AND activo = 1`
  ).bind(id, user.sub).first()
  if (!adj) return notFound('Adjunto')

  // Solo el propio profesional que subió, o tenant/admin, pueden eliminar
  const isOwner = adj.subido_por === (user.id ?? null)
  const canDelete = ['tenant', 'superadmin', 'admin'].includes(user.rol) || isOwner
  if (!canDelete) return forbidden('Solo podés eliminar tus propios archivos')

  // Eliminar de R2
  try { await env.BUCKET.delete(adj.r2_key) } catch {}

  // Soft delete en D1
  await env.DB.prepare(
    `UPDATE adjuntos SET activo = 0 WHERE id = ?1`
  ).bind(id).run()

  return ok({ deleted: true })
}
