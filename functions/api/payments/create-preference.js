// ============================================================
// POST /api/payments/create-preference — DESHABILITADO
// Los planes se activan manualmente por el SuperAdmin vía
// /api/admin/usuarios/:id (PATCH plan_id + estado).
// El proceso de venta ocurre por WhatsApp.
// ============================================================
import { err, cors } from '../../_lib/response.js'

export async function onRequestOptions() { return cors() }

export async function onRequestPost() {
  return err('El pago automático no está disponible. Contactanos por WhatsApp para activar tu plan.', 410)
}
