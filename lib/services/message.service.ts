import type { Message } from "@/lib/types"

export type SendMessageInput = {
  recipientAddress: string
  body: string
}

export interface MessageService {
  listMessages(): Promise<Message[]>
  sendMessage(input: SendMessageInput): Promise<Message>
  markRead(id: string): Promise<Message>
}
