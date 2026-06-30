import type { AddressEntry } from "@/lib/types";
import { normalizePaymentId } from "@/lib/validation/ccx";

/**
 * Bilateral messaging relationship — same bar as `isEstablishedConversation()`:
 * address + inbound PID (contact `paymentId`) + outbound PID (`paymentIdTo`).
 *
 * `paymentId` is assigned by this wallet (receiver) so inbound `paymentIdFrom`
 * identifies the contact. `paymentIdTo` is the PID they assigned us (via a third
 * channel), saved after a successful send. Exchange-style contacts omit
 * `paymentId` — deposit PIDs stay on the send form only.
 */
export function computeRelationship(entry: {
  address?: string;
  paymentId?: string;
  paymentIdTo?: string;
}): boolean {
  return !!(entry.address?.trim() && entry.paymentId?.trim() && entry.paymentIdTo?.trim());
}

/** P2P contact row (inbound PID set) — not exchange deposit-only. */
export function isP2PContact(contact: { paymentId?: string }): boolean {
  return !!contact.paymentId?.trim();
}

/** Contacts eligible for status / Safety smart messages. */
export function hasRelationship(entry: AddressEntry): boolean {
  return entry.relationship === true;
}

export function withRelationshipFields<T extends AddressEntry>(entry: T): T {
  return { ...entry, relationship: computeRelationship(entry) };
}

/** After a send: persist the outbound PID on a P2P contact (overwrites `paymentIdTo`). */
export function patchOutboundPid(entry: AddressEntry, pidUsed: string): AddressEntry | null {
  const paymentIdTo = normalizePaymentId(pidUsed);
  if (!paymentIdTo || !isP2PContact(entry)) return null;
  if (entry.address.trim() === "") return null;
  return withRelationshipFields({ ...entry, paymentIdTo });
}

/** Copy thread outbound PID onto the contact only when `paymentIdTo` is still unset. */
export function fillOutboundPid(entry: AddressEntry, pidUsed: string): AddressEntry | null {
  if (entry.paymentIdTo?.trim()) return null;
  return patchOutboundPid(entry, pidUsed);
}

/** Thread → contact sync when the row lacks `paymentIdTo` but the conversation has it. */
export function missThreadPid(
  contact: AddressEntry | undefined,
  convPidTo: string | undefined,
  recvAddress: string,
): { recipientAddress: string; paymentId: string } | null {
  const paymentId = normalizePaymentId(convPidTo ?? undefined);
  if (!paymentId || contact?.paymentIdTo?.trim()) return null;
  const address = recvAddress.trim() || contact?.address.trim() || "";
  if (!address) return null;
  return { recipientAddress: address, paymentId };
}
