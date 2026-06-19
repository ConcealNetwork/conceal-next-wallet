/**
 * Shared spend orchestration for the SDK engine: decode destinations, fetch decoy
 * rings from the daemon, and broadcast a built transaction. Used by the
 * transaction / deposit / message / settings (fusion) services so the
 * select-inputs → fetch-decoys → build → send → re-sync flow lives in one place.
 *
 * `buildTransaction` (and the deposit/message/fusion variants) select their own
 * inputs internally and only consume decoys for the amounts they pick. We fetch
 * `mixin + 1` decoys for every DISTINCT unspent-output amount up front, which is a
 * superset of what any build needs (an unused decoy set is simply ignored).
 */
import {
  DEFAULT_MIXIN,
  decodeAddress,
  getUnspentOutputs,
  type OwnedOutput,
  type transactions as txns,
} from "conceal-wallet-sdk";
import { COIN_FEE_ATOMIC } from "@/lib/config/config";
import { pendingSpentKeyImages } from "@/lib/services/real-sdk/pending-store";
import { decoysFromDaemon, persist, type SdkRuntime, sync } from "@/lib/services/real-sdk/runtime";

/** Local aliases for types that live inside the SDK's `transactions` namespace. */
type BuiltTransaction = txns.BuiltTransaction;
type DecoySet = txns.DecoySet;

/** Ring size minus one — the wallet default mixin. */
export const MIXIN = DEFAULT_MIXIN;
/** Standard transaction network fee, atomic units. */
export const FEE_ATOMIC = COIN_FEE_ATOMIC;

/** A decoded recipient: spend/view public keys + integrated payment id (if any). */
export interface DecodedRecipient {
  spendPublicKey: string;
  viewPublicKey: string;
  paymentId?: string;
}

/** Decode + validate a CCX recipient address, throwing a friendly error. */
export function decodeRecipient(address: string): DecodedRecipient {
  const trimmed = address.trim();
  if (!trimmed) throw new Error("Recipient address is required.");
  const decoded = decodeAddress(trimmed);
  return {
    spendPublicKey: decoded.spendPublicKey,
    viewPublicKey: decoded.viewPublicKey,
    ...(decoded.paymentId ? { paymentId: decoded.paymentId } : {}),
  };
}

/** The wallet's own decoded keys (change / self destination). */
export function ownKeys(runtime: SdkRuntime): { spendPublicKey: string; viewPublicKey: string } {
  return {
    spendPublicKey: runtime.account.keys.spend.pub,
    viewPublicKey: runtime.account.keys.view.pub,
  };
}

/** The wallet's currently-spendable outputs, excluding any held by a pending tx. */
export function unspentOutputs(runtime: SdkRuntime): OwnedOutput[] {
  // Outputs spent by a broadcast-but-not-yet-mined tx must not be re-selected, or a
  // second send would build on already-spent inputs and be rejected at relay (#96).
  const pendingSpent = pendingSpentKeyImages(runtime.raw);
  const unspent = getUnspentOutputs(runtime.state);
  return pendingSpent.size === 0
    ? unspent
    : unspent.filter((output) => !pendingSpent.has(output.keyImage));
}

/**
 * Fetch `MIXIN + 1` decoy outputs for every distinct amount in `outputs`. Returns
 * `[]` when there are no outputs (the caller's build will then fail its own
 * insufficient-funds check with a clear message).
 */
export async function fetchDecoys(
  runtime: SdkRuntime,
  outputs: readonly OwnedOutput[],
): Promise<DecoySet[]> {
  const amounts = [...new Set(outputs.map((out) => out.amount))];
  if (amounts.length === 0) return [];
  const raw = await runtime.daemon.getRandomOuts(amounts, MIXIN + 1);
  return decoysFromDaemon(raw);
}

/**
 * Broadcast a built transaction, then re-sync so the new tx is reflected in state.
 * Throws a friendly error when the daemon rejects the relay.
 */
export async function broadcast(runtime: SdkRuntime, built: BuiltTransaction): Promise<void> {
  try {
    await runtime.daemon.sendRawTransaction(built.serialized);
  } catch (error) {
    throw new Error(
      `Failed to broadcast the transaction. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  // Record the tx private key for later (export / message decryption parity).
  recordTxPrivateKey(runtime, built);
  await persist();
  // Re-sync so the freshly-broadcast transaction lands in the wallet's history.
  try {
    await sync();
  } catch {
    // A post-broadcast sync failure is non-fatal — the tx is already relayed and
    // the next refresh will reconcile state.
  }
}

/** Persist the per-tx private key into the blob's `txPrivateKeys` map (immutably). */
function recordTxPrivateKey(runtime: SdkRuntime, built: BuiltTransaction): void {
  const existing =
    runtime.raw.txPrivateKeys && typeof runtime.raw.txPrivateKeys === "object"
      ? runtime.raw.txPrivateKeys
      : {};
  runtime.raw = {
    ...runtime.raw,
    txPrivateKeys: { ...existing, [built.hash]: built.txSecretKey },
  };
}
