import { useState } from 'react'

// FDI notation: piezas adulto
const SUPERIOR = {
  right: [18, 17, 16, 15, 14, 13, 12, 11],
  left:  [21, 22, 23, 24, 25, 26, 27, 28],
}
const INFERIOR = {
  right: [48, 47, 46, 45, 44, 43, 42, 41],
  left:  [31, 32, 33, 34, 35, 36, 37, 38],
}

const ESTADOS = [
  { id: 'sano',                label: 'Sano',                 color: '#22C55E', bg: '#FFF' },
  { id: 'caries',              label: 'Caries',               color: '#EF4444', bg: '#FCA5A5' },
  { id: 'obturado',            label: 'Obturado',             color: '#3B82F6', bg: '#BFDBFE' },
  { id: 'corona',              label: 'Corona',               color: '#F59E0B', bg: '#FDE68A' },
  { id: 'endodoncia',          label: 'Endodoncia',           color: '#8B5CF6', bg: '#DDD6FE' },
  { id: 'extraccion_indicada', label: 'Extracción indicada',  color: '#F97316', bg: '#FED7AA' },
  { id: 'extraido',            label: 'Extraído',             color: '#9CA3AF', bg: '#F3F4F6' },
  { id: 'implante',            label: 'Implante',             color: '#06B6D4', bg: '#CFFAFE' },
  { id: 'fractura',            label: 'Fractura',             color: '#DC2626', bg: '#FEE2E2' },
  { id: 'ausente_congenito',   label: 'Aus. congénito',       color: '#6B7280', bg: '#E5E7EB' },
  { id: 'a_tratar',            label: 'A tratar',             color: '#CA8A04', bg: '#FEF9C3' },
  { id: 'protesis_fija',       label: 'Prótesis fija',        color: '#D97706', bg: '#FEF3C7' },
  { id: 'protesis_removible',  label: 'Prótesis removible',   color: '#B45309', bg: '#FFFBEB' },
]

const estadoMap = Object.fromEntries(ESTADOS.map(e => [e.id, e]))

// SVG diente superior (corona + 1 raíz)
function ToothSVGSup({ estado }) {
  const cfg = estadoMap[estado] ?? estadoMap.sano
  return (
    <svg viewBox="0 0 32 40" className="pieza-svg" aria-hidden>
      <rect x="4" y="2" width="24" height="20" rx="6" ry="6"
        fill={cfg.bg} stroke={cfg.color} strokeWidth="1.8" />
      <rect x="13" y="22" width="6" height="14" rx="3"
        fill={cfg.bg} stroke={cfg.color} strokeWidth="1.4" />
    </svg>
  )
}

// SVG diente inferior (corona + 2 raíces)
function ToothSVGInf({ estado }) {
  const cfg = estadoMap[estado] ?? estadoMap.sano
  return (
    <svg viewBox="0 0 32 40" className="pieza-svg" aria-hidden>
      <rect x="4" y="18" width="24" height="20" rx="6" ry="6"
        fill={cfg.bg} stroke={cfg.color} strokeWidth="1.8" />
      <rect x="7" y="4" width="6" height="14" rx="3"
        fill={cfg.bg} stroke={cfg.color} strokeWidth="1.4" />
      <rect x="19" y="4" width="6" height="14" rx="3"
        fill={cfg.bg} stroke={cfg.color} strokeWidth="1.4" />
    </svg>
  )
}

function PiezaBtn({ numero, estado, onClick, tipo }) {
  const cfg = estadoMap[estado] ?? estadoMap.sano
  return (
    <button
      className={`pieza-btn ${estado}`}
      onClick={() => onClick(numero)}
      title={`Pieza ${numero} — ${cfg.label}`}
    >
      {tipo === 'sup'
        ? <ToothSVGSup estado={estado} />
        : <ToothSVGInf estado={estado} />
      }
      <span className="pieza-num">{numero}</span>
    </button>
  )
}

export default function Odontograma({ piezas = {}, onPiezaClick, readOnly = false }) {
  const getEstado = (num) => piezas[num]?.estado ?? 'sano'

  const handleClick = (num) => {
    if (!readOnly && onPiezaClick) onPiezaClick(num)
  }

  return (
    <div className="odontograma-wrapper">
      {/* Fila superior derecha → izquierda */}
      <div style={{ textAlign: 'center', fontSize: '.7rem', color: 'var(--c-text-3)', marginBottom: 4, fontWeight: 600 }}>
        ← SUPERIOR →
      </div>
      <div className="odontograma-row">
        {SUPERIOR.right.map(n => (
          <PiezaBtn key={n} numero={n} estado={getEstado(n)} onClick={handleClick} tipo="sup" />
        ))}
        <div style={{ width: 12, borderRight: '2px dashed var(--c-border)' }} />
        {SUPERIOR.left.map(n => (
          <PiezaBtn key={n} numero={n} estado={getEstado(n)} onClick={handleClick} tipo="sup" />
        ))}
      </div>

      <div className="odontograma-divider" />

      {/* Fila inferior */}
      <div className="odontograma-row">
        {INFERIOR.right.map(n => (
          <PiezaBtn key={n} numero={n} estado={getEstado(n)} onClick={handleClick} tipo="inf" />
        ))}
        <div style={{ width: 12, borderRight: '2px dashed var(--c-border)' }} />
        {INFERIOR.left.map(n => (
          <PiezaBtn key={n} numero={n} estado={getEstado(n)} onClick={handleClick} tipo="inf" />
        ))}
      </div>
      <div style={{ textAlign: 'center', fontSize: '.7rem', color: 'var(--c-text-3)', marginTop: 4, fontWeight: 600 }}>
        ← INFERIOR →
      </div>

      {/* Leyenda */}
      <div className="leyenda-odontograma" style={{ marginTop: 14 }}>
        {ESTADOS.map(e => (
          <span key={e.id} className="leyenda-item">
            <span className="leyenda-dot" style={{ background: e.bg, border: `1.5px solid ${e.color}` }} />
            {e.label}
          </span>
        ))}
      </div>
    </div>
  )
}
