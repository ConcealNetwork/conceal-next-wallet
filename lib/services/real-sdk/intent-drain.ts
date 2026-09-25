// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { COIN_UNIT_PLACES, isValidAddress } from "conceal-wallet-sdk";
import { readIncomingPendingRecords } from "@/lib/services/real-sdk/incoming-pending-store";
import { isLiveRuntime, type SdkRuntime } from "@/lib/services/real-sdk/runtime-registry";
import {
  cancelIntent,
  dueAutoIntents,
  enqueueHung,
  type IntentInput,
  listIntents,
  markHungSent,
  noteDecoyFail,
  noteSubmitFail,
  resetAutoWait,
  type SendIntent,
  tickSynced,
} from "@/lib/services/real-sdk/send-intent";
import {
  decodeRecipient,
  resolveOutboundPaymentId,
  runSendPipeline,
} from "@/lib/services/real-sdk/spend";
import { isWalletHeightSyncing } from "@/lib/ui/wallet-sync";

const ATOMIC_PER_CCX = 10 ** COIN_UNIT_PLACES;

export type RebuildResult = "ok" | "decoy" | "submit" | "unfunded" | "skip" | { hung: string };

export type DrainArgs = {
  scannedHeight: number;
  networkHeight: number;
  spendableAtomic: number;
  historyHashes: ReadonlySet<string>;
  isLive: () => boolean;
  rebuild: (intent: SendIntent) => Promise<RebuildResult>;
};

function intentInput(row: SendIntent): IntentInput {
  const input: IntentInput = { address: row.address, amount: row.amount };
  if (row.paymentId !== undefined) input.paymentId = row.paymentId;
  if (row.message !== undefined) input.message = row.message;
  return input;
}

function applyRebuild(rt: SdkRuntime, intent: SendIntent, result: RebuildResult): void {
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
  enqueueHung(rt, intentInput(intent), result.hung);
}

/**
 * Rebuild + resubmit a queued send through the SAME shared pipeline the
 * interactive send uses (spend.ts runSendPipeline) — fee logic, builder, submit,
 * and post-OK records can no longer drift between the two paths. Only the input
 * validation and the failure→retry classification are drain-specific here.
 */
export async function rebuildSend(rt: SdkRuntime, intent: SendIntent): Promise<RebuildResult> {
  const amountAtomic = Math.round(intent.amount * ATOMIC_PER_CCX);
  if (!Number.isFinite(amountAtomic) || amountAtomic <= 0) return "unfunded";
  if (!isValidAddress(intent.address)) return "unfunded";

  const message = intent.message?.trim() ?? "";
  let recipient: ReturnType<typeof decodeRecipient>;
  try {
    recipient = decodeRecipient(intent.address);
  } catch {
    return "unfunded";
  }
  const paymentId = resolveOutboundPaymentId(intent.paymentId, recipient);

  const result = await runSendPipeline(
    rt,
    {
      address: intent.address,
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
  if (row?.kind !== "hung") return false;
  if (row.sent) return true;
  if (row.watchedHash && historyHashes(rt).has(row.watchedHash)) {
    markHungSent(rt, id);
    return true;
  }
  if (!isLiveRuntime(rt)) return false;
  const networkHeight = await rt.daemon.getHeight();
  if (isWalletHeightSyncing(rt.state.scannedHeight, networkHeight)) return false;
  const result = await rebuildSend(rt, row);
  applyRebuild(rt, row, result);
  return result !== "skip";
}

export async function drainIntents(rt: SdkRuntime, args: DrainArgs): Promise<void> {
  for (const row of listIntents(rt)) {
    if (row.kind === "hung" && row.watchedHash && args.historyHashes.has(row.watchedHash)) {
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
