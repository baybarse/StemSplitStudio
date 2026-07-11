/**
 * @fileoverview IndexedDB wrapper for caching downloaded ONNX model files.
 *
 * Stores model ArrayBuffers in a dedicated object store so that subsequent
 * page loads can skip the network download entirely. Each model piece is
 * keyed by its filename (e.g. "htdemucs_p00.onnx").
 *
 * @module model-cache
 */

/** @const {string} Database name in IndexedDB. */
const DB_NAME = 'stem-separator-models';

/** @const {number} Database schema version. */
const DB_VERSION = 1;

/** @const {string} Object store name for model blobs. */
const STORE_NAME = 'models';

/**
 * Lightweight IndexedDB cache for ONNX model data.
 *
 * @example
 * ```js
 * const cache = new ModelCache();
 * await cache.open();
 *
 * if (!(await cache.has('model.onnx'))) {
 *   const buf = await fetch(url).then(r => r.arrayBuffer());
 *   await cache.set('model.onnx', buf);
 * }
 *
 * const data = await cache.get('model.onnx');
 * ```
 */
export class ModelCache {
  constructor() {
    /** @type {IDBDatabase|null} */
    this.db = null;
  }

  /**
   * Open (or create) the IndexedDB database.
   *
   * This must be called before any read/write operations. Repeated calls
   * are safe – an already-open database is returned immediately.
   *
   * @returns {Promise<IDBDatabase>} The opened database instance.
   */
  async open() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = /** @type {IDBOpenDBRequest} */ (event.target).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = (event) => {
        this.db = /** @type {IDBOpenDBRequest} */ (event.target).result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('[ModelCache] Failed to open IndexedDB:', event);
        reject(new Error('Could not open model cache database'));
      };
    });
  }

  /**
   * Ensure the database is open, opening it if necessary.
   *
   * @private
   * @returns {Promise<IDBDatabase>}
   */
  async _ensureOpen() {
    if (!this.db) await this.open();
    return /** @type {IDBDatabase} */ (this.db);
  }

  /**
   * Retrieve cached model data by key.
   *
   * @param {string} key - The cache key (typically a filename).
   * @returns {Promise<ArrayBuffer|null>} The stored ArrayBuffer, or null if
   *   the key does not exist.
   */
  async get(key) {
    const db = await this._ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result ?? null);
      };

      request.onerror = (event) => {
        console.error(`[ModelCache] Failed to get "${key}":`, event);
        reject(new Error(`Failed to read cache key: ${key}`));
      };
    });
  }

  /**
   * Store model data under the given key.
   *
   * @param {string}      key  - The cache key.
   * @param {ArrayBuffer}  data - The model data to cache.
   * @returns {Promise<void>}
   */
  async set(key, data) {
    const db = await this._ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(data, key);

      request.onsuccess = () => resolve();
      request.onerror = (event) => {
        console.error(`[ModelCache] Failed to set "${key}":`, event);
        reject(new Error(`Failed to write cache key: ${key}`));
      };
    });
  }

  /**
   * Check whether a key exists in the cache.
   *
   * Uses `count()` instead of `get()` to avoid transferring large blobs
   * just for an existence check.
   *
   * @param {string} key - The cache key.
   * @returns {Promise<boolean>}
   */
  async has(key) {
    const db = await this._ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.count(key);

      request.onsuccess = () => resolve(request.result > 0);
      request.onerror = (event) => {
        console.error(`[ModelCache] Failed to check "${key}":`, event);
        reject(new Error(`Failed to check cache key: ${key}`));
      };
    });
  }

  /**
   * Delete a single cached model.
   *
   * @param {string} key - The cache key to remove.
   * @returns {Promise<void>}
   */
  async delete(key) {
    const db = await this._ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = (event) => {
        console.error(`[ModelCache] Failed to delete "${key}":`, event);
        reject(new Error(`Failed to delete cache key: ${key}`));
      };
    });
  }

  /**
   * Clear all cached models.
   *
   * @returns {Promise<void>}
   */
  async clear() {
    const db = await this._ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = (event) => {
        console.error('[ModelCache] Failed to clear cache:', event);
        reject(new Error('Failed to clear model cache'));
      };
    });
  }

  /**
   * Compute the total size of all cached models in bytes.
   *
   * Iterates every entry in the store and sums their `byteLength`.
   * For very large caches this may take a moment.
   *
   * @returns {Promise<number>} Total cache size in bytes.
   */
  async getSize() {
    const db = await this._ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.openCursor();
      let totalSize = 0;

      request.onsuccess = (event) => {
        const cursor = /** @type {IDBRequest<IDBCursorWithValue>} */ (event.target).result;
        if (cursor) {
          const value = cursor.value;
          if (value instanceof ArrayBuffer) {
            totalSize += value.byteLength;
          } else if (value && typeof value.byteLength === 'number') {
            totalSize += value.byteLength;
          } else if (value && typeof value.length === 'number') {
            totalSize += value.length;
          }
          cursor.continue();
        } else {
          resolve(totalSize);
        }
      };

      request.onerror = (event) => {
        console.error('[ModelCache] Failed to compute cache size:', event);
        reject(new Error('Failed to compute cache size'));
      };
    });
  }
}
