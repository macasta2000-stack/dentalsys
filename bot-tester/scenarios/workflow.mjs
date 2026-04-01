/**
 * Escenario completo de un día en un consultorio odontológico:
 * login → crear paciente → turno → llegada → evolución → cobro → presupuesto → plan de pago
 * Este es el flujo más importante: si esto falla, la beta no puede salir.
 */
import { createHttp } from '../core/http.mjs'
import { record } from '../core/report.mjs'
import { fakePaciente, fakeTurno, fakePago, fakeEvolucion, fakePresupuesto, fakePlanPago, sleep } from '../core/data.mjs'
import { refreshToken } from '../core/setup.mjs'

const http = createHttp()
const CAT  = 'workflow'
const D    = (r) => r.ok ? '' : `${r.status} ${r.error ?? JSON.stringify(r.data?.error ?? r.data).slice(0,80)}`

export async function runWorkflow(tenant) {
  try {
    if (!tenant.token) return

    // ── 1. Crear paciente ────────────────────────────────────────────────────
    const pacBody = fakePaciente(Date.now() + Math.random())
    const pacRes  = await http.postT('/pacientes', pacBody, tenant)
    record(CAT, 'crear-paciente', pacRes.ok, pacRes.ms, D(pacRes))
    if (!pacRes.ok) return

    const pacId = pacRes.data?.data?.id
    if (!pacId) { record(CAT, 'crear-paciente-id', false, 0, 'No devolvió id'); return }

    // ── 2. Obtener paciente ──────────────────────────────────────────────────
    const getpR = await http.getT(`/pacientes/${pacId}`, tenant)
    record(CAT, 'obtener-paciente', getpR.ok, getpR.ms, D(getpR))

    // ── 3. Listar pacientes + buscar ─────────────────────────────────────────
    const listR   = await http.getT('/pacientes', tenant)
    record(CAT, 'listar-pacientes', listR.ok, listR.ms, D(listR))

    const searchR = await http.getT(`/pacientes?q=${encodeURIComponent(pacBody.apellido)}`, tenant)
    record(CAT, 'buscar-paciente', searchR.ok, searchR.ms, D(searchR))

    // ── 4. Crear turno ───────────────────────────────────────────────────────
    const turnoRes = await http.postT('/turnos', fakeTurno(pacId), tenant)
    record(CAT, 'crear-turno', turnoRes.ok, turnoRes.ms, D(turnoRes))
    const turnoId  = turnoRes.data?.data?.id

    if (turnoId) {
      for (const estado of ['confirmado', 'presente', 'completado']) {
        const stR = await http.patchT(`/turnos/${turnoId}`, { estado }, tenant)
        record(CAT, `turno-estado-${estado}`, stR.ok, stR.ms, D(stR))
        await sleep(30)
      }
    }

    // ── 5. Evolución clínica ─────────────────────────────────────────────────
    const evolRes = await http.postT('/evoluciones', fakeEvolucion(pacId, turnoId), tenant)
    record(CAT, 'crear-evolucion', evolRes.ok, evolRes.ms, D(evolRes))

    const evolListR = await http.getT(`/evoluciones?paciente_id=${pacId}`, tenant)
    record(CAT, 'listar-evoluciones', evolListR.ok, evolListR.ms, D(evolListR))

    // ── 6. Pago en caja ──────────────────────────────────────────────────────
    const pagoRes = await http.postT('/pagos', fakePago(pacId), tenant)
    record(CAT, 'crear-pago', pagoRes.ok, pagoRes.ms, D(pagoRes))

    const hoy    = new Date().toISOString().slice(0, 10)
    const cajaR  = await http.getT(`/pagos?fecha_desde=${hoy}&fecha_hasta=${hoy}`, tenant)
    record(CAT, 'listar-caja', cajaR.ok, cajaR.ms, D(cajaR))

    // ── 7. Prestaciones + presupuesto ────────────────────────────────────────
    const prestR = await http.getT('/prestaciones', tenant)
    record(CAT, 'listar-prestaciones', prestR.ok, prestR.ms, D(prestR))
    const prests = prestR.data?.data ?? []

    if (prests.length > 0) {
      const presupRes = await http.postT('/presupuestos', fakePresupuesto(pacId, prests), tenant)
      record(CAT, 'crear-presupuesto', presupRes.ok, presupRes.ms, D(presupRes))
      const presupId  = presupRes.data?.data?.id
      if (presupId) {
        const aprobarR = await http.patchT(`/presupuestos/${presupId}`, { estado: 'aprobado' }, tenant)
        record(CAT, 'aprobar-presupuesto', aprobarR.ok, aprobarR.ms, D(aprobarR))
      }
    }

    // ── 8. Plan de pago ──────────────────────────────────────────────────────
    const planRes = await http.postT('/planes-pago', fakePlanPago(pacId), tenant)
    record(CAT, 'crear-plan-pago', planRes.ok, planRes.ms, D(planRes))
    const planId  = planRes.data?.data?.id

    if (planId) {
      const cuotasR = await http.getT(`/planes-pago/${planId}`, tenant)
      record(CAT, 'obtener-plan-pago', cuotasR.ok, cuotasR.ms, D(cuotasR))
      const primera = (cuotasR.data?.data?.cuotas ?? []).find(c => c.numero_cuota === 1)
      if (primera) {
        const pagarR = await http.patchT(`/planes-pago/${planId}/cuotas/${primera.id}`, {
          estado: 'pagada', medio_pago: 'efectivo',
          fecha_pago: new Date().toISOString().slice(0,10),
        }, tenant)
        record(CAT, 'pagar-cuota', pagarR.ok, pagarR.ms, D(pagarR))
      }
    }

    // ── 9. Agenda + config + editar ──────────────────────────────────────────
    const agendaR = await http.getT(`/turnos?fecha=${hoy}`, tenant)
    record(CAT, 'agenda-dia', agendaR.ok, agendaR.ms, D(agendaR))

    const configR = await http.getT('/config', tenant)
    record(CAT, 'config-get', configR.ok, configR.ms, D(configR))

    const editR = await http.patchT(`/pacientes/${pacId}`, { notas: 'QA editado' }, tenant)
    record(CAT, 'editar-paciente', editR.ok, editR.ms, D(editR))

  } catch (e) {
    record(CAT, 'workflow-exception', false, 0, e.message)
  }
}
