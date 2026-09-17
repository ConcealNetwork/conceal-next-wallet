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
import { submitHung } from "@/lib/services/real-sdk/intent-drain";
import { mapTransaction, mapTransactions } from "@/lib/services/real-sdk/mappers";
import {
  createSentMessageRecord,
  dropExpiredTtl,
  indexMessageRecords,
  readSentRecords,
  withSentRecords,
} from "@/lib/services/real-sdk/messages-store";
import { addPendingRecord, readPendingRecords } from "@/lib/services/real-sdk/pending-store";
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
  decodeFeeRecipient,
  decodeRecipient,
  FEE_ATOMIC,
  fetchDecoys,
  linkGone,
  MIXIN,
  ownKeys,
  paymentIdExtraForSend,
  recordTxPrivateKey,
  resolveOutboundPaymentId,
  selectableOutputs,
  selectSpendInputs,
  submitRawHex,
} from "@/lib/services/real-sdk/spend";
import { sweepOutbox } from "@/lib/services/real-sdk/wallets-index";
import type { SendTransactionInput, TransactionService } from "@/lib/services/transaction.service";
import { assertCanSpend } from "@/lib/services/view-only";
import type { QueuedTransaction, Transaction } from "@/lib/types";
import { walletCopy } from "@/lib/ui/wallet-copy";
import { ccxAmount } from "@/lib/utils";

const ATOMIC_PER_CCX = 10 ** COIN_UNIT_PLACES;
const enqueueAt = new Map<string, number>();

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

function stampEnqueue(id: string): void {
  enqueueAt.set(id, Date.now());
}

function queueAuto(
  rt: SdkRuntime,
  input: SendTransactionInput,
  cause: "decoy" | "submit",
): Transaction {
  const row = enqueueAuto(rt, intentFromSend(input), cause);
  stampEnqueue(row.id);
  return queuedSend(input, row.id, "auto");
}

function queueHung(rt: SdkRuntime, input: SendTransactionInput, hash: string): Transaction {
  const row = enqueueHung(rt, intentFromSend(input), hash);
  stampEnqueue(row.id);
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

    // Resolve the remote-node fee BEFORE the full balance check so its 10000-atomic
    // destination is counted: a node fee is added when the node advertises a fee
    // address that isn't ours (bounded to the donation address when undecodable —
    // mirrors the legacy guard). Omitting it from the check would let a max-balance
    // send pass here only to fail inside the builder on insufficient inputs.
    // A thrown fee-address fetch is a connect fail → decoy enqueue (do not use
    // safeNodeFeeAddress here; that helper swallows errors for other spenders).
    // The no-node-fee floor above still throws first so an unfunded first Send
    // cannot queue when the fee RPC is down.
    const gate = { live: true };
    let builtHash: string | undefined;

    const body = async (): Promise<Transaction | "abandoned"> => {
      let feeAddress: string;
      try {
        feeAddress = await rt.daemon.getNodeFeeAddress();
      } catch {
        return gate.live ? queueAuto(rt, input, "decoy") : "abandoned";
      }
      if (!gate.live) return "abandoned";
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

      if (amountAtomic + FEE_ATOMIC + nodeFeeAtomic > balance.spendable) {
        throw new Error("Amount exceeds available balance.");
      }

      const outputs = await selectableOutputs(rt);
      const target = amountAtomic + FEE_ATOMIC + nodeFeeAtomic;
      const { selected } = selectSpendInputs(outputs, target);
      let decoys: txns.DecoySet[];
      try {
        decoys = await fetchDecoys(rt, selected);
      } catch {
        return gate.live ? queueAuto(rt, input, "decoy") : "abandoned";
      }
      if (!gate.live) return "abandoned";

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
            destinations: plainDestinations(recipient, amountAtomic, nodeFee),
            changeKeys: ownKeys(rt),
            unspentOutputs: selected,
            decoys,
            fee: FEE_ATOMIC,
            mixin: MIXIN,
            ...(paymentId
              ? {
                  buildExtraRecords: ({ secretKey }) =>
                    paymentIdExtraForSend(
                      paymentId,
                      recipient.viewPublicKey,
                      secretKey,
                    ) as txns.Hex,
                }
              : {}),
          });

      builtHash = built.hash;
      if (!gate.live) return "abandoned";

      let submitStatus: string | undefined;
      try {
        const result = await submitRawHex(rt.daemon, built.serialized);
        submitStatus = result?.status;
      } catch (error) {
        if (!gate.live) return "abandoned";
        const hung = error instanceof Error && error.message === "submit hung";
        if (hung) return queueHung(rt, input, built.hash);
        return queueAuto(rt, input, "submit");
      }
      if (!gate.live) return "abandoned";
      if (submitStatus !== "OK") {
        return queueAuto(rt, input, "submit");
      }

      // Optimistic pending entry (show the outgoing tx + hold the balance until it mines,
      // and lock its inputs against re-selection) plus, if present, the sender's message
      // copy — mutated together and persisted once. No parked hex.
      recordTxPrivateKey(rt, built);
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
        // Non-fatal: the tx is already relayed, so failing the send here would invite
        // a retry → double-spend. Losing only the optimistic pending / message UI
        // records is acceptable; sync reconciles them.
      }

      if (paymentId) {
        try {
          await sdkAddrBook.saveOutboundPid(input.address, paymentId);
        } catch {
          // Non-fatal: payment already sent.
        }
      }

      // Tip is display-only here. A live getHeight after relay can hang when the
      // link drops, leaving Confirm on Sending… even though the hex already left.
      const networkHeight = rt.state.scannedHeight;
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
    };

    const done = body();
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
    if (await linkGone(rt.daemon)) {
      gate.live = false;
      if (builtHash) return queueHung(rt, input, builtHash);
      return queueAuto(rt, input, "decoy");
    }
    const late = await done;
    return late === "abandoned" ? queueAuto(rt, input, "decoy") : late;
  },

  async listQueuedTransactions(): Promise<QueuedTransaction[]> {
    await ensureSdkReady();
    const rt = requireRuntime();
    await sweepOutbox(rt.storage);
    return listIntents(rt).map((row) => mapIntent(row, enqueueAt.get(row.id) ?? 0));
  },

  async cancelQueuedTransaction(id: string): Promise<boolean> {
    await ensureSdkReady();
    const rt = requireRuntime();
    enqueueAt.delete(id);
    return cancelIntent(rt, id);
  },

  async submitHungIntent(id: string): Promise<boolean> {
    await ensureSdkReady();
    const rt = requireRuntime();
    return submitHung(rt, id);
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
