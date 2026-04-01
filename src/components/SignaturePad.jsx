// ============================================================
// SignaturePad — Componente de firma digital con canvas
// Permite dibujar firma con mouse o touch, exporta a base64
// ============================================================
import { useRef, useEffect, useState, useCallback } from 'react'

export default function SignaturePad({ value, onChange, height = 140, disabled = false }) {
  const canvasRef = useRef(null)
  const [drawing, setDrawing] = useState(false)
  const [isEmpty, setIsEmpty] = useState(!value)
  const lastPos = useRef(null)

  // Cargar firma guardada cuando cambia value
  useEffect(() => {
    if (!value) {
      clearCanvas()
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      setIsEmpty(false)
    }
    img.src = value
  }, [value])

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
    onChange?.('')
  }

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  function startDraw(e) {
    if (disabled) return
    e.preventDefault()
    const canvas = canvasRef.current
    setDrawing(true)
    lastPos.current = getPos(e, canvas)
  }

  function draw(e) {
    if (!drawing || disabled) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)

    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()

    lastPos.current = pos
    setIsEmpty(false)
  }

  function stopDraw(e) {
    if (!drawing) return
    e.preventDefault()
    setDrawing(false)
    lastPos.current = null

    // Exportar como base64 y notificar al padre
    const canvas = canvasRef.current
    const dataURL = canvas.toDataURL('image/png')
    onChange?.(dataURL)
  }

  return (
    <div>
      <div style={{
        border: disabled ? '1px solid var(--c-border)' : '2px dashed var(--c-primary)',
        borderRadius: 'var(--radius-sm)',
        background: disabled ? 'var(--c-surface-2)' : '#fff',
        cursor: disabled ? 'default' : 'crosshair',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <canvas
          ref={canvasRef}
          width={600}
          height={height}
          style={{ width: '100%', height: height, display: 'block', touchAction: 'none' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
        {isEmpty && !disabled && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--c-text-3)', fontSize: '.85rem', pointerEvents: 'none',
          }}>
            ✍️ Dibujá tu firma aquí
          </div>
        )}
      </div>
      {!disabled && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={clearCanvas}
            disabled={isEmpty}
          >
            🗑️ Borrar firma
          </button>
          {!isEmpty && (
            <span style={{ fontSize: '.78rem', color: 'var(--c-success)', alignSelf: 'center' }}>
              ✅ Firma guardada
            </span>
          )}
        </div>
      )}
    </div>
  )
}
