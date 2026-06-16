import { MAX_TX_NOTE_LENGTH, normalizeTxNote } from "@/lib/storage/tx-note-format";

export { MAX_TX_NOTE_LENGTH, normalizeTxNote };

/** Minimal async key→string backend the notes store persists through. */
export interface TxNotesBackend {
  get(hash: string): Promise<string | null>;
  set(hash: string, note: string): Promise<void>;
  delete(hash: string): Promise<void>;
  /** Remove every note (used by the panic wipe). */
  clear(): Promise<void>;
}

export interface TxNotesStore {
  /** Read the saved note for a tx hash; `""` when none. */
  getNote(hash: string): Promise<string>;
  /**
   * Persist a note for a tx hash. Empty/whitespace-only input deletes the key.
   * Returns the normalized value that was stored (`""` means "deleted").
   */
  setNote(hash: string, raw: string): Promise<string>;
  /** Erase all stored notes. */
  clearAll(): Promise<void>;
}

/** Wrap a backend with normalization + the empty-deletes invariant. */
export function createTxNotesStore(backend: TxNotesBackend): TxNotesStore {
  return {
    async getNote(hash) {
      if (!hash) return "";
      return (await backend.get(hash)) ?? "";
    },
    async setNote(hash, raw) {
      if (!hash) throw new Error("Cannot save a note without a transaction hash.");
      const note = normalizeTxNote(raw);
      if (note) {
        await backend.set(hash, note);
      } else {
        await backend.delete(hash);
      }
      return note;
    },
    clearAll() {
      return backend.clear();
    },
  };
}

/**
 * In-memory backend — used by tests and as the default where IndexedDB is
 * genuinely absent (SSR, static-export prerender).
 */
export function inMemoryTxNotesBackend(seed?: Record<string, string>): TxNotesBackend {
  const map = new Map<string, string>(seed ? Object.entries(seed) : undefined);
  return {
    get: (hash) => Promise.resolve(map.has(hash) ? (map.get(hash) as string) : null),
    set: (hash, note) => {
      map.set(hash, note);
      return Promise.resolve();
    },
    delete: (hash) => {
      map.delete(hash);
      return Promise.resolve();
    },
    clear: () => {
      map.clear();
      return Promise.resolve();
    },
  };
}

// --- IndexedDB backend --------------------------------------------------------
// Own database, decoupled from the legacy wallet-core `Storage` so importing
// notes never pulls `wallet-core` into mock mode (see CLAUDE.md service spine).

const DB_NAME = "conceal-wallet-meta";
const STORE_NAME = "tx-notes";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // Out-of-line keys: the tx hash is the key, the note string the value.
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onblocked = () => reject(new Error("IndexedDB open blocked — close other tabs"));
  });
}

export function indexedDbTxNotesBackend(): TxNotesBackend {
  // Memoized open. Reset to null on any failure so the next call reopens — this
  // is what lets us self-heal after the connection is force-closed (e.g. another
  // tab upgrades the DB, firing `onversionchange`).
  let cachedDb: Promise<IDBDatabase> | null = null;
  const db = () => {
    if (!cachedDb) {
      cachedDb = openDb().catch((error) => {
        cachedDb = null;
        throw error;
      });
    }
    return cachedDb;
  };

  const runOnce = <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) =>
    db().then(
      (database) =>
        new Promise<T>((resolve, reject) => {
          let request: IDBRequest<T>;
          try {
            // Throws if the cached connection was closed under us.
            request = run(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
          } catch (error) {
            cachedDb = null;
            reject(error);
            return;
          }
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
        }),
    );

  const run = async <T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    try {
      return await runOnce<T>(mode, fn);
    } catch {
      // One self-heal retry against a freshly reopened connection. A second
      // failure propagates so the caller (useTxNote) can surface it — better an
      // honest "couldn't save" than silently dropping the note.
      cachedDb = null;
      return runOnce<T>(mode, fn);
    }
  };

  return {
    async get(hash) {
      const value = await run<unknown>("readonly", (store) => store.get(hash));
      return typeof value === "string" ? value : null;
    },
    async set(hash, note) {
      await run("readwrite", (store) => store.put(note, hash));
    },
    async delete(hash) {
      await run("readwrite", (store) => store.delete(hash));
    },
    async clear() {
      await run("readwrite", (store) => store.clear());
    },
  };
}

/**
 * Process-wide default store used by the UI (`useTxNote`). IndexedDB in the
 * browser; in-memory only where IndexedDB is genuinely absent (SSR / static-export
 * prerender). We deliberately do NOT swap to in-memory when a live IndexedDB op
 * fails — that would silently lose notes on the next reload; the hook surfaces
 * the error instead.
 */
function defaultBackend(): TxNotesBackend {
  return typeof indexedDB === "undefined" ? inMemoryTxNotesBackend() : indexedDbTxNotesBackend();
}

export const txNotes: TxNotesStore = createTxNotesStore(defaultBackend());

/** Erase every saved transaction note (used by the panic wipe). */
export function clearAllTxNotes(): Promise<void> {
  return txNotes.clearAll();
}
