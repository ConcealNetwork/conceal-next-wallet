/**
 * Persistence for the SDK engine: encrypt + write a runtime's wallet blob (keys,
 * options, contacts, messages AND the serialized {@link WalletState}) into THAT
 * wallet's keyspace, plus the durable sync-checkpoint flush. Split out of
 * `runtime.ts` so the sync engine (`sync-engine.ts`) checkpoints through this
 * module without runtime.ts owning the write machinery itself.
 *
 * Writes serialize PER WALLET: each persist chains onto the wallet's
 * `coordination.persistChain` so two concurrent persists (e.g. a sync-triggered
 * save racing an address-book save) never interleave their encrypt+write. Each
 * write snapshots the LATEST `rt.raw`/state at the moment it actually runs, so the
 * freshest data wins. A persist bound to wallet A never serializes against (or
 * writes into) wallet B.
 */
import {
  deserializeWalletState,
  type RawWalletV1,
  saveStoredWallet,
  serializeWalletState,
} from "conceal-wallet-sdk";
import { getActiveWalletStorage } from "@/lib/services/real-sdk/wallets-index";
import {
  type SdkRuntime,
  allUnlockedRuntimes,
  coordinationFor,
  requireRuntime,
  runtimeId,
} from "@/lib/services/real-sdk/runtime-registry";

/** Field we add to the persisted blob to carry the serialized SDK wallet state. */
export const SDK_STATE_FIELD = "sdkWalletState";

/** Persist the ACTIVE runtime's current `raw` to its keyspace. */
export function persist(): Promise<void> {
  return persistRuntime(requireRuntime());
}

/**
 * Durable cursor already on the blob. Prefer serialized `sdkWalletState` —
 * `raw.lastHeight` is a monotonic max and stays at the pre-rescan tip while
 * a settings rescan climbs back up (PR #313 review).
 */
function savedScanHeight(rt: SdkRuntime): number {
  try {
    const saved = deserializeWalletState(String(rt.raw[SDK_STATE_FIELD] ?? ""));
    if (saved.address === rt.account.address) return saved.scannedHeight;
  } catch {
    // Legacy or corrupt blob — lastHeight is the only durable cursor.
  }
  return Math.max(0, Number(rt.raw.lastHeight ?? 0) || 0);
}

/**
 * Best-effort durable flush of in-flight sync progress for every unlocked
 * runtime. Called on tab hide / lock. Idempotent — no-op if locked or nothing
 * advanced past the saved cursor.
 */
export async function flushSyncCheckpoint(): Promise<void> {
  for (const rt of allUnlockedRuntimes()) {
    if (rt.state.scannedHeight <= savedScanHeight(rt)) continue;
    try {
      await persistRuntime(rt);
    } catch {
      // Best-effort per wallet — one failed write must not block the rest.
    }
  }
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
