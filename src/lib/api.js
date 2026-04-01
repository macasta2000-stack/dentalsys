// Public API client — offline-capable.
// All components import from here. Internally delegates to apiOffline.js
// which handles caching, optimistic writes, and sync queue.
//
// Turnos (agenda) are online-only to prevent double-booking.
// Everything else works offline with automatic background sync.

export { apiOffline as api } from './apiOffline.js'
export { ApiError } from './httpClient.js'
