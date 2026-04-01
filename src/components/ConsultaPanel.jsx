import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { imprimirReceta } from '../lib/recetaPDF'
import { format, parseISO, differenceInYears } from 'date-fns'
import { es } from 'date-fns/locale'

// ── Helpers ──────────────────────────────────────────────────────────────────

function calcEdad(fechaNac) {
  if (!fechaNac) return null
  try {
    return differenceInYears(new Date(), parseISO(fechaNac))
  } catch {
    return null
  }
}

function formatHora(fechaHoraStr) {
  try { return format(parseISO(fechaHoraStr), 'HH:mm') } catch { return '' }
}

function formatFechaCorta(fechaStr) {
  try { return format(parseISO(fechaStr), "d MMM yyyy", { locale: es }) } catch { return fechaStr }
}

const TIPO_OPTIONS = [
  { value: 'consulta',      label: 'Consulta' },
  { value: 'control',       label: 'Control' },
  { value: 'urgencia',      label: 'Urgencia' },
  { value: 'cirugia',       label: 'Cirugía' },
  { value: 'procedimiento', label: 'Procedimiento' },
]

const METODO_OPTIONS = [
  { value: 'efectivo',        label: 'Efectivo' },
  { value: 'transferencia',   label: 'Transferencia' },
  { value: 'tarjeta_debito',  label: 'Débito' },
  { value: 'tarjeta_credito', label: 'Crédito' },
  { value: 'obra_social',     label: 'Obra Social' },
]

const SPECIALTY_BADGE_STYLE = {
  background: 'var(--c-primary-light)',
  color: 'var(--c-primary-dark)',
  borderRadius: 'var(--radius-sm)',
  padding: '2px 8px',
  fontSize: '.72rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '.04em',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConsultaPanel({ turno, onClose, onUpdated }) {
  const navigate = useNavigate()
  const textareaRef = useRef(null)

  // Remote data
  const [paciente, setPaciente] = useState(null)
  const [evoluciones, setEvoluciones] = useState([])
  const [loadingData, setLoadingData] = useState(true)
  const [ultimaReceta, setUltimaReceta] = useState(null)
  const [configConsultorio, setConfigConsultorio] = useState(null)

  // UI toggles
  const [showEvoluciones, setShowEvoluciones] = useState(false)
  const [showCobro, setShowCobro] = useState(false)

  // Evolución form
  const [descripcion, setDescripcion] = useState('')
  const [diagnostico, setDiagnostico] = useState('')
  const [tipo, setTipo] = useState('consulta')

  // Cobro form
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('efectivo')
  const [concepto, setConcepto] = useState('Consulta')

  // Async state
  const [saving, setSaving] = useState(false)
  const [markingAtendido, setMarkingAtendido] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Load patient + last 3 evolutions + last receta + config on mount
  useEffect(() => {
    if (!turno?.paciente_id) return
    setLoadingData(true)
    Promise.all([
      api.pacientes.get(turno.paciente_id).catch(() => null),
      api.evoluciones.listByPaciente(turno.paciente_id, 3).catch(() => []),
      api.recetas?.listByPaciente?.(turno.paciente_id, 1).catch(() => []),
      api.config?.get?.().catch(() => null),
    ]).then(([pac, evols, recetas, cfg]) => {
      setPaciente(pac)
      setEvoluciones(Array.isArray(evols) ? evols : [])
      const lista = Array.isArray(recetas) ? recetas : []
      setUltimaReceta(lista[0] ?? null)
      setConfigConsultorio(cfg ?? null)
    }).finally(() => setLoadingData(false))
  }, [turno?.paciente_id])

  // Autofocus textarea when panel opens
  useEffect(() => {
    const timer = setTimeout(() => textareaRef.current?.focus(), 280)
    return () => clearTimeout(timer)
  }, [])

  // Close on Escape key
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleGuardar() {
    if (!descripcion.trim()) {
      setError('La descripción es obligatoria.')
      textareaRef.current?.focus()
      return
    }
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      // 1. Create evolution
      await api.evoluciones.create({
        paciente_id: turno.paciente_id,
        turno_id: turno.id,
        descripcion: descripcion.trim(),
        diagnostico: diagnostico.trim() || undefined,
        tipo,
      })

      // 2. Optional payment
      const montoNum = parseFloat(monto)
      if (!isNaN(montoNum) && montoNum > 0) {
        await api.pagos.create({
          paciente_id: turno.paciente_id,
          monto: montoNum,
          metodo_pago: metodo,
          concepto: concepto.trim() || 'Consulta',
          turno_id: turno.id,
        })
      }

      // 3. Mark turno as atendido
      await api.turnos.marcarAtendido(turno.id).catch(() => null)

      setSuccess('Consulta guardada correctamente.')
      onUpdated?.()
    } catch (err) {
      setError(err?.message ?? 'No se pudo guardar la consulta.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAtendido() {
    setMarkingAtendido(true)
    setError('')
    setSuccess('')
    try {
      await api.turnos.marcarAtendido(turno.id)
      setSuccess('Turno marcado como atendido.')
      onUpdated?.()
    } catch (err) {
      setError(err?.message ?? 'No se pudo actualizar el turno.')
    } finally {
      setMarkingAtendido(false)
    }
  }

  function handleReceta() {
    navigate(`/pacientes/${turno.paciente_id}?tab=recetas`)
    onClose()
  }

  function handleImprimirReceta() {
    if (!ultimaReceta) return
    imprimirReceta({
      receta: ultimaReceta,
      config: configConsultorio,
      paciente,
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const edad = calcEdad(paciente?.fecha_nacimiento)
  const hora  = formatHora(turno?.fecha_hora)

  return (
    <>
      {/* Overlay */}
      <div
        className="consulta-panel-overlay"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside className="consulta-panel open" role="complementary" aria-label="Panel de consulta">

        {/* ── 1. Header ───────────────────────────────────────────────── */}
        <div className="cp-header">
          <div className="cp-header-left">
            <div className="cp-patient-name">
              {turno?.paciente_nombre ?? 'Paciente'}
            </div>
            <div className="cp-header-meta">
              {hora && <span className="cp-hora">{hora} hs</span>}
              {turno?.motivo && (
                <span style={SPECIALTY_BADGE_STYLE}>{turno.motivo}</span>
              )}
            </div>
          </div>
          <button
            className="btn-close cp-close"
            onClick={onClose}
            title="Cerrar (Esc)"
            aria-label="Cerrar panel"
          >
            ✕
          </button>
        </div>

        {/* ── 2. Patient quick info ───────────────────────────────────── */}
        {loadingData ? (
          <div className="cp-loading"><span className="spinner" /></div>
        ) : (
          <div className="cp-patient-info">
            {edad !== null && (
              <div className="cp-info-row">
                <span className="cp-info-icon">👤</span>
                <span>{edad} años</span>
              </div>
            )}
            {paciente?.obra_social && (
              <div className="cp-info-row">
                <span className="cp-info-icon">🏥</span>
                <span>{paciente.obra_social}</span>
              </div>
            )}
            {(paciente?.telefono || turno?.paciente_telefono) && (
              <div className="cp-info-row">
                <span className="cp-info-icon">📱</span>
                <span>{paciente?.telefono ?? turno.paciente_telefono}</span>
              </div>
            )}
            {evoluciones.length > 0 && (
              <div className="cp-info-row">
                <span className="cp-info-icon">🗓</span>
                <span>Últ. visita: {formatFechaCorta(evoluciones[0].created_at ?? evoluciones[0].fecha)}</span>
              </div>
            )}
          </div>
        )}

        {/* ── 3. Previous evolutions (collapsible) ────────────────────── */}
        <div className="cp-section">
          <button
            className="cp-section-toggle"
            onClick={() => setShowEvoluciones(v => !v)}
            aria-expanded={showEvoluciones}
          >
            <span>Evoluciones anteriores</span>
            <span className="cp-toggle-count">
              {evoluciones.length > 0 ? `(${evoluciones.length})` : '(0)'}
            </span>
            <span className="cp-toggle-arrow">{showEvoluciones ? '▲' : '▼'}</span>
          </button>

          {showEvoluciones && (
            <div className="cp-evols-list">
              {evoluciones.length === 0 ? (
                <p className="cp-empty-note">Sin evoluciones previas.</p>
              ) : (
                evoluciones.map((ev, i) => (
                  <div key={ev.id ?? i} className="cp-evol-item">
                    <div className="cp-evol-date">
                      {formatFechaCorta(ev.created_at ?? ev.fecha)}
                      {ev.tipo && <span className="cp-evol-tipo"> · {ev.tipo}</span>}
                    </div>
                    <div className="cp-evol-text">
                      {ev.descripcion?.slice(0, 100) ?? ''}
                      {(ev.descripcion?.length ?? 0) > 100 ? '…' : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* ── 4. Nueva Evolución form ──────────────────────────────────── */}
        <div className="cp-section cp-main-form">
          <div className="cp-section-title">Nueva evolución</div>

          <div className="form-group">
            <textarea
              ref={textareaRef}
              className="form-input cp-textarea"
              rows={5}
              placeholder="Describí el motivo de consulta, examen y tratamiento..."
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              aria-label="Descripción de la evolución"
            />
          </div>

          <div className="form-group" style={{ marginTop: 10 }}>
            <input
              className="form-input"
              type="text"
              placeholder="Diagnóstico (opcional)"
              value={diagnostico}
              onChange={e => setDiagnostico(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginTop: 10 }}>
            <select
              className="form-input"
              value={tipo}
              onChange={e => setTipo(e.target.value)}
              aria-label="Tipo de consulta"
            >
              {TIPO_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── 5. Cobro rápido (collapsible) ───────────────────────────── */}
        <div className="cp-section">
          <button
            className="cp-section-toggle"
            onClick={() => setShowCobro(v => !v)}
            aria-expanded={showCobro}
          >
            <span>💰 Cobro rápido</span>
            <span className="cp-toggle-arrow">{showCobro ? '▲' : '▼'}</span>
          </button>

          {showCobro && (
            <div className="cp-cobro-form">
              <div className="form-row cols-2" style={{ gap: 8 }}>
                <div className="form-group">
                  <label className="form-label">Monto</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    placeholder="$0"
                    value={monto}
                    onChange={e => setMonto(e.target.value)}
                    aria-label="Monto del cobro"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Método</label>
                  <select
                    className="form-input"
                    value={metodo}
                    onChange={e => setMetodo(e.target.value)}
                    aria-label="Método de pago"
                  >
                    {METODO_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginTop: 8 }}>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Concepto"
                  value={concepto}
                  onChange={e => setConcepto(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Feedback messages ──────────────────────────────────────── */}
        {error && (
          <div className="alert alert-danger cp-alert" role="alert">{error}</div>
        )}
        {success && (
          <div className="alert alert-success cp-alert" role="status">{success}</div>
        )}

        {/* ── 6. Action buttons ───────────────────────────────────────── */}
        <div className="cp-actions">
          <button
            className="btn btn-primary"
            onClick={handleGuardar}
            disabled={saving}
            title="Guardar evolución y cobro"
          >
            {saving ? <><span className="spinner spinner-sm" /> Guardando…</> : '✓ Guardar'}
          </button>

          <button
            className="btn btn-ghost"
            onClick={handleAtendido}
            disabled={markingAtendido}
            title="Marcar turno como atendido sin guardar evolución"
          >
            {markingAtendido ? <span className="spinner spinner-sm" /> : 'Atendido'}
          </button>

          <button
            className="btn btn-ghost cp-receta-btn"
            onClick={handleReceta}
            title="Ir a recetas del paciente"
          >
            📋 Receta
          </button>

          {ultimaReceta && (
            <button
              className="btn btn-ghost"
              onClick={handleImprimirReceta}
              title="Imprimir última receta del paciente"
            >
              🖨️ Imprimir receta
            </button>
          )}
        </div>

      </aside>
    </>
  )
}
