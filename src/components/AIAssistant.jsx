import React, { useState } from 'react'
import { api } from '../lib/api'
import { usePlanFeatures } from '../hooks/usePlanFeatures'

// ── Shared AI button + result panel ─────────────────────────────────────────

export function AIButton({ onClick, loading, disabled, label = 'IA', small = false }) {
  return (
    <button
      className={`btn-ai ${small ? 'btn-ai-sm' : ''}`}
      onClick={onClick}
      disabled={loading || disabled}
      title={disabled ? 'Tu plan no incluye IA' : label}
    >
      {loading ? <span className="spinner-sm" /> : <span className="ai-icon">&#9733;</span>}
      {!small && <span>{loading ? 'Generando...' : label}</span>}
    </button>
  )
}

// ── Clinical Notes Generator ────────────────────────────────────────────────

export function AIClinicalNotes({ notasBreves, pacienteInfo, evolucionesPrevias, onResult }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { hasFeature } = usePlanFeatures()
  const allowed = hasFeature('ia_creditos')

  async function generate() {
    if (!notasBreves?.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await api.ai.generate('notas_clinicas', {
        notas_breves: notasBreves,
        paciente_info: pacienteInfo,
        evoluciones_previas: evolucionesPrevias,
      })
      onResult?.(res.texto)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ai-inline">
      <AIButton
        onClick={generate}
        loading={loading}
        disabled={!allowed || !notasBreves?.trim()}
        label="Mejorar con IA"
        small
      />
      {error && <span className="ai-error">{error}</span>}
    </div>
  )
}

// ── Treatment Suggestions ───────────────────────────────────────────────────

export function AITreatmentSuggestions({ odontograma, diagnostico, pacienteInfo, onResult }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const { hasFeature } = usePlanFeatures()
  const allowed = hasFeature('ia_creditos')

  async function generate() {
    setLoading(true)
    setError('')
    try {
      const odontogramaStr = odontograma
        ? odontograma
            .filter(d => d.estado !== 'sano')
            .map(d => `Pieza ${d.pieza}: ${d.estado}${d.notas ? ` (${d.notas})` : ''}`)
            .join('; ')
        : null

      const res = await api.ai.generate('sugerencia_tratamiento', {
        odontograma: odontogramaStr,
        diagnostico,
        paciente_info: pacienteInfo,
      })
      setResult(res.texto)
      onResult?.(res.texto)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ai-suggestion-panel">
      <AIButton
        onClick={generate}
        loading={loading}
        disabled={!allowed}
        label="Sugerir tratamiento"
      />
      {error && <div className="ai-error">{error}</div>}
      {result && (
        <div className="ai-result">
          <div className="ai-result-header">
            <span className="ai-icon">&#9733;</span> Sugerencia IA
          </div>
          <div className="ai-result-text">{result}</div>
        </div>
      )}
    </div>
  )
}

// ── WhatsApp Message Composer ────────────────────────────────────────────────

export function AIWhatsAppComposer({ pacienteNombre, tipoMensaje, detalles, onResult }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const { hasFeature } = usePlanFeatures()
  const allowed = hasFeature('ia_creditos')

  async function generate() {
    if (!tipoMensaje) return
    setLoading(true)
    setError('')
    try {
      const res = await api.ai.generate('whatsapp', {
        tipo_mensaje: tipoMensaje,
        paciente_nombre: pacienteNombre,
        detalles,
      })
      setResult(res.texto)
      onResult?.(res.texto)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ai-whatsapp-panel">
      <AIButton
        onClick={generate}
        loading={loading}
        disabled={!allowed || !tipoMensaje}
        label="Redactar con IA"
        small
      />
      {error && <div className="ai-error">{error}</div>}
      {result && (
        <div className="ai-result ai-result-compact">
          <div className="ai-result-text">{result}</div>
          <button
            className="btn btn-sm btn-outline"
            onClick={() => {
              navigator.clipboard.writeText(result)
            }}
          >
            Copiar
          </button>
        </div>
      )}
    </div>
  )
}

// ── Patient Summary ─────────────────────────────────────────────────────────

export function AIPatientSummary({ paciente, evoluciones, odontograma, anamnesis }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const { hasFeature } = usePlanFeatures()
  const allowed = hasFeature('ia_creditos')

  async function generate() {
    setLoading(true)
    setError('')
    try {
      const pacienteInfo = [
        paciente?.nombre && paciente?.apellido ? `${paciente.nombre} ${paciente.apellido}` : '',
        paciente?.fecha_nacimiento ? `Nac: ${paciente.fecha_nacimiento}` : '',
        paciente?.sexo ?? '',
        paciente?.alergias ? `Alergias: ${paciente.alergias}` : '',
        paciente?.medicacion_actual ? `Medicación: ${paciente.medicacion_actual}` : '',
        paciente?.obra_social ? `OS: ${paciente.obra_social}` : '',
      ].filter(Boolean).join(', ')

      const evolStr = evoluciones?.slice(0, 10)
        .map(e => `[${e.fecha?.slice(0, 10) ?? ''}] ${e.tipo ?? ''}: ${e.descripcion?.slice(0, 100) ?? ''}`)
        .join('\n')

      const odontoStr = odontograma
        ?.filter(d => d.estado !== 'sano')
        .map(d => `Pieza ${d.pieza}: ${d.estado}`)
        .join('; ')

      const res = await api.ai.generate('resumen_paciente', {
        paciente_info: pacienteInfo,
        evoluciones: evolStr,
        odontograma: odontoStr,
        anamnesis: anamnesis ? JSON.stringify(anamnesis).slice(0, 500) : null,
      })
      setResult(res.texto)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ai-summary-panel">
      <AIButton
        onClick={generate}
        loading={loading}
        disabled={!allowed}
        label="Resumen IA del paciente"
      />
      {error && <div className="ai-error">{error}</div>}
      {result && (
        <div className="ai-result">
          <div className="ai-result-header">
            <span className="ai-icon">&#9733;</span> Resumen clínico
          </div>
          <div className="ai-result-text">{result}</div>
        </div>
      )}
    </div>
  )
}

// ── Credit Usage Badge ──────────────────────────────────────────────────────

export function AICreditBadge() {
  const [usage, setUsage] = useState(null)
  const { hasFeature } = usePlanFeatures()

  React.useEffect(() => {
    if (hasFeature('ia_creditos')) {
      api.ai.usage().then(setUsage).catch(() => {})
    }
  }, [])

  if (!usage) return null

  const { creditos_usados, creditos_limite, creditos_restantes } = usage
  const isUnlimited = creditos_limite === 'ilimitado'

  return (
    <div className="ai-credit-badge" title="Créditos IA usados este mes">
      <span className="ai-icon">&#9733;</span>
      <span>
        {isUnlimited
          ? `${creditos_usados} usados`
          : `${creditos_restantes}/${creditos_limite}`
        }
      </span>
    </div>
  )
}
