import {
  COIN_UNIT_PLACES,
  getBalance,
  isValidAddress,
  MAX_MESSAGE_BODY_BYTES,
} from "conceal-wallet-sdk";
import { readIncomingPendingRecords } from "@/lib/services/real-sdk/incoming-pending-store";
import { submitHung } from "@/lib/services/real-sdk/intent-drain";
import { mapTransaction, mapTransactions } from "@/lib/services/real-sdk/mappers";
import { dropExpiredTtl, indexMessageRecords } from "@/lib/services/real-sdk/messages-store";
import { readPendingRecords } from "@/lib/services/real-sdk/pending-store";
import { ensureSdkReady } from "@/lib/services/real-sdk/ready";
import { persist, requireRuntime, type SdkRuntime } from "@/lib/services/real-sdk/runtime";
import {
  cancelIntent,
  enqueueAuto,
  enqueueHung,
  type IntentInput,
  listIntents,
  mapIntent,
} from "@/lib/services/real-sdk/send-intent";
import {
  connectHangMs,
  decodeRecipient,
  FEE_ATOMIC,
  lateGraceMs,
  linkDown,
  linkGone,
  resolveOutboundPaymentId,
  runSendPipeline,
} from "@/lib/services/real-sdk/spend";
import { sweepOutbox } from "@/lib/services/real-sdk/wallets-index";
import type { SendTransactionInput, TransactionService } from "@/lib/services/transaction.service";
import { assertCanSpend } from "@/lib/services/view-only";
import type { QueuedTransaction, Transaction } from "@/lib/types";
import { walletCopy } from "@/lib/ui/wallet-copy";
import { ccxAmount } from "@/lib/utils";

const ATOMIC_PER_CCX = 10 ** COIN_UNIT_PLACES;

function intentFromSend(input: SendTransactionInput): IntentInput {
  const row: IntentInput = { address: input.address, amount: input.amount };
  if (input.paymentId !== undefined) row.paymentId = input.paymentId;
  if (input.message !== undefined) row.message = input.message;
  return row;
}

function queuedSend(
  input: SendTransactionInput,
  hash: string,
  queued: "auto" | "hung",
): Transaction {
  return {
    id: hash,
    hash,
    type: "send",
    amount: ccxAmount(input.amount),
    address: input.address,
    timestamp: new Date().toISOString(),
    blockHeight: 0,
    confirmations: 0,
    paymentId: input.paymentId,
    message: input.message,
    queued,
  };
}

function queueAuto(
  rt: SdkRuntime,
  input: SendTransactionInput,
  cause: "decoy" | "submit",
): Transaction {
  const row = enqueueAuto(rt, intentFromSend(input), cause);
  return queuedSend(input, row.id, "auto");
}

function queueHung(rt: SdkRuntime, input: SendTransactionInput, hash: string): Transaction {
  enqueueHung(rt, intentFromSend(input), hash);
  return queuedSend(input, hash, "hung");
}

export const realSdkTransactionService: TransactionService = {
  async listTransactions(): Promise<Transaction[]> {
    await ensureSdkReady();
    const rt = requireRuntime();
    // Drop clock-expired TTL message bodies + matching 0-conf pending rows so they
    // never linger as forever-pending in history (or a subsequent wallet export).
    const ttlDrop = dropExpiredTtl(rt.raw);
    if (ttlDrop.changed) {
      rt.raw = ttlDrop.raw;
      try {
        await persist();
      } catch {
        // Non-fatal: in-memory list is still pruned for this response.
      }
    }
    const networkHeight = await rt.daemon.getHeight();
    return mapTransactions(
      rt.state,
      networkHeight,
      readPendingRecords(rt.raw),
      readIncomingPendingRecords(rt.raw),
      indexMessageRecords(rt.raw),
    );
  },

  async sendTransaction(input: SendTransactionInput): Promise<Transaction> {
    await ensureSdkReady();
    const rt = requireRuntime();
    assertCanSpend(rt.viewOnly, walletCopy.viewOnlySendDisabled);

    await sweepOutbox(rt.storage);
    const amountAtomic = Math.round(input.amount * ATOMIC_PER_CCX);
    if (!Number.isFinite(amountAtomic) || amountAtomic <= 0) {
      throw new Error("Enter a valid amount to send.");
    }
    if (!isValidAddress(input.address)) {
      throw new Error("Invalid recipient address.");
    }

    const message = input.message?.trim() ?? "";
    const hasMessage = message.length > 0;
    if (hasMessage) {
      const bodyByteLength = new TextEncoder().encode(message).length;
      if (bodyByteLength > MAX_MESSAGE_BODY_BYTES) {
        throw new Error(`Message exceeds maximum length of ${MAX_MESSAGE_BODY_BYTES} bytes.`);
      }
    }

    const recipient = decodeRecipient(input.address);
    const paymentId = resolveOutboundPaymentId(input.paymentId, recipient);

    const balance = getBalance(rt.state);
    if (amountAtomic + FEE_ATOMIC > balance.spendable) {
      throw new Error("Amount exceeds available balance.");
    }

    // The fee fetch, node-fee construction, balance gates, input selection, decoy
    // fetch, build, submit, and the post-OK optimistic records live in ONE shared
    // pipeline (spend.ts runSendPipeline) shared with the intent-drain retry path —
    // only input validation and the failure→retry mapping are per-caller here. A
    // thrown fee-address fetch is a connect fail → decoy enqueue (do not use
    // safeNodeFeeAddress here; that helper swallows errors for other spenders).
    const gate = { live: true };
    let builtHash: string | undefined;
    let savedIntent: Transaction | undefined;

    const body = async (): Promise<Transaction | "abandoned"> => {
      if (linkDown()) {
        savedIntent = queueAuto(rt, input, "decoy");
        return savedIntent;
      }
      const result = await runSendPipeline(
        rt,
        {
          address: input.address,
          amountAtomic,
          recipient,
          ...(paymentId ? { paymentId } : {}),
          hasMessage,
          message,
        },
        {
          gate: () => gate.live,
          onBuilt: (hash) => {
            builtHash = hash;
          },
        },
      );
      if (!result.ok) {
        const failure = result.failure;
        if (failure.reason === "unfunded") {
          throw new Error("Amount exceeds available balance.");
        }
        if (failure.reason === "select") {
          throw failure.error;
        }
        if (failure.reason === "skip") {
          return "abandoned";
        }
        if (!gate.live) return "abandoned";
        if (failure.reason === "submit" && failure.timedOut) {
          savedIntent = queueHung(rt, input, failure.hash);
        } else {
          savedIntent = queueAuto(rt, input, failure.reason === "submit" ? "submit" : "decoy");
        }
        return savedIntent;
      }

      const sent = result.sent;
      // Tip is display-only here. A live getHeight after relay can hang when the
      // link drops, leaving Confirm on Sending… even though the hex already left.
      const networkHeight = rt.state.scannedHeight;
      const fromHistory = mapTransactions(
        rt.state,
        networkHeight,
        readPendingRecords(rt.raw),
        readIncomingPendingRecords(rt.raw),
        indexMessageRecords(rt.raw),
      ).find((tx) => tx.hash === sent.hash);
      if (fromHistory) {
        return {
          ...fromHistory,
          address: input.address,
          paymentId: input.paymentId,
          message: input.message,
        };
      }
      return {
        ...mapTransaction(
          { hash: sent.hash, height: 0, amount: sent.amountAtomic, direction: "out" },
          networkHeight,
        ),
        type: "send",
        address: input.address,
        paymentId: input.paymentId,
        message: input.message,
      };
    };

    const done = body();
    void done.catch(() => {});
    let hangTimer: ReturnType<typeof setTimeout> | undefined;
    const winner = await Promise.race([
      done.then((row) => ({ kind: "done" as const, row })),
      new Promise<{ kind: "timeout" }>((resolve) => {
        hangTimer = setTimeout(() => resolve({ kind: "timeout" }), connectHangMs);
      }),
    ]);
    if (hangTimer !== undefined) clearTimeout(hangTimer);

    if (winner.kind === "done") {
      return winner.row === "abandoned" ? queueAuto(rt, input, "decoy") : winner.row;
    }
    if (!(await linkGone(rt.daemon))) {
      const late = await Promise.race([
        done.then((r) => ({ kind: "done" as const, r })),
        new Promise<{ kind: "timeout" }>((resolve) =>
          setTimeout(() => resolve({ kind: "timeout" }), lateGraceMs),
        ),
      ]);
      if (late.kind === "done") {
        return late.r === "abandoned" ? queueAuto(rt, input, "decoy") : late.r;
      }
    }
    gate.live = false;
    if (savedIntent) return savedIntent;
    if (builtHash) return queueHung(rt, input, builtHash);
    return queueAuto(rt, input, "decoy");
  },

  async listQueuedTransactions(): Promise<QueuedTransaction[]> {
    await ensureSdkReady();
    const rt = requireRuntime();
    await sweepOutbox(rt.storage);
    return listIntents(rt).map((row) => mapIntent(row));
  },

  async cancelQueuedTransaction(id: string): Promise<boolean> {
    await ensureSdkReady();
    const rt = requireRuntime();
    return cancelIntent(rt, id);
  },

  async submitHungIntent(id: string): Promise<boolean> {
    await ensureSdkReady();
    const rt = requireRuntime();
    return submitHung(rt, id);
  },
};
