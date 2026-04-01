/**
 * Casos borde y validaciones de negocio:
 * - Montos negativos / cero / muy grandes
 * - Campos requeridos ausentes
 * - Fechas inválidas / pasadas / muy futuras
 * - Conflictos de turno (mismo horario)
 * - Cuotas fuera de rango (> 60)
 * - DNI duplicado
 * - Email duplicado
 */
import { createHttp } from '../core/http.mjs'
import { record } from '../core/report.mjs'
import { fakePaciente, fakeTurno, sleep } from '../core/data.mjs'
import { refreshToken } from '../core/setup.mjs'

const http = createHttp()
const CAT  = 'edge-cases'

export async function runEdgeCases(tenant) {
  try {
    tenant = await refreshToken(tenant)
    const tk = tenant.token
    if (!tk) return

    // ── Crear paciente base para tests ────────────────────────────────────────
    const basePac = await http.post('/pacientes', fakePaciente(Date.now()), tk)
    if (!basePac.ok) return
    const pacId = basePac.data?.data?.id

    // ── 1. Campos requeridos ausentes ────────────────────────────────────────
    const missingNombre = await http.post('/pacientes', { apellido: 'Solo', email: 'solo@test.com' }, tk)
    record(CAT, 'pac-sin-nombre-400', !missingNombre.ok, missingNombre.ms,
      missingNombre.ok ? 'Aceptó paciente sin nombre' : '')

    // ── 2. Pago con monto cero ────────────────────────────────────────────────
    const pagoZero = await http.post('/pagos', {
      paciente_id: pacId, monto: 0, medio_pago: 'efectivo',
      concepto: 'test', fecha: new Date().toISOString().slice(0,10),
    }, tk)
    record(CAT, 'pago-monto-cero-rechazado', !pagoZero.ok, pagoZero.ms,
      pagoZero.ok ? 'Aceptó pago con monto 0' : '')

    // ── 3. Pago con monto negativo ────────────────────────────────────────────
    const pagoNeg = await http.post('/pagos', {
      paciente_id: pacId, monto: -500, medio_pago: 'efectivo',
      concepto: 'test', fecha: new Date().toISOString().slice(0,10),
    }, tk)
    record(CAT, 'pago-monto-negativo-rechazado', !pagoNeg.ok, pagoNeg.ms,
      pagoNeg.ok ? 'Aceptó pago con monto negativo' : '')

    // ── 4. Pago con monto absurdo ─────────────────────────────────────────────
    const pagoGigante = await http.post('/pagos', {
      paciente_id: pacId, monto: 999_999_999_999, medio_pago: 'efectivo',
      concepto: 'test', fecha: new Date().toISOString().slice(0,10),
    }, tk)
    // Puede aceptar o rechazar, pero NUNCA debe dar 500
    record(CAT, 'pago-monto-gigante-no-500', pagoGigante.status !== 500, pagoGigante.ms)

    // ── 5. Plan de pago con 0 cuotas ─────────────────────────────────────────
    const plan0 = await http.post('/planes-pago', {
      paciente_id: pacId, concepto: 'test', monto_total: 5000, num_cuotas: 0,
    }, tk)
    record(CAT, 'plan-0-cuotas-rechazado', !plan0.ok, plan0.ms,
      plan0.ok ? 'Aceptó plan con 0 cuotas' : '')

    // ── 6. Plan de pago con más de 60 cuotas ─────────────────────────────────
    const plan999 = await http.post('/planes-pago', {
      paciente_id: pacId, concepto: 'test', monto_total: 5000, num_cuotas: 999,
    }, tk)
    record(CAT, 'plan-61-cuotas-rechazado', !plan999.ok, plan999.ms,
      plan999.ok ? 'Aceptó plan con 999 cuotas' : '')

    // ── 7. Conflicto de turnos (mismo horario) ────────────────────────────────
    const turnoBase = fakeTurno(pacId)
    turnoBase.fecha_hora = `${new Date().toISOString().slice(0,10)}T10:00`
    turnoBase.duracion_minutos = 30
    const t1 = await http.post('/turnos', turnoBase, tk)
    await sleep(100)
    const t2 = await http.post('/turnos', { ...turnoBase }, tk) // exactamente el mismo
    // Puede ser que el sistema permita solapamiento o lo rechace, pero no debe dar 500
    record(CAT, 'turno-solapado-no-500', t2.status !== 500, t2.ms)

    // ── 8. Fecha de turno inválida ────────────────────────────────────────────
    const turnoFecha = await http.post('/turnos', {
      ...fakeTurno(pacId), fecha_hora: 'no-es-fecha-9999T25:99',
    }, tk)
    record(CAT, 'turno-fecha-invalida-no-500', turnoFecha.status !== 500, turnoFecha.ms)

    // ── 9. DNI repetido ───────────────────────────────────────────────────────
    const dni = '12345678'
    await http.post('/pacientes', { ...fakePaciente(Date.now()), dni }, tk)
    const dupDni = await http.post('/pacientes', { ...fakePaciente(Date.now()+1), dni }, tk)
    // Puede aceptar (dni no es unique key) o rechazar, pero nunca 500
    record(CAT, 'dni-duplicado-no-500', dupDni.status !== 500, dupDni.ms)

    // ── 10. Body vacío ────────────────────────────────────────────────────────
    const emptyBody = await http.post('/pacientes', {}, tk)
    record(CAT, 'body-vacio-400', !emptyBody.ok, emptyBody.ms,
      emptyBody.ok ? 'Aceptó paciente vacío' : '')

    // ── 11. PATCH con id inexistente ──────────────────────────────────────────
    const patchFake = await http.patch('/pacientes/id-que-no-existe-jamas-9999', { nombre: 'X' }, tk)
    record(CAT, 'patch-id-inexistente-404', patchFake.status === 404 || !patchFake.ok, patchFake.ms)

    // ── 12. GET id inexistente ────────────────────────────────────────────────
    const getFake = await http.get('/pacientes/id-que-no-existe-jamas-9999', tk)
    record(CAT, 'get-id-inexistente-404', getFake.status === 404, getFake.ms)

    // ── 13. Evolución sin paciente_id ─────────────────────────────────────────
    const evolSinPac = await http.post('/evoluciones', { descripcion: 'test', monto: 100 }, tk)
    record(CAT, 'evolucion-sin-paciente-400', !evolSinPac.ok, evolSinPac.ms,
      evolSinPac.ok ? 'Aceptó evolución sin paciente_id' : '')

  } catch (e) {
    record(CAT, 'edge-exception', false, 0, e.message)
  }
}
