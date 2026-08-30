/**
 * Multi-wallet registry for the SDK engine. Multiple encrypted wallets coexist in the
 * one IndexedDB store (`mydb`/`storage`) without colliding:
 *
 *   - The DEFAULT wallet keeps the bare `"wallet"` key (`namespace: ""`) so every
 *     wallet created before multi-wallet — and the legacy `wallet-core` blob — opens
 *     unchanged. There is at most one default.
 *   - Every ADDITIONAL wallet gets its own key prefix via the SDK's
 *     {@link createNamespacedStorage} (keys become `<id>:<key>`), so its envelope,
 *     sdkWalletState, messages and pending records never touch another wallet's.
 *
 * A single `"wallets-index"` record (on the raw adapter) holds the registry +
 * `activeId`. On first read it MIGRATES: an existing bare `"wallet"` blob with no index
 * is registered as the default entry, so upgrading is seamless and lossless.
 *
 * Pure storage plumbing — no runtime/network/`wallet-core` imports.
 */
import { createNamespacedStorage, type StorageAdapter } from "conceal-wallet-sdk";
import { getSdkWalletStorage } from "@/lib/services/real-sdk/storage";

/** Registry record key on the raw adapter (never namespaced). */
const INDEX_KEY = "wallets-index";
/** The bare envelope key used by the default wallet + every legacy blob. */
const LEGACY_WALLET_KEY = "wallet";
/** Stable id of the default (bare-key) wallet. */
export const DEFAULT_WALLET_ID = "default";

/**
 * A namespaced wallet-envelope key `<id>:wallet` on the RAW adapter, where `<id>` is a
 * wallet id from {@link newWalletId}: a UUID (browser `randomUUID`) or 32 hex chars
 * (the older 16-random-bytes fallback). Strict on purpose so SDK namespaces living on
 * the same adapter (e.g. `outbox:<hash>`, `wallets-index`) never match.
 */
const NAMESPACED_WALLET_KEY =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32}):wallet$/;

/** One registered wallet. */
export interface WalletMeta {
  /** Stable id. `"default"` for the bare-key wallet; a UUID for namespaced wallets. */
  id: string;
  /** User-facing label (editable). */
  label: string;
  /** ccx7… address, cached after the first successful open (for the switcher). */
  address?: string;
  /** Storage key prefix: `""` = the bare `"wallet"` key (default); else a namespace. */
  namespace: string;
}

/** The persisted registry. */
export interface WalletsIndex {
  activeId: string;
  wallets: WalletMeta[];
}

function isMeta(value: unknown): value is WalletMeta {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as WalletMeta).id === "string" &&
    typeof (value as WalletMeta).label === "string" &&
    typeof (value as WalletMeta).namespace === "string"
  );
}

/** A UUID for a new namespaced wallet (browser Web Crypto; never on the default). */
function newWalletId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  // Fallback (older environments): 16 random hex bytes.
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Rebuild the registry from what storage actually holds: the bare `"wallet"` blob (the
 * default/legacy wallet) plus every namespaced `<id>:wallet` envelope. Called when the
 * stored `wallets-index` record is missing or unusable so every envelope stays reachable
 * from the switcher. Custom labels and cached addresses are not stored on the envelope —
 * recovered wallets use a default/truncated-id label and the default (or first) wallet
 * becomes active.
 */
async function recoverIndexFromStorage(): Promise<WalletsIndex> {
  const raw = getSdkWalletStorage();
  const keys = await raw.keys();
  const wallets: WalletMeta[] = [];
  if (keys.includes(LEGACY_WALLET_KEY)) {
    wallets.push({ id: DEFAULT_WALLET_ID, label: "Main wallet", namespace: "" });
  }
  for (const key of keys) {
    const match = NAMESPACED_WALLET_KEY.exec(key);
    if (match === null) continue;
    const id = match[1] as string;
    if (wallets.some((w) => w.id === id)) continue;
    wallets.push({ id, label: `Wallet ${id.slice(0, 8)}`, namespace: id });
  }
  if (wallets.length === 0) {
    return { activeId: DEFAULT_WALLET_ID, wallets: [] };
  }
  const active = wallets.find((w) => w.id === DEFAULT_WALLET_ID) ?? wallets[0];
  return { activeId: active.id, wallets };
}

/** One-shot flag: set when the registry was rebuilt from storage envelopes. */
let pendingRecoveryNotice = false;

/** Consume and clear the recovery notice (for a single UI toast per rebuild). */
export function takeWalletsIndexRecoveryNotice(): boolean {
  const pending = pendingRecoveryNotice;
  pendingRecoveryNotice = false;
  return pending;
}

/** Test-only: reset the recovery notice flag. */
export function _resetWalletsIndexRecoveryNotice(): void {
  pendingRecoveryNotice = false;
}

async function persistRecoveredIndex(
  recovered: WalletsIndex,
  notify: boolean,
): Promise<WalletsIndex> {
  await writeWalletsIndex(recovered);
  if (notify) pendingRecoveryNotice = true;
  return recovered;
}

/**
 * Read the registry, MIGRATING on first use: with no usable index, scan storage for
 * wallet envelopes and seed the registry. Always returns a well-formed index.
 */
export async function readWalletsIndex(): Promise<WalletsIndex> {
  const raw = getSdkWalletStorage();
  const stored = await raw.getItem(INDEX_KEY);
  if (stored !== null) {
    try {
      const parsed = JSON.parse(stored) as Partial<WalletsIndex>;
      const wallets = Array.isArray(parsed.wallets) ? parsed.wallets.filter(isMeta) : [];
      if (wallets.length > 0) {
        const activeId = wallets.some((w) => w.id === parsed.activeId)
          ? (parsed.activeId as string)
          : wallets[0].id;
        return { activeId, wallets };
      }
    } catch {
      // Corrupt index — fall through to re-derive from storage.
    }
    // Unusable index (corrupt or wallet-less): re-derive from storage, then persist.
    const recovered = await recoverIndexFromStorage();
    return persistRecoveredIndex(recovered, true);
  }

  // Missing index: scan envelopes. Notify only when namespaced wallets exist — a lone
  // bare `"wallet"` blob is the normal pre-multi-wallet upgrade (silent migration).
  const recovered = await recoverIndexFromStorage();
  if (recovered.wallets.length === 0) {
    return { activeId: DEFAULT_WALLET_ID, wallets: [] };
  }
  const notify = recovered.wallets.some((w) => w.namespace !== "");
  return persistRecoveredIndex(recovered, notify);
}

/** Persist the registry. */
export async function writeWalletsIndex(index: WalletsIndex): Promise<void> {
  await getSdkWalletStorage().setItem(INDEX_KEY, JSON.stringify(index));
}

/** The {@link StorageAdapter} scoped to a wallet's keyspace (raw for the default). */
export function storageForWallet(meta: Pick<WalletMeta, "namespace">): StorageAdapter {
  const raw = getSdkWalletStorage();
  return meta.namespace === "" ? raw : createNamespacedStorage(raw, meta.namespace);
}

/** Find a wallet by id, or `null`. */
export async function findWallet(id: string): Promise<WalletMeta | null> {
  const { wallets } = await readWalletsIndex();
  return wallets.find((w) => w.id === id) ?? null;
}

/** The active wallet's metadata (or `null` when no wallet is registered). */
export async function getActiveWallet(): Promise<WalletMeta | null> {
  const { activeId, wallets } = await readWalletsIndex();
  return wallets.find((w) => w.id === activeId) ?? wallets[0] ?? null;
}

/** Storage scoped to the ACTIVE wallet (raw default when none is registered yet). */
export async function getActiveWalletStorage(): Promise<StorageAdapter> {
  const active = await getActiveWallet();
  return storageForWallet(active ?? { namespace: "" });
}

/** Set the active wallet (no-op when the id isn't registered). */
export async function setActiveWallet(id: string): Promise<void> {
  const index = await readWalletsIndex();
  if (!index.wallets.some((w) => w.id === id)) return;
  await writeWalletsIndex({ ...index, activeId: id });
}

/**
 * Register a NEW wallet and make it active. Returns its {@link WalletMeta}. The first
 * wallet ever (empty registry) takes the bare `"wallet"` key (id `"default"`) for
 * back-compat; every wallet after that gets a namespaced keyspace.
 */
export async function registerWallet(input: {
  label: string;
  address?: string;
}): Promise<WalletMeta> {
  const index = await readWalletsIndex();
  const isFirst = index.wallets.length === 0;
  const meta: WalletMeta = isFirst
    ? { id: DEFAULT_WALLET_ID, label: input.label, namespace: "", ...addr(input.address) }
    : (() => {
        const id = newWalletId();
        return { id, label: input.label, namespace: id, ...addr(input.address) };
      })();
  const wallets = [...index.wallets.filter((w) => w.id !== meta.id), meta];
  await writeWalletsIndex({ activeId: meta.id, wallets });
  return meta;
}

/** Patch a wallet's label/address (e.g. rename, or cache the address after open). */
export async function updateWallet(
  id: string,
  patch: Partial<Pick<WalletMeta, "label" | "address">>,
): Promise<void> {
  const index = await readWalletsIndex();
  const wallets = index.wallets.map((w) => (w.id === id ? { ...w, ...prune(patch) } : w));
  await writeWalletsIndex({ ...index, wallets });
}

/**
 * Remove a wallet: erase its stored records and drop it from the registry. Reassigns
 * `activeId` to a surviving wallet when the active one is removed. Returns the new
 * active id (or `null` when none remain).
 */
export async function unregisterWallet(id: string): Promise<string | null> {
  const index = await readWalletsIndex();
  const target = index.wallets.find((w) => w.id === id);
  if (!target) return index.activeId;

  // Erase the wallet's records from its keyspace. The DEFAULT wallet's storage is the
  // RAW adapter (namespace ""), whose keys() returns the registry AND every other
  // wallet's namespaced keys — so for the default we erase ONLY its envelope key, never
  // iterate. A namespaced adapter's keys() is already scoped to that one wallet.
  if (target.namespace === "") {
    await storageForWallet(target).removeItem(LEGACY_WALLET_KEY);
  } else {
    const storage = storageForWallet(target);
    for (const key of await storage.keys()) {
      await storage.removeItem(key);
    }
  }

  const wallets = index.wallets.filter((w) => w.id !== id);
  const activeId = index.activeId === id ? (wallets[0]?.id ?? DEFAULT_WALLET_ID) : index.activeId;
  await writeWalletsIndex({ activeId, wallets });
  return wallets.length > 0 ? activeId : null;
}

/** Test-only: wipe the registry record. */
export async function _clearWalletsIndex(): Promise<void> {
  await getSdkWalletStorage().removeItem(INDEX_KEY);
}

function addr(address?: string): { address?: string } {
  return address ? { address } : {};
}

function prune(patch: Partial<Pick<WalletMeta, "label" | "address">>): Partial<WalletMeta> {
  const out: Partial<WalletMeta> = {};
  if (typeof patch.label === "string") out.label = patch.label;
  if (typeof patch.address === "string") out.address = patch.address;
  return out;
}
