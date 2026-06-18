import { isValidAddress, transactions as txns } from "conceal-wallet-sdk";
import {
  MAX_MESSAGE_SIZE,
  MESSAGE_TX_AMOUNT_ATOMIC,
  REMOTE_NODE_FEE_ATOMIC,
  WALLET_DONATION_ADDRESS,
} from "@/lib/config/config";
import { threadKeyFor } from "@/lib/services/real-sdk/mappers";
import {
  readReceivedRecords,
  readSentRecords,
  type SdkMessageRecord,
  shortName,
  toMessage,
  withReceivedRecords,
  withSentRecords,
} from "@/lib/services/real-sdk/messages-store";
import { ensureSdkReady } from "@/lib/services/real-sdk/ready";
import { persist, requireRuntime, type SdkRuntime, sync } from "@/lib/services/real-sdk/runtime";
import {
  broadcast,
  decodeRecipient,
  FEE_ATOMIC,
  fetchDecoys,
  MIXIN,
  ownKeys,
  unspentOutputs,
} from "@/lib/services/real-sdk/spend";
import type { MessageService, SendMessageInput } from "@/lib/services/message.service";
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
    if (bodyByteLength > MAX_MESSAGE_SIZE) {
      throw new Error(`Message exceeds maximum length of ${MAX_MESSAGE_SIZE} bytes.`);
    }

    const destinationAddress = input.recipientAddress.trim();
    if (!isValidAddress(destinationAddress)) {
      throw new Error("Invalid recipient address.");
    }

    const recipient = decodeRecipient(destinationAddress);
    const ttlUnixSeconds = input.ttlUnix && input.ttlUnix > 0 ? input.ttlUnix : 0;
    const hasTtl = ttlUnixSeconds > 0;

    // Node fee only applies to a non-TTL (mined) message; decode defensively.
    let nodeFee: { spendPublicKey: string; viewPublicKey: string; amount: number } | null = null;
    if (!hasTtl) {
      const feeAddress = await safeNodeFeeAddress(rt.daemon);
      if (feeAddress && feeAddress !== rt.account.address) {
        const target = isValidAddress(feeAddress) ? feeAddress : WALLET_DONATION_ADDRESS;
        const decoded = decodeRecipient(target);
        nodeFee = {
          spendPublicKey: decoded.spendPublicKey,
          viewPublicKey: decoded.viewPublicKey,
          amount: REMOTE_NODE_FEE_ATOMIC,
        };
      }
    }

    const outputs = unspentOutputs(rt);
    const decoys = await fetchDecoys(rt, outputs);
    const built = txns.buildMessageTransaction({
      keys: rt.account.keys,
      recipient: {
        spendPublicKey: recipient.spendPublicKey,
        viewPublicKey: recipient.viewPublicKey,
      },
      body,
      changeKeys: ownKeys(rt),
      unspentOutputs: outputs,
      decoys,
      fee: FEE_ATOMIC,
      mixin: MIXIN,
      ttlUnixSeconds,
      nodeFee,
      messageAmount: MESSAGE_TX_AMOUNT_ATOMIC,
    });

    const paymentId = input.paymentId?.trim() || undefined;
    const record: SdkMessageRecord = {
      id: built.hash,
      direction: "sent",
      counterpartyAddress: destinationAddress,
      counterpartyName: shortName(destinationAddress),
      body,
      hasBody: true,
      sentTo: destinationAddress,
      paymentIdFrom: null,
      paymentIdTo: paymentId ?? null,
      timestamp: new Date().toISOString(),
      unread: false,
      blockHeight: 0,
      threadKey: threadKeyFor(destinationAddress, paymentId),
      ...(hasTtl ? { ttlExpiresAt: ttlUnixSeconds } : {}),
    };

    // Broadcast FIRST; only record the sent copy AFTER the relay succeeds so a
    // broadcast failure can't leave a phantom sent message persisted in the blob.
    // (Our own outbound is never misclassified as inbound: it has no owned
    // 100-atomic marker output, and its hash joins `sentMessages` before it mines.)
    await broadcast(rt, built);
    rt.raw = withSentRecords(rt.raw, [...readSentRecords(rt.raw), record]);
    await persist();

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
