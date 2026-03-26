const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

export function ok(data) { return json({ ok: true, data }) }
export function created(data) { return json({ ok: true, data }, 201) }
export function noContent() { return new Response(null, { status: 204, headers: CORS }) }

export function err(message, status = 400) {
  return json({ ok: false, error: message }, status)
}

export function unauthorized() { return err('No autorizado', 401) }
export function forbidden() { return err('Acceso denegado', 403) }
export function notFound(entity = 'Recurso') { return err(`${entity} no encontrado`, 404) }

export function cors() {
  return new Response(null, { status: 204, headers: CORS })
}
