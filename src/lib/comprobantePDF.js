// ============================================================
// comprobantePDF.js — Generador de recibos/comprobantes de pago
// Usa el sistema de impresión nativo del browser (sin deps extra)
// ============================================================

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0)

/**
 * Imprime/genera PDF de un comprobante de pago.
 * @param {Object} opts.comprobante - { numero, tipo, fecha, items, subtotal, descuento, total, notas }
 * @param {Object} opts.consultorio - Datos de configuracion del tenant
 * @param {Object} opts.paciente    - Datos del paciente
 */
export function imprimirComprobante({ comprobante, consultorio, paciente }) {
  const numero = String(comprobante.numero ?? '').padStart(8, '0')
  const fecha = comprobante.fecha
    ? new Date(comprobante.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : new Date().toLocaleDateString('es-AR')
  const tipoLabel = comprobante.tipo === 'recibo' ? 'RECIBO DE PAGO' : 'COMPROBANTE'

  const pacienteNombre = paciente
    ? `${paciente.nombre || ''} ${paciente.apellido || ''}`.trim()
    : (comprobante.paciente_nombre || '—')
  const pacienteDni = paciente?.dni || '—'

  const profesionalNombre = consultorio?.nombre_profesional || consultorio?.nombre_consultorio || ''
  const matricula = consultorio?.matricula || ''
  const cuit = consultorio?.cuit || ''
  const items = Array.isArray(comprobante.items) ? comprobante.items : []

  const itemsHtml = items.length
    ? items.map(item => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${item.descripcion || '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center">${item.cantidad ?? 1}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right">${fmt(item.precio_unitario)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">${fmt(item.subtotal)}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" style="padding:12px;text-align:center;color:#94a3b8">Sin ítems detallados</td></tr>`

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${tipoLabel} Nº ${numero}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background:#fff; color:#1a1a2e; font-size:13px; line-height:1.5; }
  .page { width:190mm; min-height:130mm; margin:0 auto; padding:12mm 14mm; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #0369a1; padding-bottom:12px; margin-bottom:16px; }
  .header-left h1 { font-size:18px; font-weight:800; color:#0c4a6e; }
  .header-left .datos { font-size:11px; color:#64748b; margin-top:4px; line-height:1.7; }
  .header-right { text-align:right; }
  .tipo-label { font-size:16px; font-weight:800; color:#0369a1; letter-spacing:1px; text-transform:uppercase; }
  .numero { font-size:12px; color:#64748b; margin-top:4px; }
  .fecha { font-size:11px; color:#94a3b8; margin-top:2px; }
  .paciente-box { background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:12px 16px; margin-bottom:16px; display:flex; gap:32px; }
  .paciente-box .field label { font-size:9px; text-transform:uppercase; letter-spacing:0.5px; color:#0369a1; font-weight:700; display:block; }
  .paciente-box .field span { font-size:13px; font-weight:600; color:#1e293b; }
  table { width:100%; border-collapse:collapse; margin-bottom:16px; }
  thead th { background:#f8fafc; padding:8px 12px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:#64748b; border-bottom:2px solid #e2e8f0; }
  thead th:last-child, thead th:nth-child(3), thead th:nth-child(2) { text-align:right; }
  thead th:nth-child(2) { text-align:center; }
  .totales { width:280px; margin-left:auto; }
  .totales td { padding:5px 12px; font-size:13px; }
  .totales .total-row td { font-size:15px; font-weight:800; color:#0c4a6e; border-top:2px solid #0369a1; padding-top:8px; }
  .notas { background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:10px 14px; margin-top:12px; font-size:12px; color:#451a03; }
  .footer { margin-top:20px; padding-top:10px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:flex-end; }
  .footer .firma { text-align:center; }
  .firma-linea { border-top:1px solid #1e293b; padding-top:5px; margin-top:40px; min-width:160px; }
  .firma-nombre { font-size:11px; font-weight:700; }
  .firma-sub { font-size:10px; color:#64748b; }
  .legal { font-size:9px; color:#94a3b8; }
  @media print {
    html, body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    @page { size:A4 landscape; margin:0; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="header-left">
      <h1>${profesionalNombre || 'Consultorio'}</h1>
      <div class="datos">
        ${consultorio?.nombre_consultorio ? `<div>${consultorio.nombre_consultorio}</div>` : ''}
        ${consultorio?.direccion ? `<div>${consultorio.direccion}</div>` : ''}
        ${consultorio?.telefono ? `<div>Tel: ${consultorio.telefono}</div>` : ''}
        ${cuit ? `<div>CUIT: ${cuit}</div>` : ''}
        ${matricula ? `<div>Matrícula: ${matricula}</div>` : ''}
      </div>
    </div>
    <div class="header-right">
      <div class="tipo-label">${tipoLabel}</div>
      <div class="numero">Nº ${numero}</div>
      <div class="fecha">${fecha}</div>
    </div>
  </div>

  <div class="paciente-box">
    <div class="field">
      <label>Paciente</label>
      <span>${pacienteNombre}</span>
    </div>
    <div class="field">
      <label>DNI</label>
      <span>${pacienteDni}</span>
    </div>
    ${paciente?.email ? `<div class="field"><label>Email</label><span>${paciente.email}</span></div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:50%">Descripción</th>
        <th style="width:10%">Cant.</th>
        <th style="width:20%">Precio unit.</th>
        <th style="width:20%">Subtotal</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <table class="totales">
    <tbody>
      ${comprobante.subtotal !== comprobante.total ? `
      <tr><td style="color:#64748b">Subtotal</td><td style="text-align:right">${fmt(comprobante.subtotal)}</td></tr>
      <tr><td style="color:#16a34a">Descuento</td><td style="text-align:right;color:#16a34a">− ${fmt(comprobante.descuento)}</td></tr>` : ''}
      <tr class="total-row">
        <td>TOTAL</td>
        <td style="text-align:right">${fmt(comprobante.total)}</td>
      </tr>
    </tbody>
  </table>

  ${comprobante.notas ? `<div class="notas"><strong>Notas:</strong> ${comprobante.notas}</div>` : ''}

  <div class="footer">
    <div class="legal">
      Comprobante interno — No válido como factura fiscal<br>
      Generado por Clingest · clingest.app
    </div>
    <div class="firma">
      <div class="firma-linea">
        <div class="firma-nombre">${profesionalNombre}</div>
        ${matricula ? `<div class="firma-sub">Mat. ${matricula}</div>` : ''}
      </div>
    </div>
  </div>

</div>
<script>window.onload = () => { window.print(); }</script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=650')
  if (!win) {
    alert('Habilitá las ventanas emergentes para imprimir el comprobante.')
    return
  }
  win.document.write(html)
  win.document.close()
}
