/**
 * Per-wallet runtime REGISTRY for the SDK wallet engine — the cache of unlocked
 * {@link SdkRuntime}s keyed by wallet id, plus the id of the currently `active`
 * one and each wallet's per-runtime sync/persist coordination state. Split out of
 * `runtime.ts` (which keeps the unlock/adopt lifecycle and re-exports this
 * module's API) so the sync engine and persistence layers can share this state
 * without import cycles.
 *
 * Switching to an ALREADY-UNLOCKED wallet is then instant — no re-open, no
 * password — while switching to one that isn't cached unlocks it in place. Each
 * runtime holds the wallet's account (keys + address), the persisted
 * {@link RawWalletV1} blob, the live SDK {@link WalletState}, the daemon client,
 * the password, AND its OWN sync/persist coordination state.
 *
 * CONCURRENCY INVARIANT (CRITICAL)
 * --------------------------------
 * A `sync()` or `persist()` is bound to ONE specific runtime when it starts and
 * only ever reads/writes THAT runtime's state + storage. If the user switches the
 * active wallet from A to B while A's sync is mid-flight, A's scan still folds into
 * A's cached runtime and persists into A's keyspace — it NEVER writes A's data into
 * B's storage (or vice-versa). To guarantee this, the sync engine and the persist
 * chain take the owning runtime as an argument and the sync-coalescing state
 * (`inFlightSync`, `pendingSync`, `persistChain`) lives PER runtime, not as module
 * globals — see `sync-engine.ts` / `persistence.ts`.
 *
 * SECURITY
 * --------
 * `lock()` / `disconnect()` (and the idle auto-lock that calls `disconnect()`) drop
 * the ENTIRE map (`clearAllRuntimes`), so no decrypted wallet keys for ANY cached
 * wallet survive a lock.
 */
import type {
  Account,
  DaemonClient,
  RawWalletV1,
  StorageAdapter,
  WalletState,
} from "conceal-wallet-sdk";
import { terminateScanPool } from "@/lib/services/real-sdk/scan-pool";
import { DEFAULT_WALLET_ID } from "@/lib/services/real-sdk/wallets-index";

/** A live, unlocked SDK wallet runtime. */
export interface SdkRuntime {
  /**
   * Wallet-registry id this runtime belongs to (`"default"` or a namespaced UUID).
   * Binds sync/persist to a SPECIFIC wallet's keyspace + cached state, so a switch
   * mid-flight never crosses wallets. Optional only so `_setRuntimeForTest({...})`
   * calls that omit it still typecheck; resolved to `"default"` when absent.
   */
  id?: string;
  /** Keys + address for the open wallet. */
  account: Account;
  /** The canonical v1 plaintext blob — persisted (keys, options, contacts, …). */
  raw: RawWalletV1;
  /** The live synced wallet state (outputs/deposits/txs/scannedHeight). */
  state: WalletState;
  /** Typed daemon client built from the wallet's node settings. */
  daemon: DaemonClient;
  /** Password held in memory for re-encrypting on persist (never stored). */
  password: string;
  /** True when the wallet holds no private spend key (watch-only). */
  viewOnly: boolean;
  /**
   * Storage scoped to this wallet's keyspace (multi-wallet, #95). OPTIONAL so
   * `_setRuntimeForTest({...})` calls that omit it still typecheck; falls back to the
   * active wallet's storage on persist when absent.
   */
  storage?: StorageAdapter;
}

/**
 * Per-runtime sync/persist coordination, kept in a side map keyed by wallet id so it
 * is never shared between cached wallets. A sync started for wallet A coalesces only
 * against other A syncs; A's persists chain only behind other A persists.
 */
export interface RuntimeCoordination {
  /** The in-flight scan promise for this wallet, or null when idle. */
  inFlightSync: Promise<number> | null;
  /** A follow-up scan was requested while this wallet's scan was running. */
  pendingSync: boolean;
  /** Serializes this wallet's encrypt+write so two persists never interleave. */
  persistChain: Promise<void>;
  /** Last scannedHeight written as a mid-sync checkpoint; reset at sync chain start. */
  lastCheckpointHeight: number;
}

/** Cache of every UNLOCKED wallet runtime, keyed by registry id. */
const runtimes = new Map<string, SdkRuntime>();
/** The id of the currently active (foreground) wallet, or null when locked. */
let activeId: string | null = null;
/** Per-wallet sync/persist state, keyed by the same id as {@link runtimes}. */
const coordination = new Map<string, RuntimeCoordination>();

/** The registry id a runtime belongs to (defaults to `"default"` when unset). */
export function runtimeId(rt: SdkRuntime): string {
  return rt.id ?? DEFAULT_WALLET_ID;
}

/** Get (or lazily create) the coordination state for a wallet id. */
export function coordinationFor(id: string): RuntimeCoordination {
  let state = coordination.get(id);
  if (!state) {
    state = {
      inFlightSync: null,
      pendingSync: false,
      persistChain: Promise.resolve(),
      lastCheckpointHeight: 0,
    };
    coordination.set(id, state);
  }
  return state;
}

/** The current active unlocked runtime, or `null` when locked. */
export function getRuntime(): SdkRuntime | null {
  return activeId !== null ? (runtimes.get(activeId) ?? null) : null;
}

/** The current active unlocked runtime, or throw a friendly "not open" error. */
export function requireRuntime(): SdkRuntime {
  const rt = getRuntime();
  if (rt === null) {
    throw new Error("Wallet is not open. Unlock the wallet and try again.");
  }
  return rt;
}

/** True when a wallet is unlocked and active. */
export function isUnlocked(): boolean {
  return activeId !== null && runtimes.has(activeId);
}

/** True when the wallet `id` already has a cached (unlocked) runtime. */
export function hasUnlockedRuntime(id: string): boolean {
  return runtimes.has(id);
}

/**
 * Every UNLOCKED runtime that is NOT the active one — the wallets to background-sync for
 * cross-wallet notifications (#108). The active wallet syncs on its own (foreground poll),
 * so it's excluded here to avoid a redundant second scan. The id is the authoritative
 * registry key (the map key), not `rt.id` which may be unset for the default wallet.
 */
export function unlockedNonActiveRuntimes(): { id: string; runtime: SdkRuntime }[] {
  const result: { id: string; runtime: SdkRuntime }[] = [];
  for (const [id, runtime] of runtimes) {
    if (id !== activeId) result.push({ id, runtime });
  }
  return result;
}

/** Every UNLOCKED runtime (the wallets a durable checkpoint flush must cover). */
export function allUnlockedRuntimes(): SdkRuntime[] {
  return [...runtimes.values()];
}

/** Install a runtime in the cache (unlock/adopt/test hook), keyed by registry id. */
export function setRuntime(id: string, rt: SdkRuntime): void {
  runtimes.set(id, rt);
}

/** The cached runtime for wallet `id`, or null when it is not unlocked. */
export function getCachedRuntime(id: string): SdkRuntime | null {
  return runtimes.get(id) ?? null;
}

/** Make wallet `id` the active (foreground) runtime — a no-op when it isn't cached. */
export function activateRuntime(id: string): void {
  if (runtimes.has(id)) {
    activeId = id;
  }
}

/** Clear ALL cached runtimes + coordination + active id (used by lock/disconnect). */
export function clearAllRuntimes(): void {
  runtimes.clear();
  coordination.clear();
  activeId = null;
  // Free the scan worker pool too — a lock should release its WASM/worker resources (the workers
  // receive keys per request but never persist them; terminating drops them either way).
  terminateScanPool();
}

/** Test-only: install a runtime directly (bypassing unlock/storage), or clear all. */
export function _setRuntimeForTest(next: SdkRuntime | null): void {
  if (next === null) {
    clearAllRuntimes();
    return;
  }
  const id = runtimeId(next);
  // Normalize the runtime to carry its id so sync/persist bind correctly.
  setRuntime(id, next.id === id ? next : { ...next, id });
  activeId = id;
}

/** Drop a single wallet's cached runtime + coordination (e.g. on remove). */
export function dropCachedRuntime(id: string): void {
  runtimes.delete(id);
  coordination.delete(id);
  if (activeId === id) {
    activeId = null;
  }
}
