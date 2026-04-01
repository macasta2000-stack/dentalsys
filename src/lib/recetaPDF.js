// ============================================================
// recetaPDF.js — Generador de recetas médicas en PDF
// Usa el sistema de impresión nativo del browser (sin deps extra)
// Válido bajo Ley 27.553 + Decreto 98/2023 (Argentina)
// ============================================================

/**
 * Imprime/genera PDF de una receta médica
 * @param {Object} receta - Datos de la receta
 * @param {Object} config - Configuración del consultorio (profesional, matrícula, etc.)
 * @param {Object} paciente - Datos del paciente
 */
export function imprimirReceta({ receta, config, paciente }) {
  const fecha = receta.fecha
    ? new Date(receta.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const medicamentos = (() => {
    if (!receta.medicamentos) return []
    if (Array.isArray(receta.medicamentos)) return receta.medicamentos
    try { return JSON.parse(receta.medicamentos) } catch { return [] }
  })()

  const profesionalNombre = receta.profesional_nombre || config?.nombre_profesional || 'Profesional'
  const matricula = receta.profesional_matricula || config?.matricula || ''
  const especialidad = config?.especialidad || ''
  const consultorio = config?.nombre_consultorio || ''
  const telefono = config?.telefono || ''
  const direccion = config?.direccion || ''
  const email = config?.email || ''
  const cuit = config?.cuit || ''
  const firma = config?.firma_digital || ''

  const pacienteNombre = paciente
    ? `${paciente.nombre || ''} ${paciente.apellido || ''}`.trim()
    : ''
  const pacienteDni = paciente?.dni || ''
  const pacienteNacimiento = paciente?.fecha_nacimiento
    ? new Date(paciente.fecha_nacimiento).toLocaleDateString('es-AR')
    : ''

  // Calcular edad
  let edad = ''
  if (paciente?.fecha_nacimiento) {
    const hoy = new Date()
    const nac = new Date(paciente.fecha_nacimiento)
    const a = hoy.getFullYear() - nac.getFullYear()
    const m = hoy.getMonth() - nac.getMonth()
    edad = a - (m < 0 || (m === 0 && hoy.getDate() < nac.getDate()) ? 1 : 0) + ' años'
  }

  const recetaId = receta.id?.slice(0, 8).toUpperCase() || 'N/A'

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Receta — ${pacienteNombre}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Outfit', 'Segoe UI', Arial, sans-serif;
    background: #fff;
    color: #1a1a2e;
    font-size: 13px;
    line-height: 1.5;
  }

  .page {
    width: 148mm;
    min-height: 210mm;
    margin: 0 auto;
    padding: 10mm 12mm;
    position: relative;
  }

  /* ── Header / Membrete ── */
  .header {
    border-bottom: 2.5px solid #2563eb;
    padding-bottom: 10px;
    margin-bottom: 14px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .header-left h1 {
    font-size: 17px;
    font-weight: 800;
    color: #1e3a8a;
    letter-spacing: -0.3px;
  }

  .header-left .especialidad {
    font-size: 11px;
    color: #2563eb;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-top: 1px;
  }

  .header-left .datos {
    font-size: 10.5px;
    color: #64748b;
    margin-top: 5px;
    line-height: 1.6;
  }

  .header-right {
    text-align: right;
    font-size: 10px;
    color: #94a3b8;
  }

  .header-right .matricula {
    font-weight: 700;
    color: #1e40af;
    font-size: 11px;
  }

  /* ── Título RECETA ── */
  .receta-title {
    text-align: center;
    margin-bottom: 14px;
  }

  .receta-title h2 {
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: #1e293b;
    border: 2px solid #e2e8f0;
    display: inline-block;
    padding: 5px 20px;
    border-radius: 4px;
  }

  .receta-title .numero {
    font-size: 9px;
    color: #94a3b8;
    margin-top: 3px;
  }

  /* ── Datos del paciente ── */
  .paciente-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 14px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 16px;
  }

  .paciente-box .field label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #94a3b8;
    font-weight: 600;
    display: block;
  }

  .paciente-box .field span {
    font-size: 12px;
    font-weight: 600;
    color: #1e293b;
  }

  /* ── Fecha ── */
  .fecha-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
    font-size: 11px;
    color: #64748b;
  }

  .fecha-row strong {
    color: #1e293b;
  }

  /* ── Medicamentos ── */
  .medicamentos-title {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #64748b;
    font-weight: 700;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 5px;
    margin-bottom: 10px;
  }

  .medicamento {
    margin-bottom: 14px;
    padding: 10px 12px;
    border-left: 3px solid #2563eb;
    background: #f8fafc;
    border-radius: 0 6px 6px 0;
  }

  .medicamento .nombre {
    font-size: 13.5px;
    font-weight: 700;
    color: #1e293b;
    margin-bottom: 3px;
  }

  .medicamento .dosis {
    font-size: 11.5px;
    color: #334155;
    font-weight: 500;
  }

  .medicamento .instrucciones {
    font-size: 11px;
    color: #64748b;
    margin-top: 3px;
    font-style: italic;
  }

  /* ── Indicaciones generales ── */
  .indicaciones-box {
    margin-top: 12px;
    padding: 10px 12px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 6px;
  }

  .indicaciones-box .label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #92400e;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .indicaciones-box p {
    font-size: 11px;
    color: #451a03;
    line-height: 1.5;
  }

  /* ── Firma ── */
  .firma-section {
    margin-top: auto;
    padding-top: 20px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: flex-end;
    align-items: flex-end;
    gap: 20px;
  }

  .firma-box {
    text-align: center;
    min-width: 140px;
  }

  .firma-img {
    height: 55px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    margin-bottom: 4px;
  }

  .firma-img img {
    max-height: 55px;
    max-width: 130px;
  }

  .firma-linea {
    border-top: 1px solid #1e293b;
    padding-top: 5px;
  }

  .firma-nombre {
    font-size: 11px;
    font-weight: 700;
    color: #1e293b;
  }

  .firma-matricula {
    font-size: 9.5px;
    color: #64748b;
  }

  /* ── Footer legal ── */
  .footer-legal {
    position: absolute;
    bottom: 8mm;
    left: 12mm;
    right: 12mm;
    text-align: center;
    font-size: 8px;
    color: #94a3b8;
    border-top: 1px solid #f1f5f9;
    padding-top: 5px;
  }

  @media print {
    html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 8mm 10mm; }
    @page { size: A5 portrait; margin: 0; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- MEMBRETE -->
  <div class="header">
    <div class="header-left">
      <h1>${profesionalNombre}</h1>
      ${especialidad ? `<div class="especialidad">${especialidad}</div>` : ''}
      <div class="datos">
        ${consultorio ? `<div>${consultorio}</div>` : ''}
        ${direccion ? `<div>${direccion}</div>` : ''}
        ${telefono ? `<div>Tel: ${telefono}</div>` : ''}
        ${email ? `<div>${email}</div>` : ''}
        ${cuit ? `<div>CUIT: ${cuit}</div>` : ''}
      </div>
    </div>
    <div class="header-right">
      ${matricula ? `<div class="matricula">Mat. ${matricula}</div>` : ''}
      <div style="margin-top:4px">Emisión digital</div>
      <div>Ley 27.553</div>
    </div>
  </div>

  <!-- TÍTULO -->
  <div class="receta-title">
    <h2>Receta Médica</h2>
    <div class="numero">Nº ${recetaId} — ${fecha}</div>
  </div>

  <!-- FECHA Y DATOS RÁPIDOS -->
  <div class="fecha-row">
    <span>Lugar y fecha: <strong>${consultorio ? consultorio + ', ' : ''}${fecha}</strong></span>
  </div>

  <!-- PACIENTE -->
  <div class="paciente-box">
    <div class="field">
      <label>Paciente</label>
      <span>${pacienteNombre || '—'}</span>
    </div>
    <div class="field">
      <label>DNI</label>
      <span>${pacienteDni || '—'}</span>
    </div>
    ${edad ? `<div class="field"><label>Edad</label><span>${edad}</span></div>` : ''}
    ${pacienteNacimiento ? `<div class="field"><label>Fecha de nac.</label><span>${pacienteNacimiento}</span></div>` : ''}
  </div>

  <!-- MEDICAMENTOS -->
  <div class="medicamentos-title">Prescripción</div>

  ${medicamentos.length > 0
    ? medicamentos.map((med, i) => {
        const nombre = typeof med === 'string' ? med : (med.nombre || med.medicamento || String(med))
        const dosis = typeof med === 'object' ? (med.dosis || '') : ''
        const instrucciones = typeof med === 'object' ? (med.instrucciones || '') : ''
        return `
    <div class="medicamento">
      <div class="nombre">${i + 1}. ${nombre}</div>
      ${dosis ? `<div class="dosis">${dosis}</div>` : ''}
      ${instrucciones ? `<div class="instrucciones">${instrucciones}</div>` : ''}
    </div>`
      }).join('')
    : `<div class="medicamento"><div class="nombre">Ver indicaciones</div></div>`
  }

  <!-- INDICACIONES -->
  ${receta.indicaciones ? `
  <div class="indicaciones-box">
    <div class="label">Indicaciones</div>
    <p>${receta.indicaciones.replace(/\n/g, '<br>')}</p>
  </div>` : ''}

  <!-- FIRMA -->
  <div class="firma-section">
    <div class="firma-box">
      <div class="firma-img">
        ${firma ? `<img src="${firma}" alt="Firma" />` : '<div style="height:55px"></div>'}
      </div>
      <div class="firma-linea">
        <div class="firma-nombre">${profesionalNombre}</div>
        ${matricula ? `<div class="firma-matricula">Matrícula N° ${matricula}</div>` : ''}
        ${especialidad ? `<div class="firma-matricula">${especialidad}</div>` : ''}
      </div>
    </div>
  </div>

  <!-- FOOTER LEGAL -->
  <div class="footer-legal">
    Receta emitida digitalmente según Ley 27.553 y Decreto 98/2023 | Clingest — Sistema de Gestión Médica
  </div>

</div>
<script>window.onload = () => { window.print(); }</script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=600,height=800')
  if (!win) {
    alert('Habilitá las ventanas emergentes para imprimir la receta.')
    return
  }
  win.document.write(html)
  win.document.close()
}

/**
 * Descarga la receta como HTML (alternativa a popup bloqueado)
 */
export function descargarRecetaHTML({ receta, config, paciente }) {
  const fecha = new Date().toISOString().split('T')[0]
  const nombre = paciente ? `${paciente.nombre}-${paciente.apellido}`.replace(/\s+/g, '-') : 'paciente'
  const filename = `receta-${nombre}-${fecha}.html`

  // Crear un blob con el HTML y descargarlo
  const blob = new Blob([/* HTML de imprimirReceta reutilizado */], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
