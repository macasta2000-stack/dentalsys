// Botón de instalación PWA — aparece cuando el browser soporta "Agregar a pantalla de inicio"
import { useState, useEffect } from 'react'

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showBanner, setShowBanner] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    // Detectar si ya está instalada
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
      return
    }

    // Capturar el evento de instalación antes de que lo muestre el browser
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      const dismissed = sessionStorage.getItem('pwa-install-dismissed')
      if (!dismissed) setShowBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Detectar cuando se instala
    window.addEventListener('appinstalled', () => {
      setShowBanner(false)
      setInstalled(true)
    })

    // Detectar actualización disponible del SW
    const updateHandler = () => setUpdateAvailable(true)
    window.addEventListener('sw-update-available', updateHandler)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('sw-update-available', updateHandler)
    }
  }, [])

  async function handleInstall() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShowBanner(false)
      setInstalled(true)
    }
    setDeferredPrompt(null)
  }

  function handleDismiss() {
    setShowBanner(false)
    sessionStorage.setItem('pwa-install-dismissed', '1')
  }

  function handleUpdate() {
    navigator.serviceWorker.getRegistration().then(reg => {
      reg?.waiting?.postMessage({ type: 'SKIP_WAITING' })
      window.location.reload()
    })
  }

  if (updateAvailable) {
    return (
      <div style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        background: '#1e293b', border: '1px solid #3b82f6', borderRadius: 12,
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,.4)', zIndex: 9999,
        color: '#f1f5f9', fontSize: '.88rem', whiteSpace: 'nowrap',
      }}>
        <span>🔄</span>
        <span>Nueva versión disponible</span>
        <button
          onClick={handleUpdate}
          style={{
            background: '#3b82f6', color: '#fff', border: 'none',
            borderRadius: 6, padding: '6px 14px', cursor: 'pointer',
            fontWeight: 600, fontSize: '.85rem',
          }}
        >
          Actualizar
        </button>
        <button onClick={() => setUpdateAvailable(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
      </div>
    )
  }

  if (!showBanner) return null

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: '#1e293b', border: '1px solid #334155', borderRadius: 16,
      padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14,
      boxShadow: '0 8px 40px rgba(0,0,0,.5)', zIndex: 9999,
      maxWidth: 380, width: 'calc(100vw - 48px)',
    }}>
      <div style={{ fontSize: '2rem', flexShrink: 0 }}>🏥</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '.95rem' }}>Instalar Clingest</div>
        <div style={{ color: '#94a3b8', fontSize: '.8rem', marginTop: 2 }}>
          Accedé como app desde tu pantalla de inicio
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={handleInstall}
          style={{
            background: '#3b82f6', color: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
            fontWeight: 600, fontSize: '.85rem', whiteSpace: 'nowrap',
          }}
        >
          Instalar
        </button>
        <button
          onClick={handleDismiss}
          style={{
            background: '#334155', color: '#94a3b8', border: 'none',
            borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontSize: '.85rem',
          }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
