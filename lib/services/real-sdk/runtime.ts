// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

/**
 * Per-wallet runtime LIFECYCLE for the SDK wallet engine — unlock/adopt, lock/
 * disconnect, wallet-state (re)construction, and the multi-wallet helpers, plus
 * the public façade re-exporting the extracted subsystems:
 *
 *   - `runtime-registry.ts` — the runtime cache + per-wallet sync/persist coordination
 *   - `sync-engine.ts`      — fetch strategies, the manual `syncOnce` loop, checkpoints
 *   - `persistence.ts`      — encrypted blob writes + the durable sync-checkpoint flush
 *   - `daemon-node.ts`      — node resolution + daemon client construction
 *
 * Instead of a single unlocked wallet, the engine keeps a `Map` of unlocked
 * {@link SdkRuntime}s keyed by wallet id (see `runtime-registry.ts`), plus the id
 * of the currently `active` one. Switching to an ALREADY-UNLOCKED wallet is then
 * instant — no re-open, no password — while switching to one that isn't cached
 * unlocks it in place.
 *
 * SECURITY: `lock()` / `disconnect()` (and the idle auto-lock that calls
 * `disconnect()`) drop the ENTIRE cached registry, so no decrypted wallet keys for
 * ANY cached wallet survive a lock.
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
 *   - During a DEEP catch-up the blob is also checkpointed every 1000 blocks
 *     (`maybeCheckpoint` in `sync-engine.ts`) so a mid-scan kill resumes from that
 *     cursor (inbound messages are flushed onto `raw` before each write).
 *     Incremental polls still persist once at the end of the sync loop.
 *
 * INBOUND MESSAGES: the SDK `WalletState` discards tx `extra`, so during each sync
 * scan the engine also reconstructs received messages (`readMessageFromTransaction`)
 * and persists them into `raw.receivedMessages` (deduped by tx hash) — so a full
 * re-sync of an existing legacy wallet rebuilds its inbound message history too.
 *
 * No `lib/wallet-core` import anywhere here — the whole point of the engine.
 */
import {
  type Account,
  createWalletState,
  deserializeWalletState,
  encodeAddress,
  openStoredWallet,
  type RawWalletV1,
  type UserKeys,
  type WalletKeys,
  type WalletState,
} from "conceal-wallet-sdk";
import { buildDaemon, nodeUrlFromRaw } from "@/lib/services/real-sdk/daemon-node";
import { seedStateFromLegacyBlob } from "@/lib/services/real-sdk/legacy-state-seed";
import {
  flushSyncCheckpoint as flushSyncCheckpointInternal,
  persist as persistInternal,
  SDK_STATE_FIELD,
} from "@/lib/services/real-sdk/persistence";
import { ensureSdkReady } from "@/lib/services/real-sdk/ready";
import {
  activateRuntime,
  clearAllRuntimes,
  dropCachedRuntime,
  getCachedRuntime,
  type SdkRuntime,
  setRuntime,
} from "@/lib/services/real-sdk/runtime-registry";
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

export { buildDaemon, defaultNodeUrl, nodeUrlFromRaw } from "@/lib/services/real-sdk/daemon-node";
export {
  flushSyncCheckpoint,
  persist,
  persistRuntime,
} from "@/lib/services/real-sdk/persistence";
// --- public façade: the extracted subsystems keep flowing through this module ---
export {
  _setRuntimeForTest,
  getRuntime,
  hasUnlockedRuntime,
  isUnlocked,
  type RuntimeCoordination,
  requireRuntime,
  type SdkRuntime,
  unlockedNonActiveRuntimes,
} from "@/lib/services/real-sdk/runtime-registry";
export {
  fetchSyncRange,
  fetchVerifiedRange,
  maybeCheckpoint,
  sync,
  syncRuntime,
} from "@/lib/services/real-sdk/sync-engine";

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

/** Whether ANY stored wallet exists on this device (does not decrypt them). */
export async function hasStoredWallet(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  return (await readWalletsIndex()).wallets.length > 0;
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
  const cached = getCachedRuntime(id);
  if (cached) {
    activateRuntime(id);
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
  activateRuntime(id);
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
  activateRuntime(meta.id);
  await persistInternal();
  return rt;
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
  try {
    await flushSyncCheckpointInternal();
  } catch {
    // Best-effort — lock must still drop keys if the write fails.
  }
  lock();
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
  activateRuntime(id);
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
