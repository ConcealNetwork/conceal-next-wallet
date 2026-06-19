/**
 * Module-level singleton runtime for the SDK wallet engine — the SDK analogue of
 * the legacy `window.__ccxRuntimeWallet`. It holds the unlocked wallet's account
 * (keys + address), the persisted {@link RawWalletV1} blob, the live SDK
 * {@link WalletState} (synced outputs/deposits/txs/scannedHeight), the daemon
 * client, and the password — and owns unlock / sync / persist / lock.
 *
 * STATE + PERSISTENCE MODEL
 * -------------------------
 * Everything lives inside the ONE encrypted `"wallet"` blob (so a single
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
  hasStoredWallet as sdkHasStoredWallet,
  openStoredWallet,
  type RawDepositInput,
  type RawWalletV1,
  saveStoredWallet,
  serializeWalletState,
  transactions as txns,
  type UserKeys,
  type WalletKeys,
  type WalletState,
} from "conceal-wallet-sdk";
import { DEFAULT_DAEMON_NODES } from "@/lib/config/config";
import {
  reconstructReceivedMessage,
  readReceivedRecords,
  readSentRecords,
  type SdkMessageRecord,
  withReceivedRecords,
} from "@/lib/services/real-sdk/messages-store";
import { seedStateFromLegacyBlob } from "@/lib/services/real-sdk/legacy-state-seed";
import { ensureSdkReady } from "@/lib/services/real-sdk/ready";
import { getSdkWalletStorage } from "@/lib/services/real-sdk/storage";

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

/** A live, unlocked SDK wallet runtime. */
export interface SdkRuntime {
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
}

let runtime: SdkRuntime | null = null;

/** The current unlocked runtime, or `null` when locked. */
export function getRuntime(): SdkRuntime | null {
  return runtime;
}

/** The current unlocked runtime, or throw a friendly "not open" error. */
export function requireRuntime(): SdkRuntime {
  if (runtime === null) {
    throw new Error("Wallet is not open. Unlock the wallet and try again.");
  }
  return runtime;
}

/** True when a wallet is unlocked. */
export function isUnlocked(): boolean {
  return runtime !== null;
}

/** Test-only: install a runtime directly (bypassing unlock/storage). */
export function _setRuntimeForTest(next: SdkRuntime | null): void {
  runtime = next;
}

/** Whether a stored wallet exists on this device (does not decrypt it). */
export function hasStoredWallet(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return sdkHasStoredWallet(getSdkWalletStorage());
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
 * Unlock the stored wallet with `password`. Returns the live runtime, or throws a
 * friendly error on a wrong password / missing wallet. Does NOT sync — the caller
 * (`getWalletInfo`/`refreshWallet`) drives sync explicitly.
 */
export async function unlock(password: string): Promise<SdkRuntime> {
  if (!password) {
    throw new Error("Password is required to open a stored wallet.");
  }
  // Await WASM crypto init before openStoredWallet → buildAccount derive keys.
  await ensureSdkReady();
  const storage = getSdkWalletStorage();
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

  runtime = { account, raw: opened.raw, state, daemon, password, viewOnly };
  return runtime;
}

/**
 * Adopt a freshly created/imported/restored wallet into the runtime and persist
 * it as a NEW stored blob. Used by create / import paths after building `raw`.
 */
export async function adopt(input: {
  raw: RawWalletV1;
  keys: UserKeys;
  password: string;
}): Promise<SdkRuntime> {
  // Await WASM crypto init before buildAccount/buildState derive the address.
  await ensureSdkReady();
  const account = buildAccount(input.keys);
  const state = buildState(account, input.raw);
  const daemon = buildDaemon(nodeUrlFromRaw(input.raw));
  const viewOnly = !input.keys.priv.spend;

  runtime = { account, raw: input.raw, state, daemon, password: input.password, viewOnly };
  await persist();
  return runtime;
}

// --- sync concurrency guard ------------------------------------------------
// `sync()` reads `rt.state` at entry and writes it back at the end, so two scans
// running concurrently (auto-refresh + manual refresh, or a send-triggered
// re-sync) would each capture the same starting state and the last writer would
// clobber the other — losing txs / reverting `scannedHeight` / racing `persist`.
// To serialize: callers chain onto a single in-flight scan. While a scan runs, a
// later caller marks a pending re-run so its intent (catch up AFTER the current
// finishes — e.g. to see a just-broadcast tx) is honored exactly once, rather than
// starting a parallel scan.

let inFlightSync: Promise<number> | null = null;
let pendingSync = false;

/**
 * Advance the live state to the network tip, serialized against concurrent calls.
 * Never runs two scans at once: if a scan is in flight, the caller awaits it and
 * (because its data may predate this call) a single follow-up scan is queued.
 * Returns the network height observed by the scan the caller ultimately awaits.
 */
export async function sync(): Promise<number> {
  // Idle → start a fresh scan.
  if (inFlightSync === null) {
    inFlightSync = runSyncChain();
    return inFlightSync;
  }
  // A scan is already running. Queue exactly one follow-up scan so this caller's
  // intent to catch up AFTER the current scan is honored, then await it.
  pendingSync = true;
  return inFlightSync;
}

/** Run scans back-to-back while follow-ups are pending, clearing the guard at the end. */
async function runSyncChain(): Promise<number> {
  let height = 0;
  try {
    do {
      pendingSync = false;
      height = await syncOnce();
    } while (pendingSync);
  } finally {
    inFlightSync = null;
    pendingSync = false;
  }
  return height;
}

/**
 * Advance the live state to the network tip via a manual sync loop
 * (`getWalletSyncData` → `scanTransactionOutputsAndDeposits` → apply), then
 * persist when the state advanced. Returns the network height.
 *
 * A manual loop (rather than `createWalletSync`) keeps the synced state inside the
 * single encrypted `"wallet"` blob — `createWalletSync`'s own persistence writes a
 * separate plaintext record under a different key, which we deliberately avoid.
 *
 * Not called concurrently — {@link sync} serializes all callers onto it.
 */
async function syncOnce(): Promise<number> {
  const rt = requireRuntime();
  // Await WASM crypto init before scanTransactionOutputsAndDeposits / ring math.
  await ensureSdkReady();
  const height = await rt.daemon.getHeight();
  const batchSize = 100;
  // Coinbase (miner) outputs are scanned only when the wallet opts in (solo mining).
  const includeMinerTxs = Boolean(rt.raw.options?.checkMinerTx);
  let scanned = rt.state.scannedHeight;
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
    state = { ...state, scannedHeight: scanned };
  }

  const stateChanged = state !== rt.state;
  if (stateChanged) {
    rt.state = state;
  }
  if (receivedChanged) {
    rt.raw = withReceivedRecords(rt.raw, [...received.values()]);
  }
  if (stateChanged || receivedChanged) {
    await persist();
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

// Serialize writes: chain each persist after the previous one so two concurrent
// persists (e.g. a sync-triggered save racing an address-book save) never
// interleave their encrypt+write. Each write snapshots the LATEST `rt.raw`/state
// at the moment it actually runs, so the freshest data wins.
let persistChain: Promise<void> = Promise.resolve();

/** Persist the runtime's current `raw` (with the latest serialized state) to storage. */
export function persist(): Promise<void> {
  const run = persistChain.then(
    () => persistNow(),
    () => persistNow(),
  );
  // Keep the chain alive even if a write rejects (the next persist still runs);
  // callers still see this write's own rejection via the returned promise.
  persistChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Encrypt + write the runtime's current blob + serialized state (no concurrency guard). */
async function persistNow(): Promise<void> {
  const rt = runtime;
  if (rt === null) return;
  const raw: RawWalletV1 = {
    ...rt.raw,
    [SDK_STATE_FIELD]: serializeWalletState(rt.state),
    lastHeight: Math.max(Number(rt.raw.lastHeight ?? 0) || 0, rt.state.scannedHeight),
  };
  rt.raw = raw;
  await saveStoredWallet(getSdkWalletStorage(), raw, rt.password);
}

/** Lock the wallet — drop the in-memory runtime (keys are never kept in session). */
export function lock(): void {
  runtime = null;
  // Clear the sync coalescing flag; the in-flight promise (if any) settles on its
  // own and `requireRuntime()` then throws for a locked wallet.
  pendingSync = false;
}

/** Lock + clear the runtime (the SDK engine runs no workers / timers to stop). */
export async function disconnect(): Promise<void> {
  lock();
  await Promise.resolve();
}

/** Remove the stored wallet record (delete / panic-wipe). */
export async function removeStoredWallet(): Promise<void> {
  await getSdkWalletStorage().removeItem("wallet");
}

/** A user-safe message from an unknown thrown value. */
export function friendlyMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Unexpected error.";
}
