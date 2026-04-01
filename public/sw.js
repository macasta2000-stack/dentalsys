// Clingest Service Worker v4
// Estrategia: Network-first para HTML, Cache-first para assets estáticos
// IMPORTANTE: GET-only. POSTs y llamadas a /api/ nunca se interceptan.

const CACHE_NAME = 'clingest-v4'
const STATIC_ASSETS = ['/manifest.json']

// Assets que queremos cachear (Vite genera hashes únicos)
const CACHEABLE_TYPES = ['script', 'style', 'font', 'image']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)).catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const { request } = e
  const url = new URL(request.url)

  // No interceptar: API calls, otros dominios, no-GET
  // For non-GET: explicitly pass through to network (do NOT call respondWith)
  if (request.method !== 'GET') return
  if (!url.origin.includes(self.location.origin) && !url.hostname.includes('fonts.g')) return
  // API calls always go to network — never cache API responses
  if (url.pathname.startsWith('/api/')) return
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    // Cache-first para fonts
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(res => {
          const clone = res.clone()
          caches.open(CACHE_NAME).then(c => c.put(request, clone))
          return res
        })
      })
    )
    return
  }

  // HTML: Network-first (siempre el más fresco), fallback a caché
  if (request.headers.get('accept')?.includes('text/html') || url.pathname === '/') {
    e.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone()
          caches.open(CACHE_NAME).then(c => c.put(request, clone))
          return res
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('/')))
    )
    return
  }

  // Assets JS/CSS (tienen hash en nombre): Cache-first
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE_NAME).then(c => c.put(request, clone))
          }
          return res
        })
      })
    )
    return
  }

  // Todo lo demás: Stale-while-revalidate
  e.respondWith(
    caches.match(request).then(cached => {
      const fresh = fetch(request).then(res => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone()
          caches.open(CACHE_NAME).then(c => c.put(request, clone))
        }
        return res
      }).catch(() => cached)
      return cached || fresh
    })
  )
})

// Escuchar mensajes del cliente (ej: forzar actualización)
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
