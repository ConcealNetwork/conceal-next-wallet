import { isTtlExpired } from "@/lib/messages/ttl";
import { mockMessages } from "@/lib/mock-data/wallet";
import type { MessageService } from "@/lib/services/message.service";
import { mockAddrBook } from "@/lib/services/mock/address-book.service";
import { clone, mockDelay } from "@/lib/services/mock/helpers";
import { isMockViewOnly } from "@/lib/services/mock/wallet.service";
import { buildMessageThreadKey } from "@/lib/messages/thread-key";
import { mockIntentRuntime } from "@/lib/services/mock/transaction.service";
import {
  clearIntents,
  enqueueAuto,
  enqueueHung,
  type IntentDraft,
} from "@/lib/services/real-sdk/send-intent";
import { assertCanSpend } from "@/lib/services/view-only";
import { walletCopy } from "@/lib/ui/wallet-copy";

/** Drop clock-expired TTL rows from the in-memory mock list (mirrors real blob prune). */
function dropExpiredMock(): void {
  for (let i = mockMessages.length - 1; i >= 0; i -= 1) {
    if (isTtlExpired(mockMessages[i]?.ttlExpiresAt)) {
      mockMessages.splice(i, 1);
    }
  }
}

type MockMessageKind = "ok" | "decoy" | "hung";

let armedMessage: MockMessageKind | undefined;
let messageParkSeq = 0;

/** Test-only: next sendMessage parks an intent instead of succeeding. */
export function _armMockMessage(kind: MockMessageKind = "ok"): void {
  armedMessage = kind === "ok" ? undefined : kind;
}

/** Test-only disarm (parked rows live on the shared mock runtime store). */
export function _disarmMockMessage(): void {
  armedMessage = undefined;
  clearIntents(mockIntentRuntime);
}

export const mockMessageService: MessageService = {
  async listMessages() {
    await mockDelay();
    dropExpiredMock();
    return clone(mockMessages);
  },
  async sendMessage(input) {
    await mockDelay();
    assertCanSpend(isMockViewOnly(), walletCopy.viewOnlyMessageDisabled);
    const kind = armedMessage ?? "ok";
    armedMessage = undefined;
    const paymentId = input.paymentId?.trim() || undefined;
    if (paymentId) {
      await mockAddrBook.saveOutboundPid(input.recipientAddress, paymentId);
    }
    const ttlUnix = input.ttlUnix && input.ttlUnix > 0 ? input.ttlUnix : undefined;
    if (kind !== "ok") {
      const draft: IntentDraft = {
        kind: "message",
        recipientAddress: input.recipientAddress,
        body: input.body,
        ...(paymentId ? { paymentId } : {}),
        ...(ttlUnix ? { ttlUnixSeconds: ttlUnix } : {}),
      };
      const threadKey = buildMessageThreadKey(input.recipientAddress, paymentId);
      if (kind === "hung") {
        messageParkSeq += 1;
        const hash = `mock-hung-message-${messageParkSeq}`;
        enqueueHung(mockIntentRuntime, draft, hash);
        return {
          id: hash,
          direction: "sent" as const,
          counterpartyName: "New Contact",
          counterpartyAddress: input.recipientAddress,
          body: input.body,
          hasBody: true,
          sentTo: input.recipientAddress,
          paymentIdFrom: null,
          paymentIdTo: paymentId ?? null,
          timestamp: new Date().toISOString(),
          unread: false,
          blockHeight: 0,
          threadKey,
          ...(ttlUnix ? { ttlExpiresAt: ttlUnix } : {}),
          queued: "hung" as const,
        };
      }
      const row = enqueueAuto(mockIntentRuntime, draft, kind);
      return {
        id: row.id,
        direction: "sent" as const,
        counterpartyName: "New Contact",
        counterpartyAddress: input.recipientAddress,
        body: input.body,
        hasBody: true,
        sentTo: input.recipientAddress,
        paymentIdFrom: null,
        paymentIdTo: paymentId ?? null,
        timestamp: new Date().toISOString(),
        unread: false,
        blockHeight: 0,
        threadKey,
        ...(ttlUnix ? { ttlExpiresAt: ttlUnix } : {}),
        queued: "auto" as const,
      };
    }
    const sent = {
      id: `msg-mock-${Date.now()}`,
      direction: "sent" as const,
      counterpartyName: "New Contact",
      counterpartyAddress: input.recipientAddress,
      body: input.body,
      hasBody: true,
      sentTo: input.recipientAddress,
      paymentIdFrom: null,
      paymentIdTo: paymentId ?? null,
      timestamp: new Date().toISOString(),
      unread: false,
      blockHeight: 0,
      threadKey: buildMessageThreadKey(input.recipientAddress, paymentId),
      ...(ttlUnix ? { ttlExpiresAt: ttlUnix } : {}),
    };
    mockMessages.unshift(sent);
    return clone(sent);
  },
  async markRead(id) {
    await mockDelay();
    // Match the real SDK's error contract (real-sdk/message.service.ts) — throw on an
    // unknown id rather than silently returning the wrong message (which would patch the
    // wrong row's read-state in the query cache).
    const message = mockMessages.find((entry) => entry.id === id);
    if (!message) {
      throw new Error("Message not found.");
    }
    return { ...clone(message), unread: false };
  },
};
