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
  isValidAddress,
  MINIMUM_FEE_V2,
  type OutboundQueueState,
  type OwnedOutput,
  transactions as txns,
} from "conceal-wallet-sdk";
import { WALLET_DONATION_ADDRESS } from "@/lib/config/config";
import { queueForRuntime } from "@/lib/services/real-sdk/outbound-queue";
import { pendingSpentKeyImages } from "@/lib/services/real-sdk/pending-store";
import {
  decoysFromDaemon,
  persistRuntime,
  type SdkRuntime,
  syncRuntime,
} from "@/lib/services/real-sdk/runtime";

/** Local aliases for types that live inside the SDK's `transactions` namespace. */
type BuiltTransaction = txns.BuiltTransaction;
type DecoySet = txns.DecoySet;

/** Ring size minus one — the wallet default mixin. */
export const MIXIN = DEFAULT_MIXIN;
/** Standard transaction network fee, atomic units. */
export const FEE_ATOMIC = MINIMUM_FEE_V2;

/** A decoded recipient: spend/view public keys + integrated payment id (if any). */
export interface DecodedRecipient {
  spendPublicKey: string;
  viewPublicKey: string;
  paymentId?: string;
}

/** Resolve an outbound payment id: explicit field wins, else integrated address embed. */
export function resolveOutboundPaymentId(
  explicitPaymentId: string | undefined,
  recipient: DecodedRecipient,
): string | undefined {
  const explicit = explicitPaymentId?.trim();
  if (explicit) return explicit;
  return recipient.paymentId?.trim() || undefined;
}

/** Build tx_extra nonce hex for an outbound payment id, or `""` when absent. */
export function paymentIdExtraForSend(
  paymentId: string | undefined,
  recipientViewPublicKey: string,
  txSecretKey: string,
): string {
  const pid = paymentId?.trim().toLowerCase();
  if (!pid) return "";
  return txns.encodePaymentIdNonceExtra(
    pid as txns.Hex,
    pid.length === 16
      ? {
          recipientViewPublicKey: recipientViewPublicKey as txns.Hex,
          txSecretKey: txSecretKey as txns.Hex,
        }
      : undefined,
  );
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

/** The node's advertised fee address, or `""` when it charges none / on error. */
export async function safeNodeFeeAddress(daemon: {
  getNodeFeeAddress(): Promise<string>;
}): Promise<string> {
  try {
    return await daemon.getNodeFeeAddress();
  } catch {
    return "";
  }
}

/**
 * Decode the node's fee address; fall back to the donation address when the
 * (untrusted) node returns an undecodable string — bounds a bad node to the fee.
 */
export function decodeFeeRecipient(feeAddress: string): DecodedRecipient {
  const target = isValidAddress(feeAddress) ? feeAddress : WALLET_DONATION_ADDRESS;
  return decodeRecipient(target);
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
 * Spendable outputs with BOTH the optimistic-pending (#96) and the durable-queue (#92)
 * reservations removed, so a new send never selects an input already committed to a queued
 * (not-yet-mined) broadcast. The queue is the durable source of truth for reservations; the
 * pending-store overlaps for the common send path but the two stay consistent (same tx →
 * same key images).
 */
export async function selectableOutputs(runtime: SdkRuntime): Promise<OwnedOutput[]> {
  const reserved = await queueForRuntime(runtime).reservedKeyImages();
  const outputs = unspentOutputs(runtime);
  return reserved.size === 0 ? outputs : outputs.filter((out) => !reserved.has(out.keyImage));
}

/**
 * Durable send (#92): persist the built+signed tx into the outbound queue BEFORE any
 * network I/O (idempotent on hash), then attempt an immediate broadcast. A transient
 * failure leaves the entry `pending` for the sync-tick drainer to retry — the payment is
 * never lost to a dropped connection. Returns the post-drain lifecycle state
 * (`broadcast` = relayed, `pending` = queued for retry, `failed` = rejected/expired).
 */
export async function enqueueAndBroadcast(
  runtime: SdkRuntime,
  built: BuiltTransaction,
  opts: { label?: string; notBefore?: number; ttlUnixSeconds?: number } = {},
): Promise<OutboundQueueState> {
  const queue = queueForRuntime(runtime);
  // Record the tx private key (export / message-decryption parity) and persist the wallet
  // blob FIRST, bound to THIS runtime (#92 review — Codex/GLM #4): if persistence fails it
  // throws BEFORE anything is enqueued/broadcast, so there's nothing to double-send on retry.
  recordTxPrivateKey(runtime, built);
  await persistRuntime(runtime);
  await queue.enqueue(built, opts);
  let state: OutboundQueueState = "pending";
  try {
    const results = await queue.drainOnce();
    state = results.find((result) => result.hash === built.hash)?.state ?? "pending";
  } catch {
    // Transient network error — the entry stays `pending` and the sync drainer retries.
  }
  // Re-sync (bound to this runtime) so a freshly-broadcast tx lands in the wallet's history.
  try {
    await syncRuntime(runtime);
  } catch {
    // Non-fatal: the next refresh reconciles state.
  }
  return state;
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
  await persistRuntime(runtime);
  // Re-sync so the freshly-broadcast transaction lands in the wallet's history.
  try {
    await syncRuntime(runtime);
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
