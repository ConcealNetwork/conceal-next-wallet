// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import {
  COIN_UNIT_PLACES,
  DEPOSIT_MAX_TERM_MONTH,
  DEPOSIT_MIN_AMOUNT_COIN,
  DEPOSIT_MIN_TERM_BLOCK,
  DEPOSIT_MIN_TERM_MONTH,
  isValidAddress,
  MAX_MESSAGE_BODY_BYTES,
} from "conceal-wallet-sdk";
import { readIncomingPendingRecords } from "@/lib/services/real-sdk/incoming-pending-store";
import { isLiveRuntime, type SdkRuntime } from "@/lib/services/real-sdk/runtime-registry";
import {
  cancelIntent,
  dueAutoIntents,
  enqueueHung,
  type IntentDraft,
  listIntents,
  markHungSent,
  noteDecoyFail,
  noteSubmitFail,
  resetAutoWait,
  tickSynced,
  type WalletIntent,
} from "@/lib/services/real-sdk/send-intent";
import {
  decodeRecipient,
  resolveOutboundPaymentId,
  runDepositPipeline,
  runFusionPipeline,
  runMessagePipeline,
  runSendPipeline,
  runWithdrawPipeline,
  resolveWithdrawableDeposit,
  type SpendPipelineResult,
} from "@/lib/services/real-sdk/spend";
import { isWalletHeightSyncing } from "@/lib/ui/wallet-sync";

const ATOMIC_PER_CCX = 10 ** COIN_UNIT_PLACES;

export type RebuildResult = "ok" | "decoy" | "submit" | "unfunded" | "skip" | { hung: string };

/**
 * Rebuild + resubmit any queued intent through the SAME classified pipeline its
 * interactive flow uses. Every rebuild re-validates its payload against fresh
 * state: anything that can no longer be funded or executed (spent/locked deposit,
 * gone fusion dust, expired TTL, invalid payload) maps to "unfunded" and is
 * dropped silently — no toast.
 */
export async function rebuildIntent(rt: SdkRuntime, intent: WalletIntent): Promise<RebuildResult> {
  switch (intent.kind) {
    case "send":
      return rebuildSend(rt, intent);
    case "deposit":
      return rebuildDeposit(rt, intent);
    case "withdraw":
      return rebuildWithdraw(rt, intent);
    case "message":
      return rebuildMessage(rt, intent);
    case "fusion":
      return rebuildFusion(rt, intent);
  }
}

function pipelineToRebuildResult<Sent>(result: SpendPipelineResult<Sent>): RebuildResult {
  if (result.ok) return "ok";
  const failure = result.failure;
  if (failure.reason === "unfunded" || failure.reason === "select") return "unfunded";
  if (failure.reason === "decoy") return "decoy";
  if (failure.reason === "skip") return "skip";
  return "submit";
}

export type DrainArgs = {
  scannedHeight: number;
  networkHeight: number;
  spendableAtomic: number;
  historyHashes: ReadonlySet<string>;
  isLive: () => boolean;
  rebuild: (intent: WalletIntent) => Promise<RebuildResult>;
};

function draftOf(intent: WalletIntent): IntentDraft {
  return { kind: intent.kind, ...intent.payload } as IntentDraft;
}

function applyRebuild(rt: SdkRuntime, intent: WalletIntent, result: RebuildResult): void {
  if (result === "skip") {
    return;
  }
  if (result === "ok" || result === "unfunded") {
    cancelIntent(rt, intent.id);
    return;
  }
  if (result === "decoy") {
    if (noteDecoyFail(rt, intent.id) === "kept") resetAutoWait(rt, intent.id);
    return;
  }
  if (result === "submit") {
    if (noteSubmitFail(rt, intent.id) === "kept") resetAutoWait(rt, intent.id);
    return;
  }
  cancelIntent(rt, intent.id);
  enqueueHung(rt, draftOf(intent), result.hung);
}

/**
 * Rebuild + resubmit a queued send through the SAME shared pipeline the
 * interactive send uses (spend.ts runSendPipeline) — fee logic, builder, submit,
 * and post-OK records can no longer drift between the two paths. Only the input
 * validation and the failure→retry classification are drain-specific here.
 */
export async function rebuildSend(rt: SdkRuntime, intent: WalletIntent): Promise<RebuildResult> {
  if (intent.kind !== "send") return "skip";
  const payload = intent.payload;
  const amountAtomic = Math.round(payload.amount * ATOMIC_PER_CCX);
  if (!Number.isFinite(amountAtomic) || amountAtomic <= 0) return "unfunded";
  if (!isValidAddress(payload.address)) return "unfunded";

  const message = payload.message?.trim() ?? "";
  let recipient: ReturnType<typeof decodeRecipient>;
  try {
    recipient = decodeRecipient(payload.address);
  } catch {
    return "unfunded";
  }
  const paymentId = resolveOutboundPaymentId(payload.paymentId, recipient);

  const result = await runSendPipeline(
    rt,
    {
      address: payload.address,
      amountAtomic,
      recipient,
      ...(paymentId ? { paymentId } : {}),
      hasMessage: message.length > 0,
      message,
    },
    { gate: () => isLiveRuntime(rt) },
  );
  if (!result.ok) {
    const failure = result.failure;
    if (failure.reason === "unfunded" || failure.reason === "select") return "unfunded";
    if (failure.reason === "decoy") return "decoy";
    if (failure.reason === "skip") return "skip";
    return "submit";
  }
  return "ok";
}

function historyHashes(rt: SdkRuntime): Set<string> {
  return new Set([
    ...rt.state.transactions.map((tx) => tx.hash),
    ...readIncomingPendingRecords(rt.raw).map((record) => record.hash),
  ]);
}

export async function submitHung(rt: SdkRuntime, id: string): Promise<boolean> {
  const row = listIntents(rt).find((intent) => intent.id === id);
  if (row?.state !== "hung") return false;
  if (row.sent) return true;
  if (row.watchedHash && historyHashes(rt).has(row.watchedHash)) {
    markHungSent(rt, id);
    return true;
  }
  if (!isLiveRuntime(rt)) return false;
  const networkHeight = await rt.daemon.getHeight();
  if (isWalletHeightSyncing(rt.state.scannedHeight, networkHeight)) return false;
  const result = await rebuildIntent(rt, row);
  applyRebuild(rt, row, result);
  return result !== "skip";
}

export async function drainIntents(rt: SdkRuntime, args: DrainArgs): Promise<void> {
  for (const row of listIntents(rt)) {
    if (row.state === "hung" && row.watchedHash && args.historyHashes.has(row.watchedHash)) {
      markHungSent(rt, row.id);
    }
  }

  if (isWalletHeightSyncing(args.scannedHeight, args.networkHeight)) {
    return;
  }

  const due = dueAutoIntents(rt);
  tickSynced(rt);

  for (const intent of due) {
    if (!args.isLive()) return;
    const result = await args.rebuild(intent);
    applyRebuild(rt, intent, result);
  }
}

/** Re-validate + rebuild a queued deposit-create against fresh balance/inputs. */
export async function rebuildDeposit(rt: SdkRuntime, intent: WalletIntent): Promise<RebuildResult> {
  if (intent.kind !== "deposit") return "skip";
  const { amount, durationMonths } = intent.payload;
  const amountCoins = Math.floor(amount);
  if (
    !Number.isFinite(amountCoins) ||
    amountCoins < DEPOSIT_MIN_AMOUNT_COIN ||
    durationMonths < DEPOSIT_MIN_TERM_MONTH ||
    durationMonths > DEPOSIT_MAX_TERM_MONTH
  ) {
    return "unfunded";
  }
  const result = await runDepositPipeline(
    rt,
    {
      amountAtomic: amountCoins * ATOMIC_PER_CCX,
      termBlocks: durationMonths * DEPOSIT_MIN_TERM_BLOCK,
    },
    { gate: () => isLiveRuntime(rt) },
  );
  return pipelineToRebuildResult(result);
}

/**
 * Re-validate + rebuild a queued withdraw: the deposit must STILL be present,
 * unspent, and unlocked. Anything else (spent elsewhere, locked again, already
 * pending, gone after a rescan) is a silent unfunded drop — the chain state took
 * the opportunity away, so there is nothing to retry.
 */
export async function rebuildWithdraw(rt: SdkRuntime, intent: WalletIntent): Promise<RebuildResult> {
  if (intent.kind !== "withdraw") return "skip";
  const { txHash, globalOutputIndex } = intent.payload;
  if (!isLiveRuntime(rt)) return "skip";
  const networkHeight = await rt.daemon.getHeight();
  const check = resolveWithdrawableDeposit(rt, { txHash, globalOutputIndex }, networkHeight);
  if (!check.ok) return "unfunded";
  const result = await runWithdrawPipeline(
    rt,
    { deposit: check.deposit, txHash, globalOutputIndex },
    { gate: () => isLiveRuntime(rt) },
  );
  return pipelineToRebuildResult(result);
}

/** Re-validate + rebuild a queued message; an expired TTL is dropped, never sent. */
export async function rebuildMessage(rt: SdkRuntime, intent: WalletIntent): Promise<RebuildResult> {
  if (intent.kind !== "message") return "skip";
  const payload = intent.payload;
  const body = payload.body.trim();
  if (!body) return "unfunded";
  if (new TextEncoder().encode(body).length > MAX_MESSAGE_BODY_BYTES) return "unfunded";
  if (!isValidAddress(payload.recipientAddress)) return "unfunded";
  const ttl = payload.ttlUnixSeconds ?? 0;
  if (ttl > 0 && Date.now() / 1000 >= ttl) return "unfunded";
  const result = await runMessagePipeline(
    rt,
    {
      recipientAddress: payload.recipientAddress,
      body,
      ...(payload.paymentId !== undefined ? { paymentId: payload.paymentId } : {}),
      ttlUnixSeconds: ttl,
    },
    { gate: () => isLiveRuntime(rt) },
  );
  return pipelineToRebuildResult(result);
}

/**
 * Re-validate + rebuild a queued fusion: re-run the optimization checks on fresh
 * state — once the fuseable dust is gone the intent is dropped silently.
 */
export async function rebuildFusion(rt: SdkRuntime, intent: WalletIntent): Promise<RebuildResult> {
  if (intent.kind !== "fusion") return "skip";
  const result = await runFusionPipeline(rt, { gate: () => isLiveRuntime(rt) });
  if (result.ok) return result.sent.optimized ? "ok" : "unfunded";
  return pipelineToRebuildResult(result);
}
