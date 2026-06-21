import { getBalance, isValidAddress, transactions as txns } from "conceal-wallet-sdk";
import {
  COIN_UNIT_PLACES,
  MAX_MESSAGE_SIZE,
  REMOTE_NODE_FEE_ATOMIC,
  WALLET_DONATION_ADDRESS,
} from "@/lib/config/config";
import { mapTransaction, mapTransactions } from "@/lib/services/real-sdk/mappers";
import {
  createSentMessageRecord,
  readSentRecords,
  withSentRecords,
} from "@/lib/services/real-sdk/messages-store";
import { addPendingRecord, readPendingRecords } from "@/lib/services/real-sdk/pending-store";
import { readIncomingPendingRecords } from "@/lib/services/real-sdk/incoming-pending-store";
import { ensureSdkReady } from "@/lib/services/real-sdk/ready";
import { persist, requireRuntime } from "@/lib/services/real-sdk/runtime";
import {
  broadcast,
  decodeRecipient,
  FEE_ATOMIC,
  fetchDecoys,
  MIXIN,
  ownKeys,
  unspentOutputs,
} from "@/lib/services/real-sdk/spend";
import type { SendTransactionInput, TransactionService } from "@/lib/services/transaction.service";
import { assertCanSpend } from "@/lib/services/view-only";
import type { Transaction } from "@/lib/types";
import { walletCopy } from "@/lib/ui/wallet-copy";

const ATOMIC_PER_CCX = 10 ** COIN_UNIT_PLACES;

export const realSdkTransactionService: TransactionService = {
  async listTransactions(): Promise<Transaction[]> {
    await ensureSdkReady();
    const rt = requireRuntime();
    const networkHeight = await rt.daemon.getHeight();
    return mapTransactions(
      rt.state,
      networkHeight,
      readPendingRecords(rt.raw),
      readIncomingPendingRecords(rt.raw),
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
      if (bodyByteLength > MAX_MESSAGE_SIZE) {
        throw new Error(`Message exceeds maximum length of ${MAX_MESSAGE_SIZE} bytes.`);
      }
    }

    const recipient = decodeRecipient(input.address);

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

    const outputs = unspentOutputs(rt);
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
        })
      : txns.buildTransaction({
          keys: rt.account.keys,
          destinations: plainDestinations(recipient, amountAtomic, nodeFee),
          changeKeys: ownKeys(rt),
          unspentOutputs: outputs,
          decoys,
          fee: FEE_ATOMIC,
          mixin: MIXIN,
        });

    await broadcast(rt, built);

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
      ...(input.paymentId?.trim() ? { paymentId: input.paymentId.trim() } : {}),
      spentKeyImages: built.inputs.map((vin) => vin.keyImage),
    });
    if (hasMessage) {
      rt.raw = withSentRecords(rt.raw, [
        ...readSentRecords(rt.raw),
        createSentMessageRecord({
          hash: built.hash,
          recipientAddress: input.address,
          body: message,
          paymentId: input.paymentId?.trim() || undefined,
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

    const networkHeight = await rt.daemon.getHeight();
    const fromHistory = mapTransactions(rt.state, networkHeight).find(
      (tx) => tx.hash === built.hash,
    );
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

/** The node's advertised fee address, or `""` when it charges none / on error. */
async function safeNodeFeeAddress(daemon: {
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
function decodeFeeRecipient(feeAddress: string): {
  spendPublicKey: string;
  viewPublicKey: string;
} {
  const target = isValidAddress(feeAddress) ? feeAddress : WALLET_DONATION_ADDRESS;
  return decodeRecipient(target);
}
