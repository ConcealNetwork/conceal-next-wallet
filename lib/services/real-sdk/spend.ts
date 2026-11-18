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
  DEPOSIT_SMALL_WITHDRAW_FEE,
  DEPOSIT_TX_FEE,
  DUST_THRESHOLD,
  decodeAddress,
  FUSION_TX_MIN_INPUT_COUNT,
  formatRelayReject,
  fusion,
  getBalance,
  getUnspentOutputs,
  isOptimizationNeeded,
  isValidAddress,
  MESSAGE_TX_AMOUNT_ATOMIC,
  MINIMUM_FEE_V2,
  type OwnedOutput,
  OPTIMIZE_THRESHOLD,
  PRETTY_AMOUNTS,
  relayAccepted,
  REMOTE_NODE_FEE_ATOMIC,
  selectFusionInputs,
  type SendRawTransactionResult,
  transactions as txns,
} from "conceal-wallet-sdk";
import { buildSpendTxMap, isDepSpent, uiDepStatus } from "@/lib/deposits/deposit-status";
import { WALLET_DONATION_ADDRESS } from "@/lib/config/config";
import { saveOutboundPidForRuntime } from "@/lib/services/real-sdk/address-book.service";
import {
  createSentMessageRecord,
  readSentRecords,
  type SdkMessageRecord,
  withSentRecords,
} from "@/lib/services/real-sdk/messages-store";
import {
  addPendingRecord,
  pendingSpentKeyImages,
  pendingWithdrawnDepositKeys,
} from "@/lib/services/real-sdk/pending-store";
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

/** Grace for a still-running build after the probe says the link is up. */
export const lateGraceMs = 3_000;

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

/** Submit signed hex without parking it. */
export async function submitRawHex(
  daemon: { sendRawTransaction(hex: string): Promise<SendRawTransactionResult> },
  serialized: string,
): Promise<SendRawTransactionResult> {
  return daemon.sendRawTransaction(serialized);
}

/**
 * Classified submit stage shared by every spend pipeline (send, deposit, withdraw,
 * message, fusion): submit the hex, then classify — `accepted` (relay OK), `skip`
 * (the gate went dead), or `submit` (`timedOut` marks a possible in-flight broadcast
 * so callers park a hash-watching hung intent instead of blind-retrying).
 */
type SubmitStage = { kind: "accepted" } | { kind: "skip" } | { kind: "submit"; timedOut: boolean };

async function submitStage(
  rt: SdkRuntime,
  built: BuiltTransaction,
  gate: () => boolean,
): Promise<SubmitStage> {
  let status: string | undefined;
  try {
    const result = await submitRawHex(rt.daemon, built.serialized);
    status = result.status;
  } catch (error) {
    if (!gate()) return { kind: "skip" };
    const timedOut = error instanceof Error && error.message.includes("timed out");
    return { kind: "submit", timedOut };
  }
  if (!gate()) return { kind: "skip" };
  if (!relayAccepted(status ?? "")) return { kind: "submit", timedOut: false };
  return { kind: "accepted" };
}

/**
 * Broadcast a built transaction, then re-sync so the new tx is reflected in state.
 * Throws a friendly error when the daemon rejects the relay.
 */
export async function broadcast(runtime: SdkRuntime, built: BuiltTransaction): Promise<void> {
  let result: SendRawTransactionResult;
  try {
    result = await runtime.daemon.sendRawTransaction(built.serialized);
  } catch (error) {
    throw new Error(
      `Failed to broadcast the transaction. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const status = result.status ?? "";
  if (!relayAccepted(status)) {
    throw new Error(
      `Failed to broadcast the transaction. ${formatRelayReject({ status, reason: result.reason })}`,
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

// --- shared send build+submit pipeline --------------------------------------
// ONE copy of the fund-safety-critical send sequence (fee fetch → node fee →
// balance gates → input selection → decoys → build → submit → optimistic
// records → persist → outbound payment-id trail), used by BOTH the interactive
// send (transaction.service sendTransaction) and the session-intent drain
// (intent-drain rebuildSend). Callers keep only their own input validation and
// map the classified failures onto their own retry semantics.

/** Everything the pipeline needs after the caller's input validation. */
export type SendPipelineRequest = {
  address: string;
  amountAtomic: number;
  recipient: DecodedRecipient;
  /** Already resolved through {@link resolveOutboundPaymentId}. */
  paymentId?: string;
  hasMessage: boolean;
  /** Trimmed message body; empty when {@link SendPipelineRequest.hasMessage} is false. */
  message: string;
};

/**
 * Classified pipeline failure. `unfunded` = balance/input-pool short, `select`
 * carries the raw selectableOutputs error (the interactive path rethrows it),
 * `decoy` = link/fee/decoy-fetch failure, `skip` = the caller's gate went dead
 * (lock/switch/offline) at a checkpoint, `submit` = relay error or non-OK status
 * (`timedOut` lets the interactive path park a hung intent watching the hash).
 */
export type SendPipelineFailure =
  | { reason: "unfunded" }
  | { reason: "select"; error: unknown }
  | { reason: "decoy" }
  | { reason: "skip" }
  | { reason: "submit"; timedOut: boolean; hash: string };

export type SendPipelineSuccess = {
  hash: string;
  amountAtomic: number;
  nodeFeeAtomic: number;
  address: string;
  paymentId?: string;
  hasMessage: boolean;
};

export type SendPipelineResult =
  | { ok: true; sent: SendPipelineSuccess }
  | { ok: false; failure: SendPipelineFailure };

/**
 * Run the shared build+submit pipeline on `rt`.
 *
 * `gate` is the caller's liveness check (`gate.live` for the interactive race,
 * `isLiveRuntime` for the drain). It is polled at the same checkpoints the
 * interactive path has always used — after the fee fetch, after the decoy
 * fetch, after the build, and after the submit — and at each failure point, so
 * a gate-dead pipeline never queues, submits, or records. Build errors
 * propagate to the caller (unchanged from both former copies).
 */
export async function runSendPipeline(
  rt: SdkRuntime,
  req: SendPipelineRequest,
  opts: {
    gate: () => boolean;
    /** Called as soon as the tx is built so the interactive timeout path can park a hung intent. */
    onBuilt?: (hash: string) => void;
  },
): Promise<SendPipelineResult> {
  const deadGate = (): SendPipelineFailure => ({ reason: "skip" });

  const balance = getBalance(rt.state);
  if (req.amountAtomic + FEE_ATOMIC > balance.spendable) {
    return { ok: false, failure: { reason: "unfunded" } };
  }

  let feeAddress: string;
  try {
    feeAddress = await rt.daemon.getNodeFeeAddress();
  } catch {
    return { ok: false, failure: opts.gate() ? { reason: "decoy" } : deadGate() };
  }
  if (!opts.gate()) return { ok: false, failure: deadGate() };

  let nodeFee: { spendPublicKey: string; viewPublicKey: string; amount: number } | null = null;
  if (feeAddress && feeAddress !== rt.account.address) {
    const feeRecipient = decodeFeeRecipient(feeAddress);
    nodeFee = {
      spendPublicKey: feeRecipient.spendPublicKey,
      viewPublicKey: feeRecipient.viewPublicKey,
      amount: REMOTE_NODE_FEE_ATOMIC,
    };
  }
  const nodeFeeAtomic = nodeFee ? REMOTE_NODE_FEE_ATOMIC : 0;

  if (req.amountAtomic + FEE_ATOMIC + nodeFeeAtomic > balance.spendable) {
    return { ok: false, failure: { reason: "unfunded" } };
  }

  let outputs: OwnedOutput[];
  try {
    outputs = await selectableOutputs(rt);
  } catch (error) {
    return { ok: false, failure: { reason: "select", error } };
  }
  const target = req.amountAtomic + FEE_ATOMIC + nodeFeeAtomic;
  const { selected } = selectSpendInputs(outputs, target);

  let decoys: txns.DecoySet[];
  try {
    decoys = await fetchDecoys(rt, selected);
  } catch {
    return { ok: false, failure: opts.gate() ? { reason: "decoy" } : deadGate() };
  }
  if (!opts.gate()) return { ok: false, failure: deadGate() };

  // A transfer that carries a message is built as a message tx so the encrypted body
  // rides in tx_extra (recipient surfaces it, and we keep a sender copy). The
  // recipient still receives the full amount via `messageAmount`. Build throws
  // propagate — both former copies behaved that way.
  const built = req.hasMessage
    ? txns.buildMessageTransaction({
        keys: rt.account.keys,
        recipient: {
          spendPublicKey: req.recipient.spendPublicKey,
          viewPublicKey: req.recipient.viewPublicKey,
        },
        body: req.message,
        changeKeys: ownKeys(rt),
        unspentOutputs: selected,
        decoys,
        fee: FEE_ATOMIC,
        mixin: MIXIN,
        ttlUnixSeconds: 0,
        nodeFee,
        messageAmount: req.amountAtomic,
        ...(req.paymentId ? { paymentId: req.paymentId as txns.Hex } : {}),
      })
    : txns.buildTransaction({
        keys: rt.account.keys,
        destinations: plainSendDestinations(req.recipient, req.amountAtomic, nodeFee),
        changeKeys: ownKeys(rt),
        unspentOutputs: selected,
        decoys,
        fee: FEE_ATOMIC,
        mixin: MIXIN,
        ...(req.paymentId
          ? {
              buildExtraRecords: ({ secretKey }) =>
                paymentIdExtraForSend(
                  req.paymentId,
                  req.recipient.viewPublicKey,
                  secretKey,
                ) as txns.Hex,
            }
          : {}),
      });

  opts.onBuilt?.(built.hash);
  if (!opts.gate()) return { ok: false, failure: deadGate() };

  const stage = await submitStage(rt, built, opts.gate);
  if (stage.kind === "skip") return { ok: false, failure: deadGate() };
  if (stage.kind === "submit") {
    return {
      ok: false,
      failure: { reason: "submit", timedOut: stage.timedOut, hash: built.hash },
    };
  }

  await finalizeSentSend(rt, built, req, nodeFeeAtomic);

  return {
    ok: true,
    sent: {
      hash: built.hash,
      amountAtomic: req.amountAtomic,
      nodeFeeAtomic,
      address: req.address,
      ...(req.paymentId ? { paymentId: req.paymentId } : {}),
      hasMessage: req.hasMessage,
    },
  };
}

/**
 * Post-accept optimistic records, shared verbatim by both send paths: tx private key +
 * pending hold (+ sender's message copy) persisted once, then the outbound
 * payment-id trail in the address book (parity fix — the drain retry previously
 * skipped it). Every failure here is non-fatal — the tx is already relayed, and
 * failing the send would invite a retry → double-spend.
 */
async function finalizeSentSend(
  rt: SdkRuntime,
  built: BuiltTransaction,
  req: SendPipelineRequest,
  nodeFeeAtomic: number,
): Promise<void> {
  recordTxPrivateKey(rt, built);
  rt.raw = addPendingRecord(rt.raw, {
    hash: built.hash,
    amountAtomic:
      req.address === rt.account.address
        ? FEE_ATOMIC + nodeFeeAtomic
        : req.amountAtomic + FEE_ATOMIC + nodeFeeAtomic,
    timestampIso: new Date().toISOString(),
    address: req.address,
    ...(req.paymentId ? { paymentId: req.paymentId } : {}),
    spentKeyImages: built.inputs.map((vin) => vin.keyImage),
  });
  if (req.hasMessage) {
    rt.raw = withSentRecords(rt.raw, [
      ...readSentRecords(rt.raw),
      createSentMessageRecord({
        hash: built.hash,
        recipientAddress: req.address,
        body: req.message,
        paymentId: req.paymentId,
        timestampIso: new Date().toISOString(),
      }),
    ]);
  }
  try {
    await persistRuntime(rt);
  } catch {
    // Non-fatal: the tx is already relayed, so failing the send here would invite
    // a retry → double-spend. Losing only the optimistic pending / message UI
    // records is acceptable; sync reconciles them.
  }
  if (req.paymentId) {
    try {
      await saveOutboundPidForRuntime(rt, req.address, req.paymentId);
    } catch {
      // Non-fatal: payment already sent.
    }
  }
}

/** Destinations for a plain (no-message) transfer: recipient + optional node fee. */
function plainSendDestinations(
  recipient: { spendPublicKey: string; viewPublicKey: string },
  amountAtomic: number,
  nodeFee: { spendPublicKey: string; viewPublicKey: string; amount: number } | null,
): txns.Destination[] {
  const destinations: txns.Destination[] = [
    {
      spendPublicKey: recipient.spendPublicKey,
      viewPublicKey: recipient.viewPublicKey,
      amount: amountAtomic,
    },
  ];
  if (nodeFee) destinations.push(nodeFee);
  return destinations;
}

// --- per-kind classified pipelines -------------------------------------------
// ONE classified build+submit path per wallet operation, mirroring
// {@link runSendPipeline}: the interactive service and the session-intent drain
// (intent-drain.ts rebuilds) share it, so finalize (optimistic records) only ever
// runs after the relay accepted and the failure classification cannot drift.

/** Same failure classification as {@link SendPipelineFailure}. */
export type SpendPipelineResult<Sent> =
  | { ok: true; sent: Sent }
  | { ok: false; failure: SendPipelineFailure };

/** The owned deposit entry a withdraw intent redeems. */
type OwnedDeposit = SdkRuntime["state"]["deposits"][number];

/** Why a deposit cannot be withdrawn right now — all mapped to visible errors interactively. */
export type WithdrawCheck =
  | { ok: true; deposit: OwnedDeposit }
  | { ok: false; reason: "pending" | "notFound" | "spent" | "locked" };

/**
 * Shared withdraw validation (interactive + drain): the deposit must exist, be
 * unspent, unlocked, and not already pending a withdraw in the mempool window.
 */
export function resolveWithdrawableDeposit(
  rt: SdkRuntime,
  input: { txHash: string; globalOutputIndex: number },
  networkHeight: number,
): WithdrawCheck {
  if (pendingWithdrawnDepositKeys(rt.raw).has(`${input.txHash}:${input.globalOutputIndex}`)) {
    return { ok: false, reason: "pending" };
  }
  const spendMap = buildSpendTxMap(rt.state, rt.raw, pendingWithdrawnDepositKeys(rt.raw));
  const owned = rt.state.deposits.find(
    (entry) => entry.txHash === input.txHash && entry.globalIndex === input.globalOutputIndex,
  );
  if (!owned) return { ok: false, reason: "notFound" };
  if (isDepSpent(owned, rt.state, spendMap)) return { ok: false, reason: "spent" };
  if (uiDepStatus(owned, networkHeight, rt.state, spendMap) === "active") {
    return { ok: false, reason: "locked" };
  }
  return { ok: true, deposit: owned };
}

export type DepositPipelineRequest = { amountAtomic: number; termBlocks: number };

/**
 * Classified deposit-create path: node fee → balance gate → input selection →
 * decoys → build → submit → optimistic pending deposit (post-accept only).
 */
export async function runDepositPipeline(
  rt: SdkRuntime,
  req: DepositPipelineRequest,
  opts: { gate: () => boolean },
): Promise<SpendPipelineResult<{ hash: string }>> {
  const deadGate = (): SendPipelineFailure => ({ reason: "skip" });

  const feeAddress = await safeNodeFeeAddress(rt.daemon);
  if (!opts.gate()) return { ok: false, failure: deadGate() };
  let nodeFee: { spendPublicKey: string; viewPublicKey: string } | null = null;
  if (feeAddress && feeAddress !== rt.account.address) {
    const decoded = decodeFeeRecipient(feeAddress);
    nodeFee = { spendPublicKey: decoded.spendPublicKey, viewPublicKey: decoded.viewPublicKey };
  }
  const nodeFeeAtomic = nodeFee ? REMOTE_NODE_FEE_ATOMIC : 0;

  const balance = getBalance(rt.state);
  if (req.amountAtomic + DEPOSIT_TX_FEE + nodeFeeAtomic > balance.spendable) {
    return { ok: false, failure: { reason: "unfunded" } };
  }

  let outputs: OwnedOutput[];
  try {
    outputs = await selectableOutputs(rt);
  } catch (error) {
    return { ok: false, failure: { reason: "select", error } };
  }
  const target = req.amountAtomic + DEPOSIT_TX_FEE + nodeFeeAtomic;
  const { selected, total } = selectSpendInputs(outputs, target);
  if (total < target) return { ok: false, failure: { reason: "unfunded" } };

  let decoys: txns.DecoySet[];
  try {
    decoys = await fetchDecoys(rt, selected);
  } catch {
    return { ok: false, failure: opts.gate() ? { reason: "decoy" } : deadGate() };
  }
  if (!opts.gate()) return { ok: false, failure: deadGate() };

  const built = txns.buildDepositTransaction({
    keys: rt.account.keys,
    amount: req.amountAtomic,
    termBlocks: req.termBlocks,
    ownKeys: ownKeys(rt),
    unspentOutputs: selected,
    decoys,
    fee: DEPOSIT_TX_FEE,
    mixin: MIXIN,
    nodeFee,
  });
  if (!opts.gate()) return { ok: false, failure: deadGate() };

  const stage = await submitStage(rt, built, opts.gate);
  if (stage.kind === "skip") return { ok: false, failure: deadGate() };
  if (stage.kind === "submit") {
    return { ok: false, failure: { reason: "submit", timedOut: stage.timedOut, hash: built.hash } };
  }

  // Post-accept only (#110): lock the inputs against re-selection, then persist.
  recordTxPrivateKey(rt, built);
  rt.raw = addPendingRecord(rt.raw, {
    hash: built.hash,
    type: "deposit",
    amountAtomic: req.amountAtomic + DEPOSIT_TX_FEE + nodeFeeAtomic,
    timestampIso: new Date().toISOString(),
    address: rt.account.address,
    spentKeyImages: built.inputs.map((vin) => vin.keyImage),
  });
  try {
    await persistRuntime(rt);
  } catch {
    // Non-fatal: the deposit is already relayed; sync reconciles the records.
  }
  try {
    await syncRuntime(rt);
  } catch {
    // Non-fatal: the next sync reflects the deposit.
  }
  return { ok: true, sent: { hash: built.hash } };
}

export type WithdrawPipelineRequest = {
  deposit: OwnedDeposit;
  txHash: string;
  globalOutputIndex: number;
};

/**
 * Classified withdraw path: build from the deposit output (no decoy stage — the
 * deposit's key image is known) → submit → optimistic pending withdrawal with the
 * deposit ref (post-accept only), which blocks repeat withdraws until it mines.
 */
export async function runWithdrawPipeline(
  rt: SdkRuntime,
  req: WithdrawPipelineRequest,
  opts: { gate: () => boolean },
): Promise<SpendPipelineResult<{ hash: string; sentAmount: number }>> {
  const built = txns.buildWithdrawTransaction({
    keys: rt.account.keys,
    deposit: req.deposit,
    ownKeys: ownKeys(rt),
    // The SDK defaults this to DEPOSIT_SMALL_WITHDRAW_FEE; pass it explicitly so
    // the withdraw fee stays correct even if the SDK default ever changes.
    withdrawFee: DEPOSIT_SMALL_WITHDRAW_FEE,
  });
  if (!opts.gate()) return { ok: false, failure: { reason: "skip" } };

  const stage = await submitStage(rt, built, opts.gate);
  if (stage.kind === "skip") return { ok: false, failure: { reason: "skip" } };
  if (stage.kind === "submit") {
    return { ok: false, failure: { reason: "submit", timedOut: stage.timedOut, hash: built.hash } };
  }

  recordTxPrivateKey(rt, built);
  rt.raw = addPendingRecord(rt.raw, {
    hash: built.hash,
    type: "withdrawal",
    amountAtomic: built.sentAmount,
    timestampIso: new Date().toISOString(),
    address: rt.account.address,
    spentKeyImages: built.inputs.map((vin) => vin.keyImage),
    depositRef: { txHash: req.txHash, globalIndex: req.globalOutputIndex },
  });
  try {
    await persistRuntime(rt);
  } catch {
    // Non-fatal: the withdrawal is already relayed; sync reconciles the records.
  }
  try {
    await syncRuntime(rt);
  } catch {
    // Non-fatal: the next sync reflects the withdrawal.
  }
  return { ok: true, sent: { hash: built.hash, sentAmount: built.sentAmount } };
}

export type MessagePipelineRequest = {
  recipientAddress: string;
  body: string;
  paymentId?: string;
  /** Mempool TTL (unix seconds); 0 = mined message. */
  ttlUnixSeconds: number;
};

export type MessagePipelineSent = {
  hash: string;
  record: SdkMessageRecord;
  paymentId?: string;
};

/**
 * Classified message path: node fee (mined messages only) → selection → decoys →
 * build → submit → sent copy + pending record + outbound PID trail (post-accept
 * only). A TTL body rides its original expiry — an already-expired TTL is never
 * re-broadcast (the drain drops it before this pipeline runs).
 */
export async function runMessagePipeline(
  rt: SdkRuntime,
  req: MessagePipelineRequest,
  opts: { gate: () => boolean },
): Promise<SpendPipelineResult<MessagePipelineSent>> {
  const deadGate = (): SendPipelineFailure => ({ reason: "skip" });

  const recipient = decodeRecipient(req.recipientAddress);
  const paymentId = resolveOutboundPaymentId(req.paymentId, recipient);
  const ttlUnixSeconds = Math.max(0, req.ttlUnixSeconds);
  const hasTtl = ttlUnixSeconds > 0;

  let nodeFee: { spendPublicKey: string; viewPublicKey: string; amount: number } | null = null;
  if (!hasTtl) {
    const feeAddress = await safeNodeFeeAddress(rt.daemon);
    if (!opts.gate()) return { ok: false, failure: deadGate() };
    if (feeAddress && feeAddress !== rt.account.address) {
      const decoded = decodeFeeRecipient(feeAddress);
      nodeFee = {
        spendPublicKey: decoded.spendPublicKey,
        viewPublicKey: decoded.viewPublicKey,
        amount: REMOTE_NODE_FEE_ATOMIC,
      };
    }
  }
  const nodeFeeAtomic = nodeFee ? REMOTE_NODE_FEE_ATOMIC : 0;

  const target = MESSAGE_TX_AMOUNT_ATOMIC + (hasTtl ? 0 : FEE_ATOMIC) + nodeFeeAtomic;
  if (target > getBalance(rt.state).spendable) {
    return { ok: false, failure: { reason: "unfunded" } };
  }

  let outputs: OwnedOutput[];
  try {
    outputs = await selectableOutputs(rt);
  } catch (error) {
    return { ok: false, failure: { reason: "select", error } };
  }
  const { selected, total } = selectSpendInputs(outputs, target);
  if (total < target) return { ok: false, failure: { reason: "unfunded" } };

  let decoys: txns.DecoySet[];
  try {
    decoys = await fetchDecoys(rt, selected);
  } catch {
    return { ok: false, failure: opts.gate() ? { reason: "decoy" } : deadGate() };
  }
  if (!opts.gate()) return { ok: false, failure: deadGate() };

  const built = txns.buildMessageTransaction({
    keys: rt.account.keys,
    recipient: {
      spendPublicKey: recipient.spendPublicKey,
      viewPublicKey: recipient.viewPublicKey,
    },
    body: req.body,
    changeKeys: ownKeys(rt),
    unspentOutputs: selected,
    decoys,
    fee: FEE_ATOMIC,
    mixin: MIXIN,
    ttlUnixSeconds,
    nodeFee,
    messageAmount: MESSAGE_TX_AMOUNT_ATOMIC,
    ...(paymentId ? { paymentId: paymentId as txns.Hex } : {}),
  });
  if (!opts.gate()) return { ok: false, failure: deadGate() };

  const stage = await submitStage(rt, built, opts.gate);
  if (stage.kind === "skip") return { ok: false, failure: deadGate() };
  if (stage.kind === "submit") {
    return { ok: false, failure: { reason: "submit", timedOut: stage.timedOut, hash: built.hash } };
  }

  // Post-accept only: pending out, sender's copy, outbound PID trail.
  recordTxPrivateKey(rt, built);
  rt.raw = addPendingRecord(rt.raw, {
    hash: built.hash,
    type: "message",
    amountAtomic: req.recipientAddress === rt.account.address ? built.fee : built.sentAmount + built.fee,
    timestampIso: new Date().toISOString(),
    address: req.recipientAddress,
    ...(paymentId ? { paymentId } : {}),
    spentKeyImages: built.inputs.map((vin) => vin.keyImage),
    ...(hasTtl ? { ttlExpiresAt: ttlUnixSeconds } : {}),
  });
  const record = createSentMessageRecord({
    hash: built.hash,
    recipientAddress: req.recipientAddress,
    body: req.body,
    paymentId,
    timestampIso: new Date().toISOString(),
    ...(hasTtl ? { ttlExpiresAt: ttlUnixSeconds } : {}),
  });
  rt.raw = withSentRecords(rt.raw, [...readSentRecords(rt.raw), record]);
  try {
    await persistRuntime(rt);
  } catch {
    // Non-fatal: the message is already relayed; sync reconciles the records.
  }
  if (paymentId) {
    try {
      await saveOutboundPidForRuntime(rt, req.recipientAddress, paymentId);
    } catch {
      // Non-fatal: message already sent; contact row can be repaired on next send.
    }
  }
  try {
    await syncRuntime(rt);
  } catch {
    // Non-fatal: the next sync reflects the message.
  }
  return {
    ok: true,
    sent: { hash: built.hash, record, ...(paymentId ? { paymentId } : {}) },
  };
}

export type FusionPipelineSent = { optimized: false } | { optimized: true; hash: string };

/**
 * Classified fusion path: re-run `isOptimizationNeeded` + `selectFusionInputs` on
 * FRESH state every call, so a drain retry silently finds nothing to fuse once the
 * dust is gone. Submit → persist (post-accept only).
 */
export async function runFusionPipeline(
  rt: SdkRuntime,
  opts: { gate: () => boolean },
): Promise<SpendPipelineResult<FusionPipelineSent>> {
  const deadGate = (): SendPipelineFailure => ({ reason: "skip" });

  const blockchainHeight = await rt.daemon.getHeight();
  if (!opts.gate()) return { ok: false, failure: deadGate() };

  let outputs: OwnedOutput[];
  try {
    outputs = await selectableOutputs(rt);
  } catch (error) {
    return { ok: false, failure: { reason: "select", error } };
  }
  const status = isOptimizationNeeded({
    unspentOutputs: outputs,
    balance: getBalance(rt.state).spendable,
    blockchainHeight,
  });
  if (!status.isNeeded) return { ok: true, sent: { optimized: false } };

  const selection = selectFusionInputs(outputs, OPTIMIZE_THRESHOLD, blockchainHeight);
  if (selection === null || selection.selected.length < FUSION_TX_MIN_INPUT_COUNT) {
    return { ok: true, sent: { optimized: false } };
  }

  let decoys: txns.DecoySet[];
  try {
    decoys = await fetchDecoys(rt, selection.selected);
  } catch {
    return { ok: false, failure: opts.gate() ? { reason: "decoy" } : deadGate() };
  }
  if (!opts.gate()) return { ok: false, failure: deadGate() };

  const built = fusion.buildFusionTransaction({
    keys: rt.account.keys,
    selfKeys: ownKeys(rt),
    fusionInputs: selection.selected,
    decoys,
    mixin: MIXIN,
  });
  if (!opts.gate()) return { ok: false, failure: deadGate() };

  const stage = await submitStage(rt, built, opts.gate);
  if (stage.kind === "skip") return { ok: false, failure: deadGate() };
  if (stage.kind === "submit") {
    return { ok: false, failure: { reason: "submit", timedOut: stage.timedOut, hash: built.hash } };
  }

  recordTxPrivateKey(rt, built);
  try {
    await persistRuntime(rt);
  } catch {
    // Non-fatal: the fusion tx is already relayed.
  }
  try {
    await syncRuntime(rt);
  } catch {
    // Non-fatal: the next sync reflects the fused outputs.
  }
  return { ok: true, sent: { optimized: true, hash: built.hash } };
}
