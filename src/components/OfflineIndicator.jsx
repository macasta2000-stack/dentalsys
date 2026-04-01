import { useState, useEffect, useRef } from 'react'
import { onSyncStatusChange, getSyncStatus } from '../lib/syncManager.js'

const BASE_STYLE = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  width: '100%',
  height: 36,
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  fontWeight: 500,
  transition: 'opacity 0.3s ease',
}

export default function OfflineIndicator() {
  const [status, setStatus] = useState({
    online: navigator.onLine,
    syncing: false,
    queueSize: 0,
    lastSync: null,
  })
  const [showSuccess, setShowSuccess] = useState(false)
  const successTimer = useRef(null)
  const prevSyncing = useRef(false)

  useEffect(() => {
    // Subscribe to sync manager updates
    const unsub = onSyncStatusChange((newStatus) => {
      setStatus(newStatus)

      // Detect transition from syncing → done with empty queue
      if (prevSyncing.current && !newStatus.syncing && newStatus.queueSize === 0) {
        setShowSuccess(true)
        if (successTimer.current) clearTimeout(successTimer.current)
        successTimer.current = setTimeout(() => setShowSuccess(false), 2000)
      }
      prevSyncing.current = newStatus.syncing
    })

    // Also react to native online/offline events for immediate feedback
    const handleOnline = () => setStatus(s => ({ ...s, online: true }))
    const handleOffline = () => setStatus(s => ({ ...s, online: false }))
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      unsub()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (successTimer.current) clearTimeout(successTimer.current)
    }
  }, [])

  // --- Decide what to render ---

  // 1. Success flash (2 s after sync completes)
  if (showSuccess) {
    return (
      <div style={{ ...BASE_STYLE, backgroundColor: '#16a34a', color: '#ffffff' }}>
        ✅ Todo guardado en la nube
      </div>
    )
  }

  // 2. Syncing (blue)
  if (status.syncing) {
    const n = status.queueSize
    const label = n > 0
      ? `🔄 Sincronizando ${n} cambio${n !== 1 ? 's' : ''}...`
      : '🔄 Sincronizando...'
    return (
      <div style={{ ...BASE_STYLE, backgroundColor: '#2563eb', color: '#ffffff' }}>
        <Spinner />
        {label}
      </div>
    )
  }

  // 3. Offline (yellow)
  if (!status.online) {
    const q = status.queueSize
    return (
      <div style={{ ...BASE_STYLE, backgroundColor: '#ca8a04', color: '#ffffff', flexDirection: 'column', height: 'auto', padding: '6px 16px', gap: 2 }}>
        <span>📴 Sin conexión — tus cambios se están guardando localmente y se sincronizarán cuando vuelva el WiFi</span>
        {q > 0 && (
          <span style={{ fontSize: 12, opacity: 0.9 }}>{q} cambio{q !== 1 ? 's' : ''} pendiente{q !== 1 ? 's' : ''} de sync</span>
        )}
      </div>
    )
  }

  // 4. Online, no pending — hidden
  return null
}

function Spinner() {
  return (
    <span style={{
      display: 'inline-block',
      width: 14,
      height: 14,
      border: '2px solid rgba(255,255,255,0.4)',
      borderTopColor: '#ffffff',
      borderRadius: '50%',
      marginRight: 8,
      animation: 'clingest-spin 0.7s linear infinite',
    }} />
  )
}

// Inject spin keyframes once
if (typeof document !== 'undefined') {
  const styleId = 'clingest-offline-spin'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = '@keyframes clingest-spin { to { transform: rotate(360deg); } }'
    document.head.appendChild(style)
  }
}
