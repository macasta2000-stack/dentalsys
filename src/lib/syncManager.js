// Sync engine: manages background sync between local IndexedDB and Cloudflare D1.
//
// Events emitted on window (CustomEvent):
//   'sync:start'       — sync cycle started
//   'sync:complete'    — sync cycle finished successfully
//   'sync:error'       — sync cycle encountered an error
//   'sync:queue-size'  — fired with { detail: { size } } whenever queue length changes

import {
  getPendingMutations,
  removeMutation,
  incrementMutationRetry,
  localPut,
  setLastSync,
} from './localDB.js'

const MAX_RETRIES = 5
const POLL_INTERVAL_MS = 30_000 // 30 seconds

// Internal state
let _api = null
let _syncing = false
let _online = navigator.onLine
let _lastSync = null
let _pollTimer = null
let _statusListeners = []

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialise the sync manager.  Call once on app mount.
 * @param {object} apiInstance — the `api` object from src/lib/api.js
 */
export function startSyncManager(apiInstance) {
  _api = apiInstance

  window.addEventListener('online', _handleOnline)
  window.addEventListener('offline', _handleOffline)

  // Try an immediate sync if already online
  if (_online) {
    _schedulePoll()
    triggerSync()
  }
}

export function triggerSync() {
  if (!_online || _syncing) return
  _runSyncCycle()
}

export function getSyncStatus() {
  return {
    online: _online,
    syncing: _syncing,
    lastSync: _lastSync,
    // queueSize is async; callers should subscribe via onSyncStatusChange
  }
}

/**
 * Subscribe to sync status changes.
 * Callback receives the same object as getSyncStatus() plus queueSize.
 */
export function onSyncStatusChange(callback) {
  _statusListeners.push(callback)
  return () => {
    _statusListeners = _statusListeners.filter(fn => fn !== callback)
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function _handleOnline() {
  _online = true
  _emit('sync:queue-size', {}) // re-render indicator
  _schedulePoll()
  triggerSync()
  _notifyListeners()
}

function _handleOffline() {
  _online = false
  _clearPoll()
  _notifyListeners()
}

function _schedulePoll() {
  _clearPoll()
  _pollTimer = setInterval(async () => {
    const pending = await getPendingMutations()
    if (pending.length > 0) {
      triggerSync()
    }
  }, POLL_INTERVAL_MS)
}

function _clearPoll() {
  if (_pollTimer) {
    clearInterval(_pollTimer)
    _pollTimer = null
  }
}

async function _runSyncCycle() {
  if (_syncing || !_api) return
  // Skip if no JWT (user not logged in)
  if (!localStorage.getItem('ds_token')) return

  _syncing = true
  _emit('sync:start', {})
  _notifyListeners()

  try {
    await processMutationQueue()
    _lastSync = new Date()
    _emit('sync:complete', {})
  } catch (err) {
    console.error('[SyncManager] Sync error:', err)
    _emit('sync:error', { error: err.message })
  } finally {
    _syncing = false
    _notifyListeners()
  }
}

/**
 * Process every pending mutation against the real API.
 * Removes successful mutations; increments retries on failure.
 */
export async function processMutationQueue() {
  const mutations = await getPendingMutations()

  _emitQueueSize(mutations.length)

  for (const mutation of mutations) {
    if ((mutation.retries || 0) >= MAX_RETRIES) {
      // Give up on this mutation
      console.warn('[SyncManager] Dropping mutation after max retries:', mutation)
      await removeMutation(mutation.id)
      continue
    }

    try {
      const token = localStorage.getItem('ds_token')
      if (!token) break // stop processing if user logged out

      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      const fetchOptions = {
        method: mutation.method,
        headers,
        body: mutation.body ? JSON.stringify(mutation.body) : undefined,
      }

      const res = await fetch(mutation.url, fetchOptions)

      if (res.ok) {
        await removeMutation(mutation.id)
      } else if (res.status >= 400 && res.status < 500) {
        // Client error — this mutation will never succeed; drop it
        console.warn('[SyncManager] Client error for mutation, dropping:', mutation, res.status)
        await removeMutation(mutation.id)
      } else {
        // Server error — increment retries and try again later
        await incrementMutationRetry(mutation.id)
      }
    } catch (_err) {
      // Network error — increment retries
      await incrementMutationRetry(mutation.id)
    }
  }

  const remaining = await getPendingMutations()
  _emitQueueSize(remaining.length)
}

/**
 * Fetch fresh data for a list of stores from the server and update local DB.
 * @param {string[]} stores — e.g. ['pacientes', 'turnos']
 */
export async function pullFreshData(stores = []) {
  if (!_api || !_online) return
  if (!localStorage.getItem('ds_token')) return

  const STORE_ENDPOINT = {
    turnos: '/turnos',
    pacientes: '/pacientes',
    evoluciones: '/evoluciones',
    caja_movimientos: '/pagos',
    insumos: '/insumos',
  }

  for (const store of stores) {
    const endpoint = STORE_ENDPOINT[store]
    if (!endpoint) continue
    try {
      const data = await _api.get(endpoint)
      const records = Array.isArray(data) ? data : (data?.items ?? [])
      for (const record of records) {
        if (record.id) await localPut(store, record)
      }
      await setLastSync(store, Date.now())
    } catch (err) {
      console.warn(`[SyncManager] Could not pull fresh data for ${store}:`, err.message)
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _emit(eventName, detail) {
  window.dispatchEvent(new CustomEvent(eventName, { detail }))
}

function _emitQueueSize(size) {
  _emit('sync:queue-size', { size })
}

async function _notifyListeners() {
  const pending = await getPendingMutations().catch(() => [])
  const status = {
    online: _online,
    syncing: _syncing,
    lastSync: _lastSync,
    queueSize: pending.length,
  }
  _statusListeners.forEach(fn => {
    try { fn(status) } catch (_) {}
  })
}
