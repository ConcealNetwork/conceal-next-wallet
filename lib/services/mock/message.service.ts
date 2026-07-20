import { buildMessageThreadKey } from "@/lib/messages/thread-key";
import { isTtlExpired } from "@/lib/messages/ttl";
import { mockMessages } from "@/lib/mock-data/wallet";
import type { MessageService } from "@/lib/services/message.service";
import { mockAddrBook } from "@/lib/services/mock/address-book.service";
import { clone, mockDelay } from "@/lib/services/mock/helpers";
import { isMockViewOnly } from "@/lib/services/mock/wallet.service";
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

export const mockMessageService: MessageService = {
  async listMessages() {
    await mockDelay();
    dropExpiredMock();
    return clone(mockMessages);
  },
  async sendMessage(input) {
    await mockDelay();
    assertCanSpend(isMockViewOnly(), walletCopy.viewOnlyMessageDisabled);
    const paymentId = input.paymentId?.trim() || undefined;
    if (paymentId) {
      await mockAddrBook.saveOutboundPid(input.recipientAddress, paymentId);
    }
    const ttlUnix = input.ttlUnix && input.ttlUnix > 0 ? input.ttlUnix : undefined;
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
