// IndexedDB wrapper using the `idb` library.
// Provides a local-first data layer for offline support.

import { openDB } from 'idb'

const DB_NAME = 'clingest-local'
const DB_VERSION = 1

let _db = null

export async function getDB() {
  if (_db) return _db
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Core data stores
      if (!db.objectStoreNames.contains('turnos')) {
        db.createObjectStore('turnos', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('pacientes')) {
        db.createObjectStore('pacientes', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('evoluciones')) {
        db.createObjectStore('evoluciones', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('caja_movimientos')) {
        db.createObjectStore('caja_movimientos', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('insumos')) {
        db.createObjectStore('insumos', { keyPath: 'id' })
      }
      // Pending mutations waiting to be synced to the cloud
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true })
      }
      // Cache metadata (last_sync timestamps, etc.)
      if (!db.objectStoreNames.contains('cache_meta')) {
        db.createObjectStore('cache_meta', { keyPath: 'key' })
      }
    },
  })
  return _db
}

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

export async function localGet(store, id) {
  const db = await getDB()
  return db.get(store, id)
}

export async function localGetAll(store) {
  const db = await getDB()
  return db.getAll(store)
}

export async function localPut(store, record) {
  const db = await getDB()
  return db.put(store, record)
}

export async function localDelete(store, id) {
  const db = await getDB()
  return db.delete(store, id)
}

export async function localClear(store) {
  const db = await getDB()
  return db.clear(store)
}

// ---------------------------------------------------------------------------
// Sync queue helpers
// ---------------------------------------------------------------------------

/**
 * Add a pending mutation to the sync queue.
 * @param {{ method: string, url: string, body?: any, tenant_id?: string }} mutation
 */
export async function queueMutation(mutation) {
  const db = await getDB()
  return db.add('sync_queue', {
    ...mutation,
    timestamp: Date.now(),
    retries: 0,
  })
}

export async function getPendingMutations() {
  const db = await getDB()
  const all = await db.getAll('sync_queue')
  return all.sort((a, b) => a.timestamp - b.timestamp)
}

export async function removeMutation(id) {
  const db = await getDB()
  return db.delete('sync_queue', id)
}

/**
 * Increment the retry counter for a queued mutation.
 */
export async function incrementMutationRetry(id) {
  const db = await getDB()
  const record = await db.get('sync_queue', id)
  if (record) {
    record.retries = (record.retries || 0) + 1
    await db.put('sync_queue', record)
  }
}

// ---------------------------------------------------------------------------
// Cache metadata helpers
// ---------------------------------------------------------------------------

export async function getLastSync(store) {
  const db = await getDB()
  const entry = await db.get('cache_meta', `last_sync_${store}`)
  return entry ? entry.timestamp : null
}

export async function setLastSync(store, timestamp) {
  const db = await getDB()
  return db.put('cache_meta', { key: `last_sync_${store}`, timestamp })
}
