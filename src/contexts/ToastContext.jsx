import { createContext, useContext, useState, useCallback, useRef } from 'react'

const ToastContext = createContext(null)

let _toastFn = null

// Allows calling toast() outside of React components (e.g., in API error handlers)
export function toast(message, type = 'success', duration = 3000) {
  if (_toastFn) _toastFn(message, type, duration)
}

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const addToast = useCallback((message, type = 'success', duration = 3000) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
  }, [])

  // Register global reference
  _toastFn = addToast

  const COLORS = {
    success: { bg: '#D1FAE5', border: '#10B981', color: '#065F46', icon: '✓' },
    error:   { bg: '#FEE2E2', border: '#EF4444', color: '#991B1B', icon: '✕' },
    info:    { bg: '#DBEAFE', border: '#3B82F6', color: '#1E40AF', icon: 'ℹ' },
    warning: { bg: '#FEF3C7', border: '#F59E0B', color: '#92400E', icon: '⚠' },
  }

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      {toasts.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 84, right: 24, zIndex: 9999,
          display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360,
        }}>
          {toasts.map(t => {
            const s = COLORS[t.type] || COLORS.success
            return (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 16px',
                background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 10,
                boxShadow: '0 4px 20px rgba(0,0,0,.12)',
                color: s.color, fontSize: '.88rem', fontWeight: 500,
                animation: 'slideInRight .2s ease',
              }}>
                <span style={{ fontWeight: 700, fontSize: '1rem' }}>{s.icon}</span>
                <span style={{ flex: 1 }}>{t.message}</span>
                <button
                  onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.color, padding: 0, fontSize: '.9rem', opacity: .7 }}
                >✕</button>
              </div>
            )
          })}
        </div>
      )}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(40px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </ToastContext.Provider>
  )
}
