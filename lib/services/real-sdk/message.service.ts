import { isValidAddress, MAX_MESSAGE_BODY_BYTES } from "conceal-wallet-sdk";
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
import { ensureSdkReady } from "@/lib/services/real-sdk/ready";
import { persist, requireRuntime, type SdkRuntime, sync } from "@/lib/services/real-sdk/runtime";
import { enqueueAuto, enqueueHung, type IntentDraft } from "@/lib/services/real-sdk/send-intent";
import {
  decodeRecipient,
  linkDown,
  raceLinkHang,
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

    // Same hang window as send. A lost link before a hash exists parks one auto
    // intent. A submit timeout after a hash exists parks hung. Validation failures
    // above and a short balance still throw.
    const request = {
      recipientAddress: destinationAddress,
      body,
      ...(paymentId ? { paymentId } : {}),
      ttlUnixSeconds,
    };
    const gate = { live: true };
    let builtHash: string | undefined;
    let saved: Message | undefined;

    const parkAuto = (cause: "decoy" | "submit" = "decoy"): Message => {
      if (saved) return saved;
      const row = enqueueAuto(rt, draft, cause);
      saved = queuedMessageView(
        destinationAddress,
        body,
        paymentId,
        ttlUnixSeconds,
        "auto",
        row.id,
      );
      return saved;
    };

    const attempt = async (): Promise<Message | "abandoned"> => {
      if (linkDown()) return parkAuto();
      const result = await runMessagePipeline(rt, request, {
        gate: () => gate.live,
        onBuilt: (hash) => {
          builtHash = hash;
        },
      });
      if (!result.ok) {
        if (!gate.live || result.failure.reason === "skip") return "abandoned";
        const failure = result.failure;
        if (failure.reason === "unfunded") {
          throw new Error("Not enough unlocked balance to send a message.");
        }
        if (failure.reason === "select") throw failure.error;
        if (failure.reason === "submit" && failure.timedOut) {
          enqueueHung(rt, draft, failure.hash);
          saved = queuedMessageView(
            destinationAddress,
            body,
            paymentId,
            ttlUnixSeconds,
            "hung",
            failure.hash,
          );
          return saved;
        }
        return parkAuto(failure.reason === "submit" ? "submit" : "decoy");
      }
      return toMessage(result.sent.record);
    };

    return raceLinkHang({
      done: attempt(),
      daemon: rt.daemon,
      killGate: () => {
        gate.live = false;
      },
      saved: () => saved,
      parkAuto,
      parkHung: () => {
        if (!builtHash) return undefined;
        enqueueHung(rt, draft, builtHash);
        saved = queuedMessageView(
          destinationAddress,
          body,
          paymentId,
          ttlUnixSeconds,
          "hung",
          builtHash,
        );
        return saved;
      },
    });
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
