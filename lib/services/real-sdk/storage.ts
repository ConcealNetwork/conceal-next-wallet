/**
 * SDK {@link StorageAdapter} backed by the EXACT legacy IndexedDB coordinates so
 * `openStoredWallet`/`saveStoredWallet` read and write the SAME `"wallet"` record
 * the legacy `wallet-core` `Storage` used:
 *
 *   - IndexedDB db `"mydb"`, object store `"storage"`, `keyPath: "key"` (version 2),
 *     records `{ key, value }` where `value` is `JSON.stringify(envelope)`.
 *   - `localStorage` fallback under the same `"wallet"` key when IndexedDB is absent.
 *
 * Mirrors the SSR/static-export guards in `lib/storage/*` (`typeof indexedDB`,
 * `typeof window`) so the static export and tests never touch a missing global.
 * This module has NO `lib/wallet-core` import — it only reproduces the storage
 * coordinates documented in `docs/specs/.../keys-and-storage.md` §2.1.
 */
import type { StorageAdapter } from "conceal-wallet-sdk";

/** Legacy IndexedDB database name (`lib/wallet-core/Storage.ts`). */
const DB_NAME = "mydb";
/** Legacy object-store name. */
const STORE_NAME = "storage";
/** Legacy schema version (v2 ensures the object store exists). */
const DB_VERSION = 2;
/** `keyPath` of the legacy store — records are `{ key, value }`. */
const KEY_PATH = "key";

/** True when a usable IndexedDB global is present (browser, not SSR/export). */
function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

/** True when a usable `localStorage` global is present. */
function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Open (and lazily upgrade) the legacy `mydb` database. */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error("IndexedDB is not available."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: KEY_PATH });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
    request.onblocked = () =>
      reject(new Error("IndexedDB open blocked — close other tabs using this wallet."));
  });
}

/** A `localStorage`-backed adapter (fallback when IndexedDB is unavailable). */
function localStorageAdapter(): StorageAdapter {
  return {
    getItem(key) {
      try {
        return Promise.resolve(window.localStorage.getItem(key));
      } catch {
        return Promise.resolve(null);
      }
    },
    setItem(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Quota / private-mode failures are non-fatal — persistence is best-effort.
      }
      return Promise.resolve();
    },
    removeItem(key) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Removing a key that cannot be removed is harmless.
      }
      return Promise.resolve();
    },
    keys() {
      try {
        const result: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key !== null) result.push(key);
        }
        return Promise.resolve(result);
      } catch {
        return Promise.resolve([]);
      }
    },
  };
}

/** An in-memory adapter — used only on SSR / static-export prerender (no storage). */
function memoryAdapter(): StorageAdapter {
  const store = new Map<string, string>();
  return {
    getItem: (key) => Promise.resolve(store.has(key) ? (store.get(key) as string) : null),
    setItem: (key, value) => {
      store.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key) => {
      store.delete(key);
      return Promise.resolve();
    },
    keys: () => Promise.resolve([...store.keys()]),
  };
}

/** An IndexedDB-backed adapter targeting the legacy `mydb` / `storage` coordinates. */
function indexedDbAdapter(): StorageAdapter {
  // Memoized open; reset to null on failure so the next call reopens (self-heal
  // after another tab upgrades the DB and fires `onversionchange`).
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
            request = run(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
          } catch (error) {
            cachedDb = null;
            reject(error);
            return;
          }
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
        }),
    );

  const run = async <T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    try {
      return await runOnce<T>(mode, fn);
    } catch {
      // One self-heal retry against a freshly reopened connection.
      cachedDb = null;
      return runOnce<T>(mode, fn);
    }
  };

  return {
    async getItem(key) {
      const record = await run<{ key: string; value: string } | undefined>("readonly", (store) =>
        store.get(key),
      );
      return record && typeof record.value === "string" ? record.value : null;
    },
    async setItem(key, value) {
      await run("readwrite", (store) => store.put({ [KEY_PATH]: key, value }));
    },
    async removeItem(key) {
      await run("readwrite", (store) => store.delete(key));
    },
    async keys() {
      const keys = await run<IDBValidKey[]>("readonly", (store) => store.getAllKeys());
      return keys.filter((key): key is string => typeof key === "string");
    },
  };
}

let cachedAdapter: StorageAdapter | null = null;

/**
 * The process-wide SDK storage adapter for the real-SDK engine. IndexedDB in the
 * browser (legacy `mydb` / `storage` coordinates); `localStorage` when IndexedDB
 * is absent; an in-memory adapter on SSR / static-export prerender so nothing
 * throws when no storage global exists.
 */
export function getSdkWalletStorage(): StorageAdapter {
  if (cachedAdapter) return cachedAdapter;
  if (hasIndexedDb()) {
    cachedAdapter = indexedDbAdapter();
  } else if (hasLocalStorage()) {
    cachedAdapter = localStorageAdapter();
  } else {
    cachedAdapter = memoryAdapter();
  }
  return cachedAdapter;
}

/** Test-only reset of the cached adapter (suites that swap globals). */
export function _resetSdkWalletStorage(): void {
  cachedAdapter = null;
}
