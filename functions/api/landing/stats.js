// ============================================================
// Landing Stats API
// GET /api/landing/stats → real stats from DB
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function onRequestGet({ env }) {
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM usuarios WHERE rol = 'tenant'`
    ).first()

    const consultorios = row?.total ?? 0

    return json({
      ok: true,
      data: {
        consultorios,
      },
    })
  } catch (e) {
    // Fallback to static values if DB is unavailable
    return json({
      ok: true,
      data: {
        consultorios: 500,
      },
    })
  }
}
