// ============================================================
// /api/webhooks/mercadopago — DESHABILITADO
// MercadoPago no se usa. Los planes se activan manualmente
// por el SuperAdmin. Esta ruta devuelve 200 para evitar
// reintentos de cualquier notificación residual.
// ============================================================
import { ok, cors } from '../../_lib/response.js'

export async function onRequestOptions() { return cors() }

export async function onRequestPost() {
  return ok({ received: true, note: 'webhook disabled — manual activation only' })
}
