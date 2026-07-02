import { smartPulse } from "conceal-wallet-sdk";

const { parseStatusPulse, pulsePhase, isStatusPulse } = smartPulse;
type PulsePhase = smartPulse.PulsePhase;
type StatusPulse = smartPulse.StatusPulse;

import { findContactForMessages } from "@/lib/messages/conversations";
import type { AddressEntry, Message } from "@/lib/types";

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
  return findContactForMessages([...contacts], [message]);
}

/**
 * Latest status pulse per sender from inbound messages (newest wins).
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

    const row: PulseRow = {
      messageId: message.id,
      contactId: contact?.id ?? message.id,
      label: contact?.label ?? message.counterpartyName,
      avatar: contact?.avatar,
      pulse,
      phase: pulsePhase(pulse, nowMs),
      receivedAt: message.timestamp,
    };

    const prev = byContact.get(row.contactId);
    if (!prev || message.timestamp > prev.receivedAt) {
      byContact.set(row.contactId, row);
    }
  }

  return [...byContact.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Inbound `{status,…}` messages — nav badge baseline/delta (all rows, not latest-per-contact). */
export function countReceivedPulses(messages: readonly Message[]): number {
  return messages.filter(
    (message) => message.direction === "received" && isStatusPulse(message.body),
  ).length;
}

export function countRedPulses(rows: readonly PulseRow[]): number {
  return rows.reduce((n, row) => (row.phase === "overdue" ? n + 1 : n), 0);
}
