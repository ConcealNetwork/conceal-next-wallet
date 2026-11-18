import {
  isValidAddress,
  MAX_MESSAGE_BODY_BYTES,
} from "conceal-wallet-sdk";
import type { MessageService, SendMessageInput } from "@/lib/services/message.service";
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
import { enqueueAuto, enqueueHung, type IntentDraft } from "@/lib/services/real-sdk/send-intent";
import { ensureSdkReady } from "@/lib/services/real-sdk/ready";
import { persist, requireRuntime, type SdkRuntime, sync } from "@/lib/services/real-sdk/runtime";
import {
  decodeRecipient,
  resolveOutboundPaymentId,
  runMessagePipeline,
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

    const draft: IntentDraft = {
      kind: "message",
      recipientAddress: destinationAddress,
      body,
      ...(input.paymentId !== undefined ? { paymentId: input.paymentId } : {}),
      ...(ttlUnixSeconds > 0 ? { ttlUnixSeconds } : {}),
    };

    // Build + submit through the SAME classified pipeline the intent drain uses:
    // a transient failure parks a session intent and returns a queued Message
    // (the UI toasts "saved to send after sync"), while validation failures above
    // and a short balance stay visible errors. The sent copy + pending record are
    // written only after the relay accepted.
    const result = await runMessagePipeline(
      rt,
      {
        recipientAddress: destinationAddress,
        body,
        ...(paymentId ? { paymentId } : {}),
        ttlUnixSeconds,
      },
      { gate: () => true },
    );
    if (!result.ok) {
      const failure = result.failure;
      if (failure.reason === "unfunded") {
        throw new Error("Not enough unlocked balance to send a message.");
      }
      if (failure.reason === "select") {
        throw failure.error;
      }
      if (failure.reason === "submit" && failure.timedOut) {
        enqueueHung(rt, draft, failure.hash);
        return queuedMessageView(
          destinationAddress,
          body,
          paymentId,
          ttlUnixSeconds,
          "hung",
          failure.hash,
        );
      }
      const row = enqueueAuto(rt, draft, failure.reason === "decoy" ? "decoy" : "submit");
      return queuedMessageView(
        destinationAddress,
        body,
        paymentId,
        ttlUnixSeconds,
        "auto",
        row.id,
      );
    }

    return toMessage(result.sent.record);
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

/**
 * Transient queued view for a merely-parked message: display-only (the page
 * toasts "saved to send after sync"). The record is built in memory — never
 * persisted, and `queued` never lands on a stored SdkMessageRecord.
 */
function queuedMessageView(
  recipientAddress: string,
  body: string,
  paymentId: string | undefined,
  ttlUnixSeconds: number,
  queued: "auto" | "hung",
  id: string,
): Message {
  const record = createSentMessageRecord({
    hash: id,
    recipientAddress,
    body,
    paymentId,
    timestampIso: new Date().toISOString(),
    ...(ttlUnixSeconds > 0 ? { ttlExpiresAt: ttlUnixSeconds } : {}),
  });
  return { ...toMessage(record), id, queued };
}
