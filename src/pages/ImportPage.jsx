import { useState, useRef } from 'react'
import { api } from '../lib/api'
import { usePlanFeatures } from '../hooks/usePlanFeatures'
import UpgradePrompt from '../components/UpgradePrompt'

// CSV templates
const TEMPLATES = {
  pacientes: {
    headers: ['nombre','apellido','dni','fecha_nacimiento','sexo','telefono','email','obra_social','numero_afiliado','plan_obra_social','direccion','ciudad','alergias','medicacion_actual','antecedentes_medicos','notas'],
    ejemplo: [
      ['Juan','García','38123456','1990-05-15','masculino','1154321234','juan@mail.com','OSDE','123456','Plan 310','Av. Corrientes 1234','Buenos Aires','Penicilina','Metformina 500mg','Diabetes','Paciente frecuente'],
      ['María','López','','1985-11-20','femenino','1165432109','','Swiss Medical','','','','Buenos Aires','','','',''],
    ],
    descripcion: 'Importar pacientes desde planilla. Se ignoran duplicados por DNI.',
  },
  turnos: {
    headers: ['fecha_hora','duracion_minutos','motivo','estado','notas','dni','apellido','nombre'],
    ejemplo: [
      ['2026-04-01T10:00:00','60','Consulta general','programado','','38123456','',''],
      ['2026-04-02T14:30:00','30','Extracción','programado','','','García','Juan'],
    ],
    descripcion: 'Importar turnos. El paciente se busca primero por DNI, luego por apellido+nombre.',
  },
  pagos: {
    headers: ['monto','metodo_pago','concepto','fecha','dni','apellido','nombre'],
    ejemplo: [
      ['15000','efectivo','Consulta general','2026-03-15','38123456','',''],
      ['8000','transferencia','Extracción','2026-03-16','','García','Juan'],
    ],
    descripcion: 'Importar pagos históricos. métodos: efectivo, transferencia, tarjeta_debito, tarjeta_credito, obra_social, cheque, otro',
  },
}

function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }
  const sep = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase().replace(/ /g,'_'))
  const rows = lines.slice(1).map(line => {
    const vals = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ''))
    const obj = {}
    headers.forEach((h, i) => { obj[h] = vals[i] ?? '' })
    return obj
  })
  return { headers, rows }
}

function downloadCSV(tipo) {
  const tpl = TEMPLATES[tipo]
  const lines = [
    tpl.headers.join(','),
    ...tpl.ejemplo.map(row => row.map(v => `"${v}"`).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `template_${tipo}.csv`; a.click()
  URL.revokeObjectURL(url)
}

function exportarPacientes(pacientes) {
  const headers = ['nombre','apellido','dni','fecha_nacimiento','sexo','telefono','email','obra_social','direccion','ciudad','saldo']
  const lines = [headers.join(','), ...pacientes.map(p =>
    headers.map(h => `"${(p[h] ?? '').toString().replace(/"/g,'""')}"`).join(',')
  )]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `pacientes_${new Date().toISOString().split('T')[0]}.csv`; a.click()
  URL.revokeObjectURL(url)
}

function ImportPageInner() {
  const [tipo, setTipo] = useState('pacientes')
  const [preview, setPreview] = useState(null) // { headers, rows }
  const [resultado, setResultado] = useState(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [exportando, setExportando] = useState(false)
  const fileRef = useRef()

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setResultado(null); setError('')
    if (file.size > 5 * 1024 * 1024) { setError('El archivo supera el límite de 5 MB.'); return }
    const reader = new FileReader()
    reader.onload = ev => {
      const { headers, rows } = parseCSV(ev.target.result)
      if (!rows.length) { setError('El archivo está vacío o no tiene datos.'); return }
      setPreview({ headers, rows: rows.slice(0, 5), total: rows.length, allRows: rows })
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function handleImport() {
    if (!preview) return
    setImporting(true); setError(''); setResultado(null)
    try {
      let res
      if (tipo === 'pacientes') res = await api.importar.pacientes(preview.allRows)
      else if (tipo === 'turnos') res = await api.importar.turnos(preview.allRows)
      else if (tipo === 'pagos') res = await api.importar.pagos(preview.allRows)
      setResultado(res)
      setPreview(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      setError('No se pudo completar la importación: ' + e.message)
    } finally { setImporting(false) }
  }

  async function handleExport() {
    setExportando(true)
    try {
      const pacs = await api.pacientes.list('', 'activo')
      exportarPacientes(pacs)
    } catch (e) { setError('Error al exportar: ' + e.message) }
    finally { setExportando(false) }
  }

  const tpl = TEMPLATES[tipo]

  return (
    <div>
      <div className="page-actions" style={{ marginBottom: 20 }}>
        <div>
          <div className="page-title">Importar / Exportar datos</div>
          <div className="text-sm text-muted">Migrá tu base de datos desde otro sistema o exportá tus datos.</div>
        </div>
      </div>

      {/* Export */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Exportar datos</span>
        </div>
        <div className="card-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Pacientes (CSV)</div>
            <div className="text-sm text-muted" style={{ marginBottom: 10 }}>Exporta todos tus pacientes activos con datos completos.</div>
            <button className="btn btn-secondary" onClick={handleExport} disabled={exportando}>
              {exportando ? 'Exportando...' : 'Descargar pacientes.csv'}
            </button>
          </div>
          <div style={{ flex: 1, minWidth: 200, padding: '0 20px', borderLeft: '1px solid var(--c-border)' }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Templates de importación</div>
            <div className="text-sm text-muted" style={{ marginBottom: 10 }}>Descargá la planilla modelo para completar e importar.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.keys(TEMPLATES).map(t => (
                <button key={t} className="btn btn-ghost btn-sm" onClick={() => downloadCSV(t)}>
                  📥 Template {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Import */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Importar desde CSV / Excel</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Tipo selector */}
          <div className="form-group">
            <label className="form-label">¿Qué querés importar?</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {Object.keys(TEMPLATES).map(t => (
                <button key={t} className={`btn ${tipo === t ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => { setTipo(t); setPreview(null); setResultado(null); setError('') }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Info del tipo */}
          <div style={{ background: 'var(--c-surface-2)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', fontSize: '.85rem' }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Columnas requeridas para {tipo}:</div>
            <div style={{ color: 'var(--c-text-2)', fontFamily: 'monospace', fontSize: '.8rem' }}>
              {tpl.headers.join(' | ')}
            </div>
            <div style={{ marginTop: 8, color: 'var(--c-text-3)' }}>{tpl.descripcion}</div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => downloadCSV(tipo)}>
              📥 Descargar template de ejemplo
            </button>
          </div>

          {/* File input */}
          <div className="form-group">
            <label className="form-label">Seleccionar archivo CSV</label>
            <input ref={fileRef} type="file" accept=".csv,.txt" className="form-input" onChange={handleFile} />
            <div className="text-xs text-muted" style={{ marginTop: 4 }}>
              Separador: coma (,) o punto y coma (;). Codificación UTF-8. Primera fila = encabezados.
            </div>
          </div>

          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 'var(--radius-sm)', padding: '10px 14px', color: '#B91C1C', fontSize: '.85rem' }}>
              {error}
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontWeight: 600 }}>Vista previa — {preview.total} registros encontrados</div>
                <div style={{ fontSize: '.8rem', color: 'var(--c-text-3)' }}>Mostrando primeros 5</div>
              </div>
              <div className="table-wrapper" style={{ marginBottom: 16 }}>
                <table className="table">
                  <thead>
                    <tr>{preview.headers.map(h => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, i) => (
                      <tr key={i}>
                        {preview.headers.map(h => <td key={h} className="text-sm">{row[h] || '—'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = '' }}>
                  Cancelar
                </button>
                <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
                  {importing ? `Importando ${preview.total} registros...` : `Confirmar importación (${preview.total} registros)`}
                </button>
              </div>
            </div>
          )}

          {/* Resultado */}
          {resultado && (
            <div style={{ background: resultado.errores?.length ? '#FFFBEB' : '#F0FDF4', border: `1px solid ${resultado.errores?.length ? '#F59E0B' : '#86EFAC'}`, borderRadius: 'var(--radius-sm)', padding: '16px 20px' }}>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: resultado.errores?.length ? '#92400E' : '#15803D', marginBottom: 8 }}>
                {resultado.errores?.length ? '⚠️ Importación con errores parciales' : '✅ Importación completada'}
              </div>
              <div className="text-sm" style={{ marginBottom: 8 }}>
                <strong>{resultado.insertados}</strong> registros importados correctamente.
                {resultado.errores?.length > 0 && <span> <strong>{resultado.errores.length}</strong> con errores.</span>}
              </div>
              {resultado.errores?.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: '.85rem', marginBottom: 6 }}>Errores:</div>
                  {resultado.errores.map((e, i) => (
                    <div key={i} className="text-sm" style={{ color: '#92400E' }}>Fila {e.fila}: {e.error}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Instrucciones */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><span className="card-title">¿Cómo migrar desde otro sistema?</span></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {[
              { num: '1', title: 'Exportá tu sistema actual', desc: 'Desde tu sistema de gestión actual: exportá pacientes como CSV o Excel.' },
              { num: '2', title: 'Adaptá el formato', desc: 'Usá el template de ejemplo para ver las columnas requeridas. Podés agregar columnas extra.' },
              { num: '3', title: 'Importá en orden', desc: 'Primero pacientes → luego turnos → luego pagos. Los turnos y pagos se vinculan por DNI.' },
              { num: '4', title: 'Verificá los datos', desc: 'Revisá que los registros importados sean correctos. Los errores se muestran fila por fila.' },
            ].map(step => (
              <div key={step.num} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 32, height: 32, borderRadius: '50%', background: 'var(--c-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '.9rem' }}>{step.num}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '.88rem', marginBottom: 2 }}>{step.title}</div>
                  <div style={{ fontSize: '.8rem', color: 'var(--c-text-3)' }}>{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--c-surface-2)', borderRadius: 'var(--radius-sm)', fontSize: '.82rem', color: 'var(--c-text-2)' }}>
            <strong>Tip Excel:</strong> Al guardar como CSV desde Excel, usá "CSV UTF-8 (delimitado por comas)". Si tu Excel usa punto y coma como separador, también funciona.
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ImportPage() {
  const { hasFeature } = usePlanFeatures()
  if (!hasFeature('exportar')) return <UpgradePrompt feature="exportar" />
  return <ImportPageInner />
}
