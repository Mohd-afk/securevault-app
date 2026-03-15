// ─── SecureVault IndexedDB Helper ────────────────────────────────────
// Thin, promise-based wrapper around IndexedDB for storing encrypted
// vault data and settings. Replaces localStorage for better performance
// and isolation from casual JS access.
// ─────────────────────────────────────────────────────────────────────

import { createLogger } from './utils/logger';

const log = createLogger('STORE');

const DB_NAME = 'SecureVaultDB';
const DB_VERSION = 1;
const STORE_NAME = 'keyval';

/**
 * Open (or create) the IndexedDB database.
 * Creates the object store on first run.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
        log.info('IndexedDB object store created', { storeName: STORE_NAME });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      log.error('Failed to open IndexedDB', request.error);
      reject(request.error);
    };
  });
}

/**
 * Get a value by key from IndexedDB.
 */
export async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => {
      resolve(request.result ?? null);
    };
    request.onerror = () => {
      log.error('IndexedDB get failed', { key, error: request.error });
      reject(request.error);
    };

    tx.oncomplete = () => db.close();
  });
}

/**
 * Set a value by key in IndexedDB.
 */
export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(value, key);

    request.onsuccess = () => resolve();
    request.onerror = () => {
      log.error('IndexedDB set failed', { key, error: request.error });
      reject(request.error);
    };

    tx.oncomplete = () => db.close();
  });
}

/**
 * Delete a key from IndexedDB.
 */
export async function idbDelete(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => {
      log.error('IndexedDB delete failed', { key, error: request.error });
      reject(request.error);
    };

    tx.oncomplete = () => db.close();
  });
}
