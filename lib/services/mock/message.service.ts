import { mockMessages } from "@/lib/mock-data/wallet"
import { clone, mockDelay } from "@/lib/services/mock/helpers"
import type { MessageService } from "@/lib/services/message.service"

export const mockMessageService: MessageService = {
  async listMessages() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return clone(mockMessages)
  },
  async sendMessage(input) {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return {
      id: "msg-mock-submit",
      direction: "sent",
      counterpartyName: "New Contact",
      counterpartyAddress: input.recipientAddress,
      body: input.body,
      timestamp: "2026-05-22T03:05:00.000Z",
      unread: false,
    }
  },
  async markRead(id) {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return clone(mockMessages.find((message) => message.id === id) ?? mockMessages[0])
  },
}
