/**
 * Per-wallet Goals persistence (#149) — guarded IndexedDB, same pattern as
 * `tx-notes.ts`. Device-local metadata only; NO engine/`wallet-core` import.
 *
 * Keyed per wallet (`ccx-goals:<walletId>`); each key holds that wallet's Goal[]
 * as one JSON value. Corrupt/invalid records are skipped per-item on read (never
 * fatal). An unresolved wallet id throws — we never silently write to a wrong key.
 */
import { type Goal, isGoal } from "@/lib/goals/goal";

const KEY_PREFIX = "ccx-goals:";

export function goalsKey(walletId: string): string {
  return `${KEY_PREFIX}${walletId}`;
}

function requireWalletId(walletId: string): void {
  if (!walletId) {
    throw new Error("Cannot access goals without a resolved wallet id.");
  }
}

/** Minimal async key→Goal[] backend the store persists through. */
export interface GoalsBackend {
  get(key: string): Promise<unknown>;
  set(key: string, goals: Goal[]): Promise<void>;
  delete(key: string): Promise<void>;
  /** Remove every wallet's goals (used by a full local-metadata wipe). */
  clearAll(): Promise<void>;
}

export interface GoalsStore {
  /** The active wallet's goals (corrupt records skipped). */
  list(walletId: string): Promise<Goal[]>;
  /** Upsert a goal by id; returns the new list. */
  save(walletId: string, goal: Goal): Promise<Goal[]>;
  /** Remove a goal by id; returns the new list. */
  remove(walletId: string, id: string): Promise<Goal[]>;
  /** Immutably merge a patch into a goal by id; returns the new list. */
  update(walletId: string, id: string, patch: Partial<Omit<Goal, "id">>): Promise<Goal[]>;
  /** Erase one wallet's goals (panic-wipe / delete-wallet). */
  clear(walletId: string): Promise<void>;
  /** Erase every wallet's goals. */
  clearAll(): Promise<void>;
}

export function createGoalsStore(backend: GoalsBackend): GoalsStore {
  async function readList(walletId: string): Promise<Goal[]> {
    requireWalletId(walletId);
    const raw = await backend.get(goalsKey(walletId));
    return Array.isArray(raw) ? raw.filter(isGoal) : [];
  }

  return {
    list: readList,
    async save(walletId, goal) {
      requireWalletId(walletId);
      if (!isGoal(goal)) throw new Error("Refusing to save an invalid goal.");
      const list = await readList(walletId);
      const index = list.findIndex((g) => g.id === goal.id);
      const next = index >= 0 ? list.map((g, i) => (i === index ? goal : g)) : [...list, goal];
      await backend.set(goalsKey(walletId), next);
      return next;
    },
    async remove(walletId, id) {
      const list = await readList(walletId);
      const next = list.filter((g) => g.id !== id);
      await backend.set(goalsKey(walletId), next);
      return next;
    },
    async update(walletId, id, patch) {
      const list = await readList(walletId);
      let changed = false;
      const next = list.map((g) => {
        if (g.id !== id) return g;
        const merged = { ...g, ...patch, id: g.id };
        if (!isGoal(merged)) throw new Error("Refusing to apply an invalid goal patch.");
        changed = true;
        return merged;
      });
      if (changed) await backend.set(goalsKey(walletId), next);
      return next;
    },
    async clear(walletId) {
      requireWalletId(walletId);
      await backend.delete(goalsKey(walletId));
    },
    clearAll() {
      return backend.clearAll();
    },
  };
}

/** In-memory backend — tests + where IndexedDB is genuinely absent (SSR/static export). */
export function inMemoryGoalsBackend(seed?: Record<string, Goal[]>): GoalsBackend {
  const map = new Map<string, Goal[]>(seed ? Object.entries(seed) : undefined);
  return {
    get: (key) => Promise.resolve(map.has(key) ? map.get(key) : undefined),
    set: (key, goals) => {
      map.set(key, goals);
      return Promise.resolve();
    },
    delete: (key) => {
      map.delete(key);
      return Promise.resolve();
    },
    clearAll: () => {
      map.clear();
      return Promise.resolve();
    },
  };
}

// --- IndexedDB backend --------------------------------------------------------
// Own database (not the tx-notes DB) so the two never fight over a shared version.

const DB_NAME = "conceal-wallet-goals";
const STORE_NAME = "goals";
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

export function indexedDbGoalsBackend(): GoalsBackend {
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

  const runOnce = <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) =>
    db().then(
      (database) =>
        new Promise<T>((resolve, reject) => {
          let request: IDBRequest<T>;
          try {
            request = fn(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
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
      cachedDb = null; // one self-heal retry against a freshly reopened connection
      return runOnce<T>(mode, fn);
    }
  };

  return {
    get: (key) => run<unknown>("readonly", (store) => store.get(key)),
    async set(key, goals) {
      await run("readwrite", (store) => store.put(goals, key));
    },
    async delete(key) {
      await run("readwrite", (store) => store.delete(key));
    },
    async clearAll() {
      await run("readwrite", (store) => store.clear());
    },
  };
}

function defaultBackend(): GoalsBackend {
  return typeof indexedDB === "undefined" ? inMemoryGoalsBackend() : indexedDbGoalsBackend();
}

/** Process-wide store used by the UI hook. */
export const goalsStore: GoalsStore = createGoalsStore(defaultBackend());

/** Erase every saved goal (used by the panic wipe). */
export function clearAllGoals(): Promise<void> {
  return goalsStore.clearAll();
}
