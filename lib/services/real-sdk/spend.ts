// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

/**
 * Shared spend orchestration for the SDK engine: decode destinations, fetch decoy
 * rings from the daemon, and broadcast a built transaction. Used by the
 * transaction / deposit / message / settings (fusion) services.
 *
 * Spend order: `selectInputs` (pretty / non-dust) → `fetchDecoys(selected)` →
 * build with `unspentOutputs: selected`.
 */
import {
  DEFAULT_MIXIN,
  DUST_THRESHOLD,
  decodeAddress,
  getUnspentOutputs,
  isValidAddress,
  MINIMUM_FEE_V2,
  type OwnedOutput,
  PRETTY_AMOUNTS,
  transactions as txns,
} from "conceal-wallet-sdk";
import { WALLET_DONATION_ADDRESS } from "@/lib/config/config";
import { pendingSpentKeyImages } from "@/lib/services/real-sdk/pending-store";
import { persistRuntime, type SdkRuntime, syncRuntime } from "@/lib/services/real-sdk/runtime";

/** Local aliases for types that live inside the SDK's `transactions` namespace. */
type BuiltTransaction = txns.BuiltTransaction;
type DecoySet = txns.DecoySet;

/** Ring size minus one — the wallet default mixin. */
export const MIXIN = DEFAULT_MIXIN;
/** Standard transaction network fee, atomic units. */
export const FEE_ATOMIC = MINIMUM_FEE_V2;

/** `{1..9} × 10^k` ladder — only these denominations are selected for spends. */
const PRETTY_SET = new Set(PRETTY_AMOUNTS);

/** True when `amount` is on the Conceal pretty denomination ladder. */
export function isPrettyAmount(amount: number): boolean {
  return PRETTY_SET.has(amount);
}

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
 * Spendable outputs with optimistic-pending (#96) holds removed, then pretty-filtered.
 * Leftover hex `outbox:` keys are swept on unlock/send (never submitted). The next
 * rebuild selects current unspent or drops if funds are gone. Pending-store still
 * excludes images from an OK optimistic send ({@link unspentOutputs} /
 * `pendingSpentKeyImages`).
 *
 * Non-pretty amounts (not `{1..9}×10^k`) are skipped — unique leftovers (e.g. old withdraw
 * redeem outs) are unmixable and must not be selected as spend inputs. Dust (`< DUST_THRESHOLD`)
 * stays in this pool so fusion/optimize can still sweep it; ordinary spends gate dust via
 * {@link selectSpendInputs}.
 */
export async function selectableOutputs(runtime: SdkRuntime): Promise<OwnedOutput[]> {
  return unspentOutputs(runtime).filter((out) => isPrettyAmount(out.amount));
}

/**
 * Dry-run of {@link selectSpendInputs}: the total atomic value a fresh tx could actually
 * select from `outputs` (pretty denominations above the dust threshold), without throwing
 * on an insufficient pool. Gates (e.g. the deposit max) budget against this so they match
 * what a real spend can pick — not the raw on-chain balance.
 */
export function selectableSpendTotal(outputs: readonly OwnedOutput[]): number {
  return outputs.reduce((sum, out) => (out.amount > DUST_THRESHOLD ? sum + out.amount : sum), 0);
}

/**
 * Pick spend inputs: pretty denominations above the dust threshold. Prefer this over calling
 * `txns.selectInputs` directly — the SDK defaults `dustThreshold` to `0`, which would spend
 * mixable dust (e.g. 6 atomic) that the UI already excludes from Available.
 */
export function selectSpendInputs(
  outputs: readonly OwnedOutput[],
  targetAmount: number,
): { selected: OwnedOutput[]; total: number } {
  return txns.selectInputs(outputs, targetAmount, DUST_THRESHOLD);
}

/**
 * Decoys returned by the daemon's `getRandomOuts` — the minimal public shape we
 * consume (the SDK's daemon-result types are not exported).
 */
interface DaemonRandomOut {
  globalIndex: number;
  publicKey: string;
}
interface DaemonRandomOutsForAmount {
  amount: number;
  outs: DaemonRandomOut[];
}

/** Decoys returned by the daemon are already the {@link DecoySet} shape. */
export function decoysFromDaemon(outs: DaemonRandomOutsForAmount[]): DecoySet[] {
  return outs.map((entry) => ({
    amount: entry.amount,
    outs: entry.outs.map((out) => ({ globalIndex: out.globalIndex, publicKey: out.publicKey })),
  }));
}

/**
 * Fetch `MIXIN + 1` decoy outputs for each distinct amount in `outputs`.
 * Pass `selectInputs(...).selected` (or fusion's selection) — never the full
 * unspent set (non-pretty dens have no mixable peers on chain).
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

/** How long Confirm waits for a hash or daemon status before checking the link. */
export const connectHangMs = 10_000;

/** How long the post-hang connectivity probe waits on `getHeight`. */
export const probeHangMs = 1_000;

export function linkDown(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export async function raceHang<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** True when the tab is offline or the daemon does not answer a short height probe. */
export async function linkGone(daemon: { getHeight(): Promise<number> }): Promise<boolean> {
  if (linkDown()) return true;
  try {
    await raceHang(daemon.getHeight(), probeHangMs, "probe hung");
    return false;
  } catch {
    return true;
  }
}

type RawSubmit = { status?: string };

/** Submit signed hex without parking it. */
export async function submitRawHex(
  daemon: { sendRawTransaction(hex: string): Promise<RawSubmit> },
  serialized: string,
): Promise<RawSubmit> {
  return daemon.sendRawTransaction(serialized);
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
export function recordTxPrivateKey(runtime: SdkRuntime, built: BuiltTransaction): void {
  const existing =
    runtime.raw.txPrivateKeys && typeof runtime.raw.txPrivateKeys === "object"
      ? runtime.raw.txPrivateKeys
      : {};
  runtime.raw = {
    ...runtime.raw,
    txPrivateKeys: { ...existing, [built.hash]: built.txSecretKey },
  };
}
