import {
  COIN_UNIT_PLACES,
  getBalance,
  isValidAddress,
  MAX_MESSAGE_BODY_BYTES,
  REMOTE_NODE_FEE_ATOMIC,
  transactions as txns,
} from "conceal-wallet-sdk";
import { sdkAddrBook } from "@/lib/services/real-sdk/address-book.service";
import { readIncomingPendingRecords } from "@/lib/services/real-sdk/incoming-pending-store";
import {
  mapQueuedTransaction,
  mapTransaction,
  mapTransactions,
} from "@/lib/services/real-sdk/mappers";
import {
  createSentMessageRecord,
  dropExpiredTtl,
  indexMessageRecords,
  readSentRecords,
  withSentRecords,
} from "@/lib/services/real-sdk/messages-store";
import { queueForRuntime } from "@/lib/services/real-sdk/outbound-queue";
import {
  addPendingRecord,
  readPendingRecords,
  withPendingRecords,
} from "@/lib/services/real-sdk/pending-store";
import { ensureSdkReady } from "@/lib/services/real-sdk/ready";
import { persist, persistRuntime, requireRuntime } from "@/lib/services/real-sdk/runtime";
import {
  decodeFeeRecipient,
  decodeRecipient,
  enqueueAndBroadcast,
  FEE_ATOMIC,
  fetchDecoys,
  MIXIN,
  ownKeys,
  paymentIdExtraForSend,
  resolveOutboundPaymentId,
  safeNodeFeeAddress,
  selectableOutputs,
} from "@/lib/services/real-sdk/spend";
import type { SendTransactionInput, TransactionService } from "@/lib/services/transaction.service";
import { assertCanSpend } from "@/lib/services/view-only";
import type { QueuedTransaction, Transaction } from "@/lib/types";
import { walletCopy } from "@/lib/ui/wallet-copy";

const ATOMIC_PER_CCX = 10 ** COIN_UNIT_PLACES;

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

    // Resolve the remote-node fee BEFORE the balance check so its 10000-atomic
    // destination is counted: a node fee is added when the node advertises a fee
    // address that isn't ours (bounded to the donation address when undecodable —
    // mirrors the legacy guard). Omitting it from the check would let a max-balance
    // send pass here only to fail inside the builder on insufficient inputs.
    const feeAddress = await safeNodeFeeAddress(rt.daemon);
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

    const balance = getBalance(rt.state);
    if (amountAtomic + FEE_ATOMIC + nodeFeeAtomic > balance.spendable) {
      throw new Error("Amount exceeds available balance.");
    }

    const outputs = await selectableOutputs(rt);
    const decoys = await fetchDecoys(rt, outputs);

    // A transfer that carries a message is built as a message tx so the encrypted body
    // rides in tx_extra (recipient surfaces it, and we keep a sender copy). The
    // recipient still receives the full `amountAtomic` via `messageAmount`.
    const built = hasMessage
      ? txns.buildMessageTransaction({
          keys: rt.account.keys,
          recipient: {
            spendPublicKey: recipient.spendPublicKey,
            viewPublicKey: recipient.viewPublicKey,
          },
          body: message,
          changeKeys: ownKeys(rt),
          unspentOutputs: outputs,
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
          destinations: plainDestinations(recipient, amountAtomic, nodeFee),
          changeKeys: ownKeys(rt),
          unspentOutputs: outputs,
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

    // Durable broadcast (#92): the tx is persisted in the outbound queue BEFORE any network
    // I/O, so a dropped connection can't lose it. A `failed` state means the daemon rejected
    // the relay (e.g. a stale input) — surface that as an error; `broadcast`/`pending` both
    // mean the payment is safely committed (pending = queued for the drainer to retry).
    const broadcastState = await enqueueAndBroadcast(rt, built, {
      label: `Send ${input.amount} CCX`,
    });
    if (broadcastState === "failed") {
      throw new Error("The network rejected this transaction. Your balance is unchanged.");
    }

    // Optimistic pending entry (show the outgoing tx + hold the balance until it mines,
    // and lock its inputs against re-selection) plus, if present, the sender's message
    // copy — mutated together and persisted once.
    rt.raw = addPendingRecord(rt.raw, {
      hash: built.hash,
      amountAtomic:
        input.address === rt.account.address
          ? FEE_ATOMIC + nodeFeeAtomic
          : amountAtomic + FEE_ATOMIC + nodeFeeAtomic,
      timestampIso: new Date().toISOString(),
      address: input.address,
      ...(paymentId ? { paymentId } : {}),
      spentKeyImages: built.inputs.map((vin) => vin.keyImage),
    });
    if (hasMessage) {
      rt.raw = withSentRecords(rt.raw, [
        ...readSentRecords(rt.raw),
        createSentMessageRecord({
          hash: built.hash,
          recipientAddress: input.address,
          body: message,
          paymentId,
          timestampIso: new Date().toISOString(),
        }),
      ]);
    }
    try {
      await persist();
    } catch {
      // Non-fatal: the tx is already relayed (broadcast persisted state itself), so
      // failing the send here would invite a retry → double-spend. Losing only the
      // optimistic pending / message UI records is acceptable; sync reconciles them.
    }

    if (paymentId) {
      try {
        await sdkAddrBook.saveOutboundPid(input.address, paymentId);
      } catch {
        // Non-fatal: payment already sent.
      }
    }

    const networkHeight = await rt.daemon.getHeight();
    const fromHistory = mapTransactions(
      rt.state,
      networkHeight,
      readPendingRecords(rt.raw),
      readIncomingPendingRecords(rt.raw),
      indexMessageRecords(rt.raw),
    ).find((tx) => tx.hash === built.hash);
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
        { hash: built.hash, height: 0, amount: amountAtomic, direction: "out" },
        networkHeight,
      ),
      type: "send",
      address: input.address,
      paymentId: input.paymentId,
      message: input.message,
    };
  },

  async listQueuedTransactions(): Promise<QueuedTransaction[]> {
    await ensureSdkReady();
    const rt = requireRuntime();
    const entries = await queueForRuntime(rt).list();
    return entries.map(mapQueuedTransaction);
  },

  async cancelQueuedTransaction(id: string): Promise<boolean> {
    await ensureSdkReady();
    const rt = requireRuntime();
    const queue = queueForRuntime(rt);
    // `cancel` frees a still-PENDING entry's reserved inputs. A "broadcast" entry is LIVE on
    // the network — removing it would free its inputs while the tx can still mine, inviting a
    // double-spend — so it must NOT be removed; only a "failed" entry can be dismissed, and an
    // unknown id is a no-op (#92 review — Gemini/Codex/GLM #2/#5).
    const cancelled = await queue.cancel(id);
    if (!cancelled) {
      const entry = (await queue.list()).find((e) => e.id === id);
      if (!entry || entry.state === "broadcast") return false;
      await queue.remove(id); // dismiss a failed entry
    }
    // Cancelling/dismissing also clears the matching optimistic-pending row + balance hold.
    // The queue id IS the tx hash (SDK guarantees `entry.id === entry.hash`).
    const pending = readPendingRecords(rt.raw);
    const remaining = pending.filter((record) => record.hash !== id);
    if (remaining.length !== pending.length) {
      rt.raw = withPendingRecords(rt.raw, remaining);
      await persistRuntime(rt);
    }
    return true;
  },
};

/** Destinations for a plain (no-message) transfer: recipient + optional node fee. */
function plainDestinations(
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
