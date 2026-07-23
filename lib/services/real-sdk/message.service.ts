import {
  isValidAddress,
  MAX_MESSAGE_BODY_BYTES,
  MESSAGE_TX_AMOUNT_ATOMIC,
  REMOTE_NODE_FEE_ATOMIC,
  transactions as txns,
} from "conceal-wallet-sdk";
import type { MessageService, SendMessageInput } from "@/lib/services/message.service";
import { sdkAddrBook } from "@/lib/services/real-sdk/address-book.service";
import {
  createSentMessageRecord,
  dropExpiredTtl,
  readReceivedRecords,
  readSentRecords,
  type SdkMessageRecord,
  toMessage,
  withReceivedRecords,
  withSentRecords,
} from "@/lib/services/real-sdk/messages-store";
import { addPendingRecord } from "@/lib/services/real-sdk/pending-store";
import { ensureSdkReady } from "@/lib/services/real-sdk/ready";
import { persist, requireRuntime, type SdkRuntime, sync } from "@/lib/services/real-sdk/runtime";
import {
  broadcast,
  decodeFeeRecipient,
  decodeRecipient,
  FEE_ATOMIC,
  fetchDecoys,
  MIXIN,
  ownKeys,
  resolveOutboundPaymentId,
  safeNodeFeeAddress,
  selectableOutputs,
} from "@/lib/services/real-sdk/spend";
import { assertCanSpend } from "@/lib/services/view-only";
import type { Message } from "@/lib/types";
import { walletCopy } from "@/lib/ui/wallet-copy";

/** All persisted records (sent + received) for the open wallet. */
function allRecords(rt: SdkRuntime): SdkMessageRecord[] {
  return [...readSentRecords(rt.raw), ...readReceivedRecords(rt.raw)];
}

export const realSdkMessageService: MessageService = {
  async listMessages(): Promise<Message[]> {
    await ensureSdkReady();
    const rt = requireRuntime();
    // Surface received messages reconstructed during sync alongside sent copies; a
    // fresh sync is what populates inbound history (no-op once caught up).
    await sync();
    // Drop clock-expired TTL copies before the UI (and any follow-on export) sees them.
    const ttlDrop = dropExpiredTtl(rt.raw);
    if (ttlDrop.changed) {
      rt.raw = ttlDrop.raw;
      try {
        await persist();
      } catch {
        // Non-fatal: in-memory list is still pruned for this response.
      }
    }
    return allRecords(rt)
      .map(toMessage)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  },

  async sendMessage(input: SendMessageInput): Promise<Message> {
    await ensureSdkReady();
    const rt = requireRuntime();
    assertCanSpend(rt.viewOnly, walletCopy.viewOnlyMessageDisabled);

    const body = input.body.trim();
    if (!body) throw new Error("Message is required.");
    const bodyByteLength = new TextEncoder().encode(body).length;
    if (bodyByteLength > MAX_MESSAGE_BODY_BYTES) {
      throw new Error(`Message exceeds maximum length of ${MAX_MESSAGE_BODY_BYTES} bytes.`);
    }

    const destinationAddress = input.recipientAddress.trim();
    if (!isValidAddress(destinationAddress)) {
      throw new Error("Invalid recipient address.");
    }

    const recipient = decodeRecipient(destinationAddress);
    const paymentId = resolveOutboundPaymentId(input.paymentId, recipient);
    const ttlUnixSeconds = input.ttlUnix && input.ttlUnix > 0 ? input.ttlUnix : 0;
    const hasTtl = ttlUnixSeconds > 0;

    // Node fee only applies to a non-TTL (mined) message; decode defensively.
    let nodeFee: { spendPublicKey: string; viewPublicKey: string; amount: number } | null = null;
    if (!hasTtl) {
      const feeAddress = await safeNodeFeeAddress(rt.daemon);
      if (feeAddress && feeAddress !== rt.account.address) {
        const decoded = decodeFeeRecipient(feeAddress);
        nodeFee = {
          spendPublicKey: decoded.spendPublicKey,
          viewPublicKey: decoded.viewPublicKey,
          amount: REMOTE_NODE_FEE_ATOMIC,
        };
      }
    }

    const outputs = await selectableOutputs(rt);
    const messageAmount = MESSAGE_TX_AMOUNT_ATOMIC;
    const feeForSelect = hasTtl ? 0 : FEE_ATOMIC;
    const nodeFeeAtomic = nodeFee ? REMOTE_NODE_FEE_ATOMIC : 0;
    const { selected } = txns.selectInputs(outputs, messageAmount + feeForSelect + nodeFeeAtomic);
    const decoys = await fetchDecoys(rt, selected);
    const built = txns.buildMessageTransaction({
      keys: rt.account.keys,
      recipient: {
        spendPublicKey: recipient.spendPublicKey,
        viewPublicKey: recipient.viewPublicKey,
      },
      body,
      changeKeys: ownKeys(rt),
      unspentOutputs: selected,
      decoys,
      fee: FEE_ATOMIC,
      mixin: MIXIN,
      ttlUnixSeconds,
      nodeFee,
      messageAmount,
      ...(paymentId ? { paymentId: paymentId as txns.Hex } : {}),
    });

    const record: SdkMessageRecord = createSentMessageRecord({
      hash: built.hash,
      recipientAddress: destinationAddress,
      body,
      paymentId,
      timestampIso: new Date().toISOString(),
      ...(hasTtl ? { ttlExpiresAt: ttlUnixSeconds } : {}),
    });

    // Broadcast FIRST; only record the sent copy AFTER the relay succeeds so a
    // broadcast failure can't leave a phantom sent message persisted in the blob.
    // (Our own outbound is never misclassified as inbound: the body was encrypted to
    // the RECIPIENT's spend key, so it never decrypts as ours during scan, and its
    // hash joins `sentMessages` before it mines as a backstop.)
    await broadcast(rt, built);
    rt.raw = addPendingRecord(rt.raw, {
      hash: built.hash,
      type: "message",
      amountAtomic:
        destinationAddress === rt.account.address ? built.fee : built.sentAmount + built.fee,
      timestampIso: new Date().toISOString(),
      address: destinationAddress,
      ...(paymentId ? { paymentId } : {}),
      spentKeyImages: built.inputs.map((vin) => vin.keyImage),
      ...(hasTtl ? { ttlExpiresAt: ttlUnixSeconds } : {}),
    });
    rt.raw = withSentRecords(rt.raw, [...readSentRecords(rt.raw), record]);
    try {
      await persist();
    } catch {
      // Non-fatal: the message is already relayed, so failing here would invite a
      // retry → double-spend. Only the sender's UI copy is lost; sync reconciles it.
    }

    if (paymentId) {
      try {
        await sdkAddrBook.saveOutboundPid(destinationAddress, paymentId);
      } catch {
        // Non-fatal: message already sent; contact row can be repaired on next send.
      }
    }

    return toMessage(record);
  },

  async markRead(id: string): Promise<Message> {
    await ensureSdkReady();
    const rt = requireRuntime();
    // A message may live in either array (sent copies start read; received start
    // unread) — flip the unread flag wherever its tx hash matches.
    const sent = readSentRecords(rt.raw);
    const received = readReceivedRecords(rt.raw);
    const match = [...sent, ...received].find((record) => record.id === id);
    if (match === undefined) {
      throw new Error("Message not found.");
    }
    rt.raw = withSentRecords(
      rt.raw,
      sent.map((record) => (record.id === id ? { ...record, unread: false } : record)),
    );
    rt.raw = withReceivedRecords(
      rt.raw,
      received.map((record) => (record.id === id ? { ...record, unread: false } : record)),
    );
    await persist();
    return toMessage({ ...match, unread: false });
  },
};
