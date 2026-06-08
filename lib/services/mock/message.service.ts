import { mockMessages } from "@/lib/mock-data/wallet";
import { clone, mockDelay } from "@/lib/services/mock/helpers";
import type { MessageService } from "@/lib/services/message.service";
import { buildMessageThreadKey } from "@/lib/messages/thread-key";

export const mockMessageService: MessageService = {
  async listMessages() {
    await mockDelay();
    return clone(mockMessages);
  },
  async sendMessage(input) {
    await mockDelay();
    const paymentId = input.paymentId?.trim() || undefined;
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
    const message = mockMessages.find((entry) => entry.id === id) ?? mockMessages[0];
    return { ...clone(message), unread: false };
  },
};
