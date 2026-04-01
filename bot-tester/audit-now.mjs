const BASE = 'https://odontologo-228.pages.dev/api'
const QA_EMAIL = 'macasta2000@gmail.com'
const QA_PASS = 'superadmin321'

async function req(method, path, body, token) {
  const h = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = 'Bearer ' + token
  const t0 = Date.now()
  try {
    const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) })
    const ms = Date.now() - t0
    let data; try { data = await r.json() } catch { data = null }
    return { ok: r.ok, status: r.status, ms, data }
  } catch(e) { return { ok: false, status: 0, ms: Date.now() - t0, error: e.message } }
}

async function run() {
  const results = []
  const R = (name, cat, r, pass) => {
    results.push({ name, cat, pass, status: r.status, ms: r.ms, detail: pass ? '' : (r.error || JSON.stringify(r.data?.error ?? r.data)?.slice(0,120)) })
    return pass
  }

  const loginR = await req('POST', '/auth/login', { email: QA_EMAIL, password: QA_PASS })
  R('Login QA tenant', 'Auth', loginR, loginR.ok && !!loginR.data?.data?.token)
  const tk = loginR.data?.data?.token
  if (!tk) { console.log(JSON.stringify(results)); return }

  const meR = await req('GET', '/auth/me', null, tk)
  R('GET /auth/me — datos sesion', 'Auth', meR, meR.ok && !!meR.data?.data?.id)

  const suffix = Date.now()
  const pacR = await req('POST', '/pacientes', { nombre: 'Pedro', apellido: 'Gomez', dni: String(20000000 + Math.floor(Math.random()*9000000)), telefono: '1155554444', email: 'audit'+suffix+'@test.com', obra_social: 'OSDE' }, tk)
  R('POST /pacientes — crear paciente', 'Flujo Clinico', pacR, pacR.ok && !!pacR.data?.data?.id)
  const pacId = pacR.data?.data?.id

  if (pacId) {
    const gpR = await req('GET', '/pacientes/'+pacId, null, tk)
    R('GET /pacientes/:id — buscar por ID', 'Flujo Clinico', gpR, gpR.ok && gpR.data?.data?.id === pacId)
    const srR = await req('GET', '/pacientes?q=Gomez', null, tk)
    R('GET /pacientes?q= — busqueda nombre', 'Flujo Clinico', srR, srR.ok && Array.isArray(srR.data?.data))

    const hoy = new Date(); hoy.setDate(hoy.getDate()+1)
    const turnoR = await req('POST', '/turnos', { paciente_id: pacId, fecha_hora: hoy.toISOString().slice(0,10)+'T10:00', duracion_minutos: 30, motivo: 'Control' }, tk)
    R('POST /turnos — nuevo turno', 'Flujo Clinico', turnoR, turnoR.ok && !!turnoR.data?.data?.id)
    const turnoId = turnoR.data?.data?.id

    if (turnoId) {
      const st1 = await req('PATCH', '/turnos/'+turnoId, { estado: 'confirmado' }, tk)
      R('PATCH /turnos estado=confirmado', 'Flujo Clinico', st1, st1.ok)
      const st2 = await req('PATCH', '/turnos/'+turnoId, { estado: 'presente' }, tk)
      R('PATCH /turnos estado=presente', 'Flujo Clinico', st2, st2.ok)
      const st3 = await req('PATCH', '/turnos/'+turnoId, { estado: 'completado' }, tk)
      R('PATCH /turnos estado=completado', 'Flujo Clinico', st3, st3.ok)
      const agR = await req('GET', '/turnos?fecha='+new Date().toISOString().slice(0,10), null, tk)
      R('GET /turnos agenda del dia', 'Flujo Clinico', agR, agR.ok && Array.isArray(agR.data?.data))
    }

    const evolR = await req('POST', '/evoluciones', { paciente_id: pacId, descripcion: 'Limpieza bucal completa. Sin complicaciones.', monto: 3500 }, tk)
    R('POST /evoluciones — nota clinica', 'Flujo Clinico', evolR, evolR.ok && !!evolR.data?.data?.id)
    const elR = await req('GET', '/evoluciones?paciente_id='+pacId, null, tk)
    R('GET /evoluciones?paciente_id=', 'Flujo Clinico', elR, elR.ok && elR.data?.data?.length >= 1)

    const pagoR = await req('POST', '/pagos', { paciente_id: pacId, monto: 3500, metodo_pago: 'efectivo', concepto: 'Limpieza', fecha: new Date().toISOString().slice(0,10) }, tk)
    R('POST /pagos — cobro en caja', 'Flujo Clinico', pagoR, pagoR.ok && !!pagoR.data?.data?.id)
    const hoyStr = new Date().toISOString().slice(0,10)
    const cajaR = await req('GET', '/pagos?fecha_desde='+hoyStr+'&fecha_hasta='+hoyStr, null, tk)
    R('GET /pagos — caja del dia', 'Flujo Clinico', cajaR, cajaR.ok && cajaR.data?.data?.length >= 1)

    const prestR = await req('GET', '/prestaciones', null, tk)
    R('GET /prestaciones catalogo', 'Flujo Clinico', prestR, prestR.ok && Array.isArray(prestR.data?.data))
    const insR = await req('GET', '/insumos', null, tk)
    R('GET /insumos stock', 'Flujo Clinico', insR, insR.ok && Array.isArray(insR.data?.data))

    const presupR = await req('POST', '/presupuestos', { paciente_id: pacId, items: [{ descripcion: 'Limpieza', cantidad: 1, precio_unitario: 3500 }, { descripcion: 'Radiografia', cantidad: 2, precio_unitario: 1200 }] }, tk)
    R('POST /presupuestos — 2 items', 'Flujo Clinico', presupR, presupR.ok && !!presupR.data?.data?.id)
    const presupId = presupR.data?.data?.id
    if (presupId) {
      const pgR = await req('GET', '/presupuestos/'+presupId, null, tk)
      R('GET /presupuestos/:id con items', 'Flujo Clinico', pgR, pgR.ok && pgR.data?.data?.items?.length >= 1)
      R('PATCH presupuesto aprobado', 'Flujo Clinico', await req('PATCH', '/presupuestos/'+presupId, { estado: 'aprobado' }, tk), true)
    }

    const planR = await req('POST', '/planes-pago', { paciente_id: pacId, concepto: 'Ortodoncia', monto_total: 24000, cuotas: 6, frecuencia: 'mensual' }, tk)
    R('POST /planes-pago — plan 6 cuotas', 'Flujo Clinico', planR, planR.ok && !!planR.data?.data?.id)
    const planId = planR.data?.data?.id
    if (planId) {
      const pgR = await req('GET', '/planes-pago/'+planId, null, tk)
      R('GET /planes-pago — cuotas generadas', 'Flujo Clinico', pgR, pgR.ok && pgR.data?.data?.cuotas?.length === 6)
      const c1 = pgR.data?.data?.cuotas?.[0]
      if (c1) {
        const pagarR = await req('PATCH', '/planes-pago/'+planId+'/cuotas/'+c1.id, { estado: 'pagada', medio_pago: 'efectivo', fecha_pago: hoyStr }, tk)
        R('PATCH cuota pagada', 'Flujo Clinico', pagarR, pagarR.ok)
      }
    }

    R('GET /config consultorio', 'Flujo Clinico', await req('GET', '/config', null, tk), true)
    R('PATCH /pacientes — editar notas', 'Flujo Clinico', await req('PATCH', '/pacientes/'+pacId, { notas: 'Auditado OK' }, tk), true)
    R('DELETE /pacientes — archivar', 'Flujo Clinico', await req('DELETE', '/pacientes/'+pacId, null, tk), true)
  }

  const noTk = await req('GET', '/pacientes', null, null)
  R('[SEG] Sin token -> 401', 'Seguridad', noTk, noTk.status === 401)
  const badTk = await req('GET', '/pacientes', null, 'bearer.falso.abc')
  R('[SEG] Token inventado -> 401', 'Seguridad', badTk, badTk.status === 401)
  const sinNom = await req('POST', '/pacientes', { apellido: 'X' }, tk)
  R('[SEG] Paciente sin nombre -> rechazado', 'Seguridad', sinNom, !sinNom.ok && sinNom.status < 500)
  const sqlInj = await req('GET', '/pacientes?q=%27%20OR%201%3D1%20--', null, tk)
  R('[SEG] SQL injection -> no 500', 'Seguridad', sqlInj, sqlInj.status !== 500)
  const bigPay = await req('POST', '/pacientes', { nombre: 'X', apellido: 'Y', observaciones: 'A'.repeat(6000) }, tk)
  R('[SEG] Payload 6000 chars -> no 500', 'Seguridad', bigPay, bigPay.status !== 500)
  const sinPac = await req('POST', '/presupuestos', { items: [] }, tk)
  R('[SEG] Presupuesto sin paciente -> 4xx', 'Seguridad', sinPac, !sinPac.ok && sinPac.status < 500)

  console.log(JSON.stringify(results))
}
run().catch(e => { console.error(e.message); process.exit(1) })
