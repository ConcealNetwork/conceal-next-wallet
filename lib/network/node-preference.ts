/**
 * Device-local PREFERRED daemon node — the node a user picks on the wallet-open screen, persisted so
 * they don't re-pick every time. It lives in localStorage (NOT the encrypted wallet blob), so it's
 * readable BEFORE unlock and shared across every wallet on this device. Engine-free + SSR/static-
 * export safe (guards `typeof localStorage`).
 *
 * Precedence when the wallet picks its sync node (see `nodeUrlFromRaw`): an explicit per-wallet
 * custom node (encrypted settings) wins, then this device-local preference, then the default node.
 *
 * Read by BOTH the runtime (`readPreferredNode`, at daemon construction) and the open-screen picker
 * (the cached/subscribable getters, for reactivity).
 */
const STORAGE_KEY = "ccx-preferred-node";

type NodePreferenceListener = (url: string | null) => void;

let cached: string | null = null;
let loaded = false;
const listeners = new Set<NodePreferenceListener>();

/** Direct localStorage read — no cache dependency, safe for the runtime to call at any time. */
export function readPreferredNode(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

function writePreferredNode(url: string | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (url && url.trim()) localStorage.setItem(STORAGE_KEY, url);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private-mode / quota — keep the in-memory value; non-critical.
  }
}

function notify(): void {
  for (const listener of listeners) listener(cached);
}

/** Load the persisted preference into the in-memory cache (call once on app start). */
export function loadNodePreference(): string | null {
  cached = readPreferredNode();
  loaded = true;
  notify();
  return cached;
}

/** The current preferred node — the cache once loaded, else a direct read. `null` = use the default. */
export function getPreferredNode(): string | null {
  return loaded ? cached : readPreferredNode();
}

/** Set (and persist) the preferred node. `null` clears it (revert to the default). */
export function setPreferredNode(url: string | null): void {
  const next = url && url.trim() ? url : null;
  cached = next;
  loaded = true;
  writePreferredNode(next);
  notify();
}

export function subscribeNodePreference(listener: NodePreferenceListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
