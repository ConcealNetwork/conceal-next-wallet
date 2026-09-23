// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

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
 *
 * changePassword holds an exclusive {@link RuntimeCoordination.persistPaused}
 * queue and the process-wide Argon2 FIFO mutex — see wallet-change-password spec.
 */
import {
  deserializeWalletState,
  type EncryptedWalletEnvelope,
  type RawWalletV1,
  type StorageAdapter,
  serializeWalletState,
} from "conceal-wallet-sdk";
import {
  openEncryptedWallet,
  parseEncryptedWalletJson,
  saveStoredWallet,
} from "@/lib/services/real-sdk/envelope";
import {
  allUnlockedRuntimes,
  coordinationFor,
  isLiveRuntime,
  requireRuntime,
  runtimeId,
  type SdkRuntime,
} from "@/lib/services/real-sdk/runtime-registry";
import { getActiveWalletStorage } from "@/lib/services/real-sdk/wallets-index";

/** Field we add to the persisted blob to carry the serialized SDK wallet state. */
export const SDK_STATE_FIELD = "sdkWalletState";

/** Process-wide Argon2 FIFO tail — only one heavy encrypt/decrypt at a time. */
let argonTail: Promise<unknown> = Promise.resolve();

/**
 * Run `fn` after prior Argon2 jobs finish (FIFO serialize-wait).
 * @see openspec/changes/envelope-3-sdk/specs/wallet-change-password/spec.md
 */
export function withArgonMutex<T>(fn: () => Promise<T>): Promise<T> {
  const run = argonTail.then(fn, fn);
  argonTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Test-only: reset the Argon2 FIFO so suites start idle. */
export function _resetArgonMutex(): void {
  argonTail = Promise.resolve();
}

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

/** Mark exclusive persist pause for atomic changePassword (mutex must be held). */
export function setPersistPaused(id: string, paused: boolean): void {
  coordinationFor(id).persistPaused = paused;
}

/**
 * Drop queued checkpoints without clearing pause or writing.
 * Failed-rollback path: discard while mutex held; clear pause only after mutex drops.
 * @see wallet-change-password spec — never blind-persist onto an unverified blob.
 */
export function discardPaused(id: string): void {
  const coord = coordinationFor(id);
  const batch = coord.pausedQueue.splice(0);
  for (const entry of batch) {
    entry.reject(new Error("Persist discarded after inconsistent wallet blob."));
  }
}

/**
 * Run queued persists after pause is cleared and the Argon2 mutex is released.
 * Never call while holding either lock.
 */
export async function drainPaused(id: string): Promise<void> {
  const coord = coordinationFor(id);
  const batch = coord.pausedQueue.splice(0);
  for (const entry of batch) {
    try {
      await persistRuntime(entry.rt);
      entry.resolve();
    } catch (error) {
      entry.reject(error);
    }
  }
}

/** Persist a SPECIFIC runtime's current `raw` (with the latest serialized state). */
export function persistRuntime(rt: SdkRuntime): Promise<void> {
  // Deleted / locked handles must not recreate coordination or write the blob back.
  if (!isLiveRuntime(rt)) return Promise.resolve();
  const coord = coordinationFor(runtimeId(rt));
  if (coord.persistPaused) {
    // Queue only — must not take Argon2 while paused.
    return new Promise<void>((resolve, reject) => {
      coord.pausedQueue.push({ rt, resolve, reject });
    });
  }
  const run = coord.persistChain.then(
    () => withArgonMutex(() => persistNow(rt)),
    () => withArgonMutex(() => persistNow(rt)),
  );
  // Keep the chain alive even if a write rejects (the next persist still runs);
  // callers still see this write's own rejection via the returned promise.
  coord.persistChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Lock-free encrypt+write with an explicit password (changePassword path).
 * Caller MUST already hold the Argon2 mutex; do not call via {@link persist}.
 */
export async function writeWalletBlob(rt: SdkRuntime, password: string): Promise<void> {
  if (!isLiveRuntime(rt)) return;
  const raw: RawWalletV1 = {
    ...rt.raw,
    [SDK_STATE_FIELD]: serializeWalletState(rt.state),
    lastHeight: Math.max(Number(rt.raw.lastHeight ?? 0) || 0, rt.state.scannedHeight),
  };
  rt.raw = raw;
  const storage = rt.storage ?? (await getActiveWalletStorage());
  if (!isLiveRuntime(rt)) return;
  try {
    await saveStoredWallet(storage, raw, password);
  } catch (error) {
    if (error instanceof RangeError && /password UTF-8 length/i.test(error.message)) {
      throw new Error("Password is too long.");
    }
    throw error;
  }
}

/** Lock-free reopen-from-storage check (typed parse; no mutex). */
export async function blobOpensWith(storage: StorageAdapter, password: string): Promise<boolean> {
  const stored = await storage.getItem("wallet");
  if (stored === null) return false;
  try {
    const text = stored.replace(/^\uFEFF/, "").trim();
    const envelope = parseEncryptedWalletJson(text);
    if (envelope === null) return false;
    return openEncryptedWallet(envelope as EncryptedWalletEnvelope, password) !== null;
  } catch {
    return false;
  }
}

/** Encrypt + write a runtime's current blob + serialized state (no concurrency guard). */
async function persistNow(rt: SdkRuntime): Promise<void> {
  if (!isLiveRuntime(rt)) return;
  await writeWalletBlob(rt, rt.password);
}
