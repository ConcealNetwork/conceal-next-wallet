import type { Message } from "@/lib/types";

export type SendMessageInput = {
  recipientAddress: string;
  body: string;
  /** Slider minutes; null or 0 = no TTL (v1 messages.ts UI). */
  ttlMinutes?: number | null;
  /** Unix expiry seconds for tx extra (from slider via messageTtlMinutesToUnix). 0 = none. */
  ttlUnix?: number;
};

export interface MessageService {
  listMessages(): Promise<Message[]>;
  sendMessage(input: SendMessageInput): Promise<Message>;
  markRead(id: string): Promise<Message>;
}
