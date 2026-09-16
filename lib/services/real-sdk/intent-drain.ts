// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import {
  COIN_UNIT_PLACES,
  getBalance,
  isValidAddress,
  REMOTE_NODE_FEE_ATOMIC,
  transactions as txns,
} from "conceal-wallet-sdk";
import { readIncomingPendingRecords } from "@/lib/services/real-sdk/incoming-pending-store";
import {
  createSentMessageRecord,
  readSentRecords,
  withSentRecords,
} from "@/lib/services/real-sdk/messages-store";
import { addPendingRecord } from "@/lib/services/real-sdk/pending-store";
import { persistRuntime } from "@/lib/services/real-sdk/persistence";
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
  decodeFeeRecipient,
  decodeRecipient,
  FEE_ATOMIC,
  fetchDecoys,
  MIXIN,
  ownKeys,
  paymentIdExtraForSend,
  recordTxPrivateKey,
  resolveOutboundPaymentId,
  selectableOutputs,
  selectSpendInputs,
  submitRawHex,
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

function sendDests(
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

export async function rebuildSend(rt: SdkRuntime, intent: SendIntent): Promise<RebuildResult> {
  const amountAtomic = Math.round(intent.amount * ATOMIC_PER_CCX);
  if (!Number.isFinite(amountAtomic) || amountAtomic <= 0) return "unfunded";
  if (!isValidAddress(intent.address)) return "unfunded";

  const message = intent.message?.trim() ?? "";
  const hasMessage = message.length > 0;
  let recipient: ReturnType<typeof decodeRecipient>;
  try {
    recipient = decodeRecipient(intent.address);
  } catch {
    return "unfunded";
  }
  const paymentId = resolveOutboundPaymentId(intent.paymentId, recipient);

  const balance = getBalance(rt.state);
  if (amountAtomic + FEE_ATOMIC > balance.spendable) return "unfunded";

  let feeAddress: string;
  try {
    feeAddress = await rt.daemon.getNodeFeeAddress();
  } catch {
    return "decoy";
  }
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
  if (amountAtomic + FEE_ATOMIC + nodeFeeAtomic > balance.spendable) return "unfunded";

  let selected: Awaited<ReturnType<typeof selectableOutputs>>;
  try {
    const outputs = await selectableOutputs(rt);
    selected = selectSpendInputs(outputs, amountAtomic + FEE_ATOMIC + nodeFeeAtomic).selected;
  } catch {
    return "unfunded";
  }

  let decoys: txns.DecoySet[];
  try {
    decoys = await fetchDecoys(rt, selected);
  } catch {
    return "decoy";
  }

  const built = hasMessage
    ? txns.buildMessageTransaction({
        keys: rt.account.keys,
        recipient: {
          spendPublicKey: recipient.spendPublicKey,
          viewPublicKey: recipient.viewPublicKey,
        },
        body: message,
        changeKeys: ownKeys(rt),
        unspentOutputs: selected,
        decoys,
        fee: FEE_ATOMIC,
        mixin: MIXIN,
        ttlUnixSeconds: 0,
        nodeFee,
        messageAmount: amountAtomic,
        ...(paymentId ? { paymentId: paymentId as txns.Hex } : {}),
      })
    : txns.buildTransaction({
        keys: rt.account.keys,
        destinations: sendDests(recipient, amountAtomic, nodeFee),
        changeKeys: ownKeys(rt),
        unspentOutputs: selected,
        decoys,
        fee: FEE_ATOMIC,
        mixin: MIXIN,
        ...(paymentId
          ? {
              buildExtraRecords: ({ secretKey }) =>
                paymentIdExtraForSend(paymentId, recipient.viewPublicKey, secretKey) as txns.Hex,
            }
          : {}),
      });

  if (!isLiveRuntime(rt)) return "skip";

  let submitStatus: string | undefined;
  try {
    const result = await submitRawHex(rt.daemon, built.serialized);
    submitStatus = result?.status;
  } catch (error) {
    const hung = error instanceof Error && error.message === "submit hung";
    if (hung) return { hung: built.hash };
    return "submit";
  }
  if (submitStatus !== "OK") return "submit";

  recordTxPrivateKey(rt, built);
  rt.raw = addPendingRecord(rt.raw, {
    hash: built.hash,
    amountAtomic:
      intent.address === rt.account.address
        ? FEE_ATOMIC + nodeFeeAtomic
        : amountAtomic + FEE_ATOMIC + nodeFeeAtomic,
    timestampIso: new Date().toISOString(),
    address: intent.address,
    ...(paymentId ? { paymentId } : {}),
    spentKeyImages: built.inputs.map((vin) => vin.keyImage),
  });
  if (hasMessage) {
    rt.raw = withSentRecords(rt.raw, [
      ...readSentRecords(rt.raw),
      createSentMessageRecord({
        hash: built.hash,
        recipientAddress: intent.address,
        body: message,
        paymentId,
        timestampIso: new Date().toISOString(),
      }),
    ]);
  }
  try {
    await persistRuntime(rt);
  } catch {
    // Non-fatal: the tx is already relayed.
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
