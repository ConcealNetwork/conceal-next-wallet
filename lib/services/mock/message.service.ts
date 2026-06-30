import { buildMessageThreadKey } from "@/lib/messages/thread-key";
import { mockMessages } from "@/lib/mock-data/wallet";
import type { MessageService } from "@/lib/services/message.service";
import { mockAddrBook } from "@/lib/services/mock/address-book.service";
import { clone, mockDelay } from "@/lib/services/mock/helpers";
import { isMockViewOnly } from "@/lib/services/mock/wallet.service";
import { assertCanSpend } from "@/lib/services/view-only";
import { walletCopy } from "@/lib/ui/wallet-copy";

export const mockMessageService: MessageService = {
  async listMessages() {
    await mockDelay();
    return clone(mockMessages);
  },
  async sendMessage(input) {
    await mockDelay();
    assertCanSpend(isMockViewOnly(), walletCopy.viewOnlyMessageDisabled);
    const paymentId = input.paymentId?.trim() || undefined;
    if (paymentId) {
      await mockAddrBook.saveOutboundPid(input.recipientAddress, paymentId);
    }
    return {
      id: `msg-mock-${Date.now()}`,
      direction: "sent",
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
    };
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
