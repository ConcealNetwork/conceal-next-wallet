/**
 * Per-wallet runtime cache for the SDK wallet engine — the SDK analogue of the
 * legacy `window.__ccxRuntimeWallet`, extended for SMOOTH multi-wallet switching.
 *
 * Instead of a single unlocked wallet, the engine keeps a `Map` of unlocked
 * {@link SdkRuntime}s keyed by wallet id, plus the id of the currently `active`
 * one. Switching to an ALREADY-UNLOCKED wallet is then instant — no re-open, no
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
 * B's storage (or vice-versa). To guarantee this, `syncOnce`/`runSyncChain`/
 * `persistNow` take the owning runtime as an argument and the sync-coalescing state
 * (`inFlightSync`, `pendingSync`, `persistChain`) lives PER runtime, not as module
 * globals.
 *
 * SECURITY
 * --------
 * `lock()` / `disconnect()` (and the idle auto-lock that calls `disconnect()`) drop
 * the ENTIRE map, so no decrypted wallet keys for ANY cached wallet survive a lock.
 *
 * STATE + PERSISTENCE MODEL
 * -------------------------
 * Everything lives inside the ONE encrypted `"wallet"` blob per keyspace (so a single
 * `saveStoredWallet` round-trips keys, settings, contacts, sent messages AND the
 * synced state). The live SDK {@link WalletState} is serialized into a custom
 * `raw.sdkWalletState` field (carried by `RawWalletV1`'s index signature) on every
 * persist. On unlock:
 *
 *   - An EXISTING legacy blob (written by `wallet-core`) has NO `sdkWalletState`,
 *     so we build a fresh {@link WalletState} seeded at `creationHeight` — the
 *     wallet then re-syncs all of its history from the daemon, but never rescans
 *     blocks before it existed. After the first sync we write `sdkWalletState`
 *     back, so subsequent unlocks resume from the saved `scannedHeight`.
 *   - A blob previously saved by THIS engine carries `sdkWalletState` and is
 *     `deserializeWalletState`-d, resuming exactly where it left off.
 *
 * INBOUND MESSAGES: the SDK `WalletState` discards tx `extra`, so during each sync
 * scan we also reconstruct received messages (`readMessageFromTransaction`) and
 * persist them into `raw.receivedMessages` (deduped by tx hash) — so a full re-sync
 * of an existing legacy wallet rebuilds its inbound message history too.
 *
 * No `lib/wallet-core` import anywhere here — the whole point of the engine.
 */
import {
  type Account,
  applyScannedDeposits,
  applyScannedTransaction,
  createDaemonClient,
  createWalletState,
  type DaemonClient,
  deserializeWalletState,
  encodeAddress,
  findWithdrawnDepositIndexes,
  openStoredWallet,
  type RawDepositInput,
  type RawWalletV1,
  type StorageAdapter,
  saveStoredWallet,
  serializeWalletState,
  transactions as txns,
  type UserKeys,
  type WalletKeys,
  type WalletState,
} from "conceal-wallet-sdk";
import { DEFAULT_DAEMON_NODES } from "@/lib/config/config";
import {
  type IncomingPendingRecord,
  readIncomingPendingRecords,
  reconcileIncomingPending,
  withIncomingPendingRecords,
} from "@/lib/services/real-sdk/incoming-pending-store";
import { seedStateFromLegacyBlob } from "@/lib/services/real-sdk/legacy-state-seed";
import {
  readReceivedRecords,
  readSentRecords,
  reconstructReceivedMessage,
  type SdkMessageRecord,
  withReceivedRecords,
} from "@/lib/services/real-sdk/messages-store";
import {
  prunePendingRecords,
  readPendingRecords,
  withPendingRecords,
} from "@/lib/services/real-sdk/pending-store";
import { scanPoolForOwned } from "@/lib/services/real-sdk/pool";
import { ensureSdkReady } from "@/lib/services/real-sdk/ready";
import {
  DEFAULT_WALLET_ID,
  getActiveWallet,
  getActiveWalletStorage,
  readWalletsIndex,
  registerWallet,
  setActiveWallet,
  storageForWallet,
  unregisterWallet,
  updateWallet,
  type WalletMeta,
} from "@/lib/services/real-sdk/wallets-index";

/**
 * The SDK's daemon-result types (`DaemonRawTransaction`, `DaemonRandomOutsForAmount`)
 * are not exported, so the minimal public shapes we consume are mirrored here from
 * `conceal-wallet-sdk/src/daemon.ts`.
 */
interface DaemonRawTransaction {
  transaction: unknown;
  timestamp: number;
  outputIndexes: number[];
  height: number;
  blockHash: string;
  hash: string;
  fee: number;
}
interface DaemonRandomOut {
  globalIndex: number;
  publicKey: string;
}
interface DaemonRandomOutsForAmount {
  amount: number;
  outs: DaemonRandomOut[];
}

/** Field we add to the persisted blob to carry the serialized SDK wallet state. */
const SDK_STATE_FIELD = "sdkWalletState";

/**
 * Re-scan this many blocks below the last scanned height on every sync. A daemon can
 * return a block range via `getWalletSyncData` BEFORE it has indexed a tx that was just
 * mined into one of those blocks; without re-scanning, `scannedHeight` advances past it
 * and the tx is dropped until a manual full rescan (#98). Folding is idempotent, so
 * re-scanning recent blocks every sync is safe and also covers small chain reorgs.
 */
const RESCAN_LAG_BLOCKS = 10;

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
interface RuntimeCoordination {
  /** The in-flight scan promise for this wallet, or null when idle. */
  inFlightSync: Promise<number> | null;
  /** A follow-up scan was requested while this wallet's scan was running. */
  pendingSync: boolean;
  /** Serializes this wallet's encrypt+write so two persists never interleave. */
  persistChain: Promise<void>;
}

/** Cache of every UNLOCKED wallet runtime, keyed by registry id. */
const runtimes = new Map<string, SdkRuntime>();
/** The id of the currently active (foreground) wallet, or null when locked. */
let activeId: string | null = null;
/** Per-wallet sync/persist state, keyed by the same id as {@link runtimes}. */
const coordination = new Map<string, RuntimeCoordination>();

/** The registry id a runtime belongs to (defaults to `"default"` when unset). */
function runtimeId(rt: SdkRuntime): string {
  return rt.id ?? DEFAULT_WALLET_ID;
}

/** Get (or lazily create) the coordination state for a wallet id. */
function coordinationFor(id: string): RuntimeCoordination {
  let state = coordination.get(id);
  if (!state) {
    state = { inFlightSync: null, pendingSync: false, persistChain: Promise.resolve() };
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

/** Install or drop a runtime in the cache, keeping coordination state in sync. */
function setRuntime(id: string, rt: SdkRuntime): void {
  runtimes.set(id, rt);
}

/** Clear ALL cached runtimes + coordination + active id (used by lock/disconnect). */
function clearAllRuntimes(): void {
  runtimes.clear();
  coordination.clear();
  activeId = null;
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

/** Whether ANY stored wallet exists on this device (does not decrypt them). */
export async function hasStoredWallet(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  return (await readWalletsIndex()).wallets.length > 0;
}

/** Map normalized {@link UserKeys} to the SDK {@link WalletKeys} (sec/pub pairs). */
function toWalletKeys(keys: UserKeys): WalletKeys {
  return {
    spend: { sec: keys.priv.spend, pub: keys.pub.spend },
    view: { sec: keys.priv.view, pub: keys.pub.view },
  };
}

/** Build the SDK {@link Account} (address + keys) from normalized {@link UserKeys}. */
function buildAccount(keys: UserKeys): Account {
  return {
    address: encodeAddress(keys.pub.spend, keys.pub.view),
    keys: toWalletKeys(keys),
  };
}

/** Default daemon node URL (first curated public node). */
export function defaultNodeUrl(): string {
  return DEFAULT_DAEMON_NODES[0];
}

/** Resolve the effective node URL from a wallet's persisted options. */
export function nodeUrlFromRaw(raw: RawWalletV1): string {
  const options = raw.options;
  if (options?.customNode && typeof options.nodeUrl === "string" && options.nodeUrl.trim()) {
    return options.nodeUrl;
  }
  return defaultNodeUrl();
}

/**
 * Build a daemon client for `nodeUrl`. `allowInsecure: true` permits a plain
 * `http://` self-hosted node (the legacy explorer allowed any node URL).
 */
export function buildDaemon(nodeUrl: string): DaemonClient {
  return createDaemonClient({ nodeUrl, allowInsecure: true });
}

/**
 * Construct the live {@link WalletState} for a just-opened blob. Resumes from a
 * previously-saved `sdkWalletState` when present; otherwise seeds a fresh state
 * at `creationHeight` so an existing legacy wallet re-syncs its history without
 * rescanning pre-creation blocks.
 */
function buildState(account: Account, raw: RawWalletV1): WalletState {
  const serialized = raw[SDK_STATE_FIELD];
  if (typeof serialized === "string" && serialized.length > 0) {
    try {
      const restored = deserializeWalletState(serialized);
      if (restored.address === account.address) {
        return restored;
      }
      // A blob whose saved state belongs to a different address is treated as
      // absent — re-sync fresh rather than trust mismatched state.
    } catch {
      // Corrupt serialized state — fall through to a fresh re-sync.
    }
  }
  // An existing wallet-core blob carries its full already-scanned history
  // (outputs/spends/deposits + `lastHeight`). Seed the live state from it so the
  // wallet opens INSTANTLY at `lastHeight` instead of rescanning from genesis —
  // only the small `lastHeight`→tip gap then syncs. Byte-identical to a re-sync.
  const seeded = seedStateFromLegacyBlob(account, raw);
  if (seeded !== null) {
    return seeded;
  }

  const fresh = createWalletState(account);
  // No scanned history (a fresh create/import): seed at `creationHeight` ONLY when
  // present — it scopes the scan past pre-creation blocks. NEVER fall back to
  // `lastHeight`: an older blob that lacks `creationHeight` carries `lastHeight` =
  // the synced TIP, and seeding there would make sync skip the wallet's entire
  // history. Fall back to 0 — a full scan is slow but correct.
  const creationHeight = Math.max(0, Number(raw.creationHeight ?? 0) || 0);
  return creationHeight > 0 ? { ...fresh, scannedHeight: creationHeight } : fresh;
}

/**
 * Unlock the stored wallet with `password`, cache it, and make it the active runtime.
 * Returns the live runtime, or throws a friendly error on a wrong password / missing
 * wallet. If the active wallet is ALREADY cached (unlocked), returns it instantly
 * without re-opening. Does NOT sync — the caller (`getWalletInfo`/`refreshWallet`)
 * drives sync explicitly.
 */
export async function unlock(password: string): Promise<SdkRuntime> {
  if (!password) {
    throw new Error("Password is required to open a stored wallet.");
  }
  // Await WASM crypto init before openStoredWallet → buildAccount derive keys.
  await ensureSdkReady();
  // Open the ACTIVE wallet's keyspace (multi-wallet #95); falls back to the bare
  // default keyspace when no wallet is registered yet (legacy/first-open).
  const meta = await getActiveWallet();
  const id = meta?.id ?? DEFAULT_WALLET_ID;

  // Already unlocked + cached → make it active and return instantly (no re-open).
  const cached = runtimes.get(id);
  if (cached) {
    activeId = id;
    return cached;
  }

  const storage = storageForWallet(meta ?? { namespace: "" });
  let opened: { raw: RawWalletV1; keys: UserKeys } | null;
  try {
    opened = await openStoredWallet(storage, password);
  } catch (error) {
    throw new Error(`Could not open the stored wallet: ${friendlyMessage(error)}`);
  }
  if (opened === null) {
    throw new Error("Invalid password or no wallet stored on this device.");
  }

  const account = buildAccount(opened.keys);
  const state = buildState(account, opened.raw);
  const daemon = buildDaemon(nodeUrlFromRaw(opened.raw));
  const viewOnly = !opened.keys.priv.spend;

  const rt: SdkRuntime = {
    id,
    account,
    raw: opened.raw,
    state,
    daemon,
    password,
    viewOnly,
    storage,
  };
  setRuntime(id, rt);
  activeId = id;
  // Cache the address into the registry the first time we resolve it, so the
  // switcher can show a truncated address without unlocking each wallet.
  if (meta && !meta.address) {
    await updateWallet(meta.id, { address: account.address });
  }
  return rt;
}

/**
 * Adopt a freshly created/imported/restored wallet into the runtime cache, REGISTER
 * it in the multi-wallet index (first → bare/default, rest → namespaced + active),
 * and persist it into that wallet's keyspace. Used by create / import paths after
 * building `raw`. "Add wallet" is just another adopt — it never overwrites an
 * existing wallet's blob.
 */
export async function adopt(input: {
  raw: RawWalletV1;
  keys: UserKeys;
  password: string;
  label?: string;
}): Promise<SdkRuntime> {
  // Await WASM crypto init before buildAccount/buildState derive the address.
  await ensureSdkReady();
  const account = buildAccount(input.keys);
  const state = buildState(account, input.raw);
  const daemon = buildDaemon(nodeUrlFromRaw(input.raw));
  const viewOnly = !input.keys.priv.spend;

  // Default label: "Main wallet" for the very first wallet, else "Wallet N".
  const existingCount = (await readWalletsIndex()).wallets.length;
  const label =
    input.label?.trim() || (existingCount === 0 ? "Main wallet" : `Wallet ${existingCount + 1}`);
  const meta = await registerWallet({ label, address: account.address });
  const storage = storageForWallet(meta);

  const rt: SdkRuntime = {
    id: meta.id,
    account,
    raw: input.raw,
    state,
    daemon,
    password: input.password,
    viewOnly,
    storage,
  };
  setRuntime(meta.id, rt);
  activeId = meta.id;
  await persist();
  return rt;
}

// --- sync concurrency guard ------------------------------------------------
// `sync()` reads `rt.state` at entry and writes it back at the end, so two scans
// running concurrently (auto-refresh + manual refresh, or a send-triggered
// re-sync) would each capture the same starting state and the last writer would
// clobber the other — losing txs / reverting `scannedHeight` / racing `persist`.
// To serialize: callers chain onto a single in-flight scan PER WALLET (its own
// `coordination` entry). While a wallet's scan runs, a later caller marks a pending
// re-run so its intent (catch up AFTER the current finishes — e.g. to see a
// just-broadcast tx) is honored exactly once, rather than starting a parallel scan.
// Binding to the runtime (not `activeId`) means a switch mid-flight cannot redirect
// an in-progress scan to a different wallet's state/storage.

/**
 * Advance the ACTIVE wallet's live state to the network tip, serialized against
 * concurrent calls. Never runs two scans at once for the same wallet: if a scan is
 * in flight, the caller awaits it and (because its data may predate this call) a
 * single follow-up scan is queued. Returns the network height observed by the scan
 * the caller ultimately awaits.
 */
export async function sync(): Promise<number> {
  return syncRuntime(requireRuntime());
}

/**
 * Sync a SPECIFIC runtime to the network tip, serialized against concurrent calls
 * for THAT wallet. Bound to the runtime so a mid-flight active-wallet switch never
 * redirects this scan to another wallet's state/storage.
 */
export function syncRuntime(rt: SdkRuntime): Promise<number> {
  const coord = coordinationFor(runtimeId(rt));
  // Idle → start a fresh scan chain for this wallet.
  if (coord.inFlightSync === null) {
    coord.inFlightSync = runSyncChain(rt, coord);
    return coord.inFlightSync;
  }
  // A scan is already running for this wallet. Queue exactly one follow-up so this
  // caller's intent to catch up AFTER the current scan is honored, then await it.
  coord.pendingSync = true;
  return coord.inFlightSync;
}

/** Run scans back-to-back while follow-ups are pending, clearing the guard at the end. */
async function runSyncChain(rt: SdkRuntime, coord: RuntimeCoordination): Promise<number> {
  let height = 0;
  try {
    do {
      coord.pendingSync = false;
      height = await syncOnce(rt);
    } while (coord.pendingSync);
  } finally {
    coord.inFlightSync = null;
    coord.pendingSync = false;
  }
  return height;
}

/**
 * Advance `rt`'s live state to the network tip via a manual sync loop
 * (`getWalletSyncData` → `scanTransactionOutputsAndDeposits` → apply), then
 * persist when the state advanced. Returns the network height.
 *
 * A manual loop (rather than `createWalletSync`) keeps the synced state inside the
 * single encrypted `"wallet"` blob — `createWalletSync`'s own persistence writes a
 * separate plaintext record under a different key, which we deliberately avoid.
 *
 * Bound to `rt` (NOT `requireRuntime()`): folds + persists into THAT wallet even if
 * the user switches the active wallet mid-scan. Not called concurrently for the same
 * wallet — {@link syncRuntime} serializes all callers onto it.
 */
// Runtimes whose mempool-pool RPC has already failed once — used to warn a single time
// per runtime instead of on every background poll when a daemon lacks the pool RPC (#109).
const poolScanWarned = new WeakSet<SdkRuntime>();

async function syncOnce(rt: SdkRuntime): Promise<number> {
  // Await WASM crypto init before scanTransactionOutputsAndDeposits / ring math.
  await ensureSdkReady();
  const height = await rt.daemon.getHeight();
  const batchSize = 100;
  // Coinbase (miner) outputs are scanned only when the wallet opts in (solo mining).
  const includeMinerTxs = Boolean(rt.raw.options?.checkMinerTx);
  // Resume from a re-scan window below the last scanned height (see RESCAN_LAG_BLOCKS),
  // floored at the wallet's seed/creation height so we never scan pre-existence blocks.
  const seedFloor = Math.max(0, (Number(rt.raw.creationHeight ?? 0) || 0) - 1);
  let scanned = Math.max(seedFloor, rt.state.scannedHeight - RESCAN_LAG_BLOCKS);
  const startState = rt.state;
  let state = rt.state;

  // Our own outbound message txs already live in `sentMessages`; never reclassify
  // them as inbound. Build the received-message set keyed by tx hash for dedupe.
  const sentHashes = new Set(readSentRecords(rt.raw).map((record) => record.id));
  const received = new Map<string, SdkMessageRecord>(
    readReceivedRecords(rt.raw).map((record) => [record.id, record] as const),
  );
  let receivedChanged = false;

  while (scanned < height) {
    const startBlock = scanned + 1;
    const endBlock = Math.min(startBlock + batchSize - 1, height);
    const rawTransactions = await rt.daemon.getWalletSyncData(
      startBlock,
      endBlock,
      includeMinerTxs,
    );
    for (const rawTx of rawTransactions) {
      const folded = foldTransaction(state, rawTx, rt.account.keys);
      state = folded.state;

      // Reconstruct any inbound message from this tx's `extra` (deduped by hash).
      if (folded.scanTx !== null) {
        const txHash = typeof folded.scanTx.hash === "string" ? folded.scanTx.hash : "";
        if (txHash && !received.has(txHash)) {
          const inbound = reconstructReceivedMessage(folded.scanTx, rt.account.keys, {
            sentHashes,
            timestamp: rawTx.timestamp,
          });
          if (inbound !== null) {
            received.set(inbound.id, inbound);
            receivedChanged = true;
          }
        }
      }
    }
    scanned = endBlock;
    // Publish progress after each batch (never backwards) so a concurrent read — the
    // polled getWalletInfo — sees `currentHeight` climb block-by-block during a long
    // initial scan or a height-reset re-scan, instead of jumping only when the whole
    // catch-up finishes. In-memory only; the encrypted persist still happens once below.
    // BUT only when something actually changed this batch — the cursor advanced, or a
    // tx folded — so an idle at-tip re-scan (the lag window with no new tx) never
    // allocates a new state and never triggers a persist (no per-poll write churn).
    const cursorAdvanced = scanned > rt.state.scannedHeight;
    const foldedThisBatch = state !== rt.state;
    if (cursorAdvanced || foldedThisBatch) {
      state = { ...state, scannedHeight: Math.max(rt.state.scannedHeight, scanned) };
      rt.state = state;
    }
  }

  // The per-batch publish advances rt.state only on real change, so `rt.state !==
  // startState` means this scan genuinely advanced/folded something — persist iff so.
  const stateChanged = rt.state !== startState;
  if (receivedChanged) {
    rt.raw = withReceivedRecords(rt.raw, [...received.values()]);
  }

  // Reconcile optimistic pending sends: drop any whose tx is now scanned into state
  // (mined), or that have expired without ever mining (#96).
  const currentPending = readPendingRecords(rt.raw);
  let pendingChanged = false;
  if (currentPending.length > 0) {
    const survivors = prunePendingRecords(rt.raw, rt.state, Date.now());
    if (survivors.length !== currentPending.length) {
      rt.raw = withPendingRecords(rt.raw, survivors);
      pendingChanged = true;
    }
  }

  if (stateChanged || receivedChanged || pendingChanged) {
    // Persist the mined-block results FIRST, before the optional mempool poll: a slow (or
    // hanging) pool RPC must never delay or block the durable write of freshly-mined state
    // (#109 review — GLM-M1 / Codex-1).
    await persistRuntime(rt);
  }

  // Incoming pending (#109): scan the daemon mempool for outputs owned by THIS wallet so a
  // payment addressed to us shows (0-conf row + "pending in" balance) before it mines,
  // reconciled by hash once it does. The pool FETCH is best-effort — a daemon without the
  // RPC, or any fetch/scan error, must never break the mined sync above — but the RECONCILE
  // runs regardless of fetch success, so mined / TTL-expired entries are still dropped when
  // the pool is transiently unreachable (#109 review — Codex-2). One clock for the pass.
  const nowMs = Date.now();
  let scannedIncoming: IncomingPendingRecord[] = [];
  try {
    const poolTxs = await rt.daemon.getTransactionsPool();
    // The wallet may have been locked/torn down during the await — re-check before scanning.
    if (rt.account) {
      scannedIncoming = scanPoolForOwned(
        poolTxs,
        toScanTransaction,
        txns.scanTransactionOutputs,
        rt.account.keys,
        nowMs,
      );
    }
  } catch (error) {
    // Warn once per runtime — a daemon lacking the pool RPC would otherwise log on every
    // poll (#109 review — GLM-H2 / Gemini / Codex-4).
    if (!poolScanWarned.has(rt)) {
      poolScanWarned.add(rt);
      console.warn("Incoming-pending pool scan unavailable (non-fatal, silenced):", error);
    }
  }
  const beforeIncoming = readIncomingPendingRecords(rt.raw);
  const nextIncoming = reconcileIncomingPending(beforeIncoming, scannedIncoming, rt.state, nowMs);
  if (nextIncoming !== beforeIncoming) {
    rt.raw = withIncomingPendingRecords(rt.raw, nextIncoming);
    await persistRuntime(rt);
  }

  return height;
}

/**
 * Fold one raw daemon transaction into `state` (scan outputs/deposits + spends),
 * returning the new state and the parsed scan transaction (for message recovery).
 * `scanTx` is `null` when the daemon slot has no usable `extra`/`vout`.
 */
function foldTransaction(
  state: WalletState,
  rawTx: DaemonRawTransaction,
  keys: WalletKeys,
): { state: WalletState; scanTx: txns.RawTransaction | null } {
  const inner = rawTx.transaction;
  if (!inner || typeof inner !== "object") return { state, scanTx: null };

  const scanTx = toScanTransaction(rawTx);
  if (scanTx === null) return { state, scanTx: null };

  const { outputs: ownedOutputs, deposits: ownedDeposits } = txns.scanTransactionOutputsAndDeposits(
    scanTx,
    keys,
  );
  const inputKeyImages = extractInputKeyImages(inner);
  const depositInputs = extractDepositInputs(inner);
  const candidateDeposits =
    ownedDeposits.length > 0 ? [...state.deposits, ...ownedDeposits] : state.deposits;
  const withdrawnIndexes = findWithdrawnDepositIndexes(depositInputs, candidateDeposits);

  if (
    ownedOutputs.length === 0 &&
    inputKeyImages.length === 0 &&
    ownedDeposits.length === 0 &&
    withdrawnIndexes.length === 0
  ) {
    return { state, scanTx };
  }

  let next = applyScannedTransaction(
    state,
    { hash: scanTx.hash, height: scanTx.height, timestamp: rawTx.timestamp },
    ownedOutputs,
    inputKeyImages,
  );
  if (ownedDeposits.length > 0 || withdrawnIndexes.length > 0) {
    next = applyScannedDeposits(next, ownedDeposits, withdrawnIndexes);
  }
  return { state: next, scanTx };
}

// The SDK does not export `toScanTransaction`/`extractInputKeyImages`/
// `extractDepositInputs` (they are sync-internal), so the daemon→scan bridge is
// reproduced here against the documented daemon shapes. Folding itself reuses the
// SDK's exported `applyScannedTransaction`/`applyScannedDeposits`.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Daemon `transaction` → the SDK scanner's {@link txns.RawTransaction}, or `null`. */
function toScanTransaction(rawTx: DaemonRawTransaction): txns.RawTransaction | null {
  const inner = rawTx.transaction;
  if (!isRecord(inner)) return null;

  const extra = normalizeExtra(inner.extra);
  if (extra === null) return null;
  const vout = normalizeVout(inner.vout);
  if (vout === null) return null;

  return {
    extra,
    vout,
    ...(rawTx.outputIndexes.length > 0 ? { outputIndexes: rawTx.outputIndexes } : {}),
    ...(rawTx.hash ? { hash: rawTx.hash } : {}),
    ...(typeof rawTx.height === "number" ? { height: rawTx.height } : {}),
  };
}

function normalizeExtra(extra: unknown): string | null {
  if (typeof extra === "string") return extra;
  if (Array.isArray(extra)) {
    let hex = "";
    for (const byte of extra) {
      if (typeof byte !== "number" || byte < 0 || byte > 255) return null;
      hex += byte.toString(16).padStart(2, "0");
    }
    return hex;
  }
  return null;
}

function normalizeVout(vout: unknown): txns.RawTransactionOutput[] | null {
  if (!Array.isArray(vout)) return null;
  const outputs: txns.RawTransactionOutput[] = [];
  for (const out of vout) {
    if (!isRecord(out)) return null;
    const target = out.target;
    if (!isRecord(target)) return null;
    const type = target.type;
    const data = target.data;
    if (typeof type !== "string" || !isRecord(data)) return null;
    outputs.push({
      amount: typeof out.amount === "number" ? out.amount : 0,
      target: {
        type,
        data: {
          ...(typeof data.key === "string" ? { key: data.key } : {}),
          ...(Array.isArray(data.keys)
            ? { keys: data.keys.filter((k): k is string => typeof k === "string") }
            : {}),
          ...(typeof data.term === "number" ? { term: data.term } : {}),
        },
      },
    });
  }
  return outputs;
}

function extractInputKeyImages(transaction: unknown): string[] {
  if (!isRecord(transaction)) return [];
  const vin = transaction.vin;
  if (!Array.isArray(vin)) return [];
  const keyImages: string[] = [];
  for (const input of vin) {
    if (!isRecord(input)) continue;
    const direct = input.k_image;
    if (typeof direct === "string" && direct.length > 0) {
      keyImages.push(direct);
      continue;
    }
    const value = input.value;
    if (isRecord(value) && typeof value.k_image === "string" && value.k_image.length > 0) {
      keyImages.push(value.k_image);
    }
  }
  return keyImages;
}

function extractDepositInputs(transaction: unknown): RawDepositInput[] {
  if (!isRecord(transaction)) return [];
  const vin = transaction.vin;
  if (!Array.isArray(vin)) return [];
  const deposits: RawDepositInput[] = [];
  for (const input of vin) {
    if (!isRecord(input)) continue;
    const source = isRecord(input.value) ? input.value : input;
    const type = input.type ?? source.type;
    if (type !== "input_to_deposit_key" && type !== "03") continue;
    const outputIndex = source.outputIndex;
    const term = source.term;
    deposits.push({
      type: "input_to_deposit_key",
      ...(typeof outputIndex === "number" ? { outputIndex } : {}),
      ...(typeof term === "number" ? { term } : {}),
    });
  }
  return deposits;
}

/** Decoys returned by the daemon are already the {@link DecoySet} shape. */
export function decoysFromDaemon(outs: DaemonRandomOutsForAmount[]): txns.DecoySet[] {
  return outs.map((entry) => ({
    amount: entry.amount,
    outs: entry.outs.map((out) => ({ globalIndex: out.globalIndex, publicKey: out.publicKey })),
  }));
}

// Serialize writes PER WALLET: chain each persist after the previous one for the SAME
// wallet so two concurrent persists (e.g. a sync-triggered save racing an address-book
// save) never interleave their encrypt+write. Each write snapshots the LATEST
// `rt.raw`/state at the moment it actually runs, so the freshest data wins. The chain
// lives in the wallet's `coordination` entry, so a persist bound to wallet A never
// serializes against (or writes into) wallet B.

/** Persist the ACTIVE runtime's current `raw` to its keyspace. */
export function persist(): Promise<void> {
  return persistRuntime(requireRuntime());
}

/** Persist a SPECIFIC runtime's current `raw` (with the latest serialized state). */
export function persistRuntime(rt: SdkRuntime): Promise<void> {
  const coord = coordinationFor(runtimeId(rt));
  const run = coord.persistChain.then(
    () => persistNow(rt),
    () => persistNow(rt),
  );
  // Keep the chain alive even if a write rejects (the next persist still runs);
  // callers still see this write's own rejection via the returned promise.
  coord.persistChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Encrypt + write a runtime's current blob + serialized state (no concurrency guard). */
async function persistNow(rt: SdkRuntime): Promise<void> {
  const raw: RawWalletV1 = {
    ...rt.raw,
    [SDK_STATE_FIELD]: serializeWalletState(rt.state),
    lastHeight: Math.max(Number(rt.raw.lastHeight ?? 0) || 0, rt.state.scannedHeight),
  };
  rt.raw = raw;
  // Persist into THIS wallet's keyspace. `rt.storage` is set on unlock/adopt; fall
  // back to the active wallet's storage for runtimes installed without it (e.g.
  // `_setRuntimeForTest`). Binding to `rt.storage` (not the live active wallet) is
  // what keeps A's data out of B's keyspace after a mid-flight switch.
  const storage = rt.storage ?? (await getActiveWalletStorage());
  await saveStoredWallet(storage, raw, rt.password);
}

/**
 * Lock the wallet — drop ALL cached runtimes (keys are never kept in session).
 * SECURITY: clears EVERY unlocked wallet's keys, not just the active one, so a lock
 * leaves no decrypted material in memory. Resets all per-wallet sync/persist state;
 * any in-flight scan settles on its own and then `requireRuntime()` throws.
 */
export function lock(): void {
  clearAllRuntimes();
}

/** Lock + clear all runtimes (the SDK engine runs no workers / timers to stop). */
export async function disconnect(): Promise<void> {
  lock();
  await Promise.resolve();
}

/**
 * Remove the ACTIVE wallet (delete / panic-wipe): erase its keyspace and drop it
 * from the registry, reassigning active to a survivor. With no registry yet
 * (legacy single-wallet), fall back to erasing the bare `"wallet"` record.
 */
export async function removeStoredWallet(): Promise<void> {
  const active = await getActiveWallet();
  if (active) {
    await unregisterWallet(active.id);
    dropCachedRuntime(active.id);
  } else {
    await getActiveWalletStorage().then((storage) => storage.removeItem("wallet"));
    dropCachedRuntime(DEFAULT_WALLET_ID);
  }
}

/** Drop a single wallet's cached runtime + coordination (e.g. on remove). */
function dropCachedRuntime(id: string): void {
  runtimes.delete(id);
  coordination.delete(id);
  if (activeId === id) {
    activeId = null;
  }
}

// --- multi-wallet helpers (#95) --------------------------------------------
// The wallet service calls these to back the switcher / management UI. They
// operate on the registry + the runtime cache. Switching is now INSTANT when the
// target wallet is already cached; removing the active wallet drops its keys.

/** All registered wallets' metadata (for the switcher / settings list). */
export async function listWalletMetas(): Promise<WalletMeta[]> {
  return (await readWalletsIndex()).wallets;
}

/** The active wallet's id. */
export async function activeWalletId(): Promise<string> {
  return (await readWalletsIndex()).activeId;
}

/**
 * Switch the active wallet: set the active id ONLY. Does NOT lock or clear any
 * cached runtime — switching to an already-unlocked wallet is therefore instant.
 * A wallet that is not yet cached is unlocked in place by the UI afterward.
 */
export async function switchActiveWallet(id: string): Promise<void> {
  await setActiveWallet(id);
  if (runtimes.has(id)) {
    activeId = id;
  }
}

/** Rename a wallet (label only). */
export async function renameWallet(id: string, label: string): Promise<void> {
  await updateWallet(id, { label });
}

/** Remove a wallet by id; drops its cached runtime (keys) before erasing it. */
export async function removeWalletById(id: string): Promise<void> {
  dropCachedRuntime(id);
  await unregisterWallet(id);
}

/** A user-safe message from an unknown thrown value. */
export function friendlyMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Unexpected error.";
}
