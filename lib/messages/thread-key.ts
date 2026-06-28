import { normalizePaymentId } from "@/lib/validation/ccx";

/** Legacy per-message key (sent/received records). Prefer {@link buildConversationThreadKey} for threads. */
export function buildMessageThreadKey(address: string, paymentId?: string): string {
  return `${address.trim()}:${normalizePaymentId(paymentId)}`;
}

/** Bilateral conversation id — inbound PID + outbound PID (never stored on the contact). */
export function buildConversationThreadKey(paymentIdFrom?: string, paymentIdTo?: string): string {
  return `${normalizePaymentId(paymentIdFrom)}:${normalizePaymentId(paymentIdTo)}`;
}
