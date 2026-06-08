import { normalizePaymentId } from "@/lib/validation/ccx";

/** Thread id for conversations — shared by UI and wallet-core (no wallet-core import). */
export function buildMessageThreadKey(address: string, paymentId?: string): string {
  return `${address.trim()}:${normalizePaymentId(paymentId)}`;
}
