import { smartPulse } from "conceal-wallet-sdk";

const { parseStatusPulse, pulsePhase } = smartPulse;
type PulsePhase = smartPulse.PulsePhase;
type StatusPulse = smartPulse.StatusPulse;

import type { AddressEntry, Message } from "@/lib/types";
import { normalizePaymentId, paymentIdsMatch } from "@/lib/validation/ccx";

export type PulseRow = {
  messageId: string;
  contactId: string;
  label: string;
  avatar?: string;
  pulse: StatusPulse;
  phase: PulsePhase;
  receivedAt: string;
};

function matchContact(
  message: Message,
  contacts: readonly AddressEntry[],
): AddressEntry | undefined {
  const pid = normalizePaymentId(message.paymentIdFrom ?? undefined);
  if (!pid) return undefined;
  return contacts.find((c) => c.paymentId && paymentIdsMatch(c.paymentId, pid));
}

/**
 * Latest status pulse per known contact from inbound messages (newest wins).
 * Skips `dismissed` message ids.
 */
export function buildPulseRows(
  messages: readonly Message[],
  contacts: readonly AddressEntry[],
  dismissed: ReadonlySet<string>,
  nowMs: number,
): PulseRow[] {
  const byContact = new Map<string, PulseRow>();

  for (const message of messages) {
    if (message.direction !== "received" || dismissed.has(message.id)) continue;
    const pulse = parseStatusPulse(message.body);
    if (!pulse) continue;
    const contact = matchContact(message, contacts);
    if (!contact) continue;

    const row: PulseRow = {
      messageId: message.id,
      contactId: contact.id,
      label: contact.label,
      avatar: contact.avatar,
      pulse,
      phase: pulsePhase(pulse, nowMs),
      receivedAt: message.timestamp,
    };

    const prev = byContact.get(contact.id);
    if (!prev || message.timestamp > prev.receivedAt) {
      byContact.set(contact.id, row);
    }
  }

  return [...byContact.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function countRedPulses(rows: readonly PulseRow[]): number {
  return rows.reduce((n, row) => (row.phase === "overdue" ? n + 1 : n), 0);
}
