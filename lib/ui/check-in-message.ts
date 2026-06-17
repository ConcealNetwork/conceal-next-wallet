import { encodeSmartMessage, parseSmartMessage } from "@/lib/messages/smart-message";

/**
 * Proof-of-life check-in encoded as a Conceal *smart message* — a structured
 * `{status,alive}` command (brace-wrapped, comma-separated) that rides the
 * normal encrypted message body (ChaCha12, per the ecosystem convention). Detected by the shared smart-message
 * convention (see lib/messages/smart-message.ts), so it never pollutes regular
 * text messages and stays compatible with the wider ecosystem (conceal-2fa).
 *
 * Honest limit: the payment-id is sender-chosen and the body isn't
 * authenticated, so a check-in is a courtesy "heard from" signal — never
 * cryptographic proof of life.
 */

export type CheckInStatusValue = "alive";

// Smart-message module for proof-of-life pings: {status,alive}. Sits alongside
// the other ecosystem modules (2FA, vault, to-do, medical, trust, contact, agent).
const MODULE = "status";

// Known statuses (v1). `ok` is accepted as an alias on parse. Object.hasOwn-gated
// so prototype members can't masquerade as a status.
const KNOWN_STATUS: Record<string, CheckInStatusValue> = { alive: "alive", ok: "alive" };

export interface CheckIn {
  status: CheckInStatusValue;
}

export function formatCheckIn(status: CheckInStatusValue = "alive"): string {
  return encodeSmartMessage(MODULE, status);
}

/** Parse a message body as a check-in smart message, or null. Never throws. */
export function parseCheckIn(body: unknown): CheckIn | null {
  const parts = parseSmartMessage(body);
  if (!parts || parts[0] !== MODULE) return null;
  const raw = parts[1];
  if (!raw || !Object.hasOwn(KNOWN_STATUS, raw)) return null;
  return { status: KNOWN_STATUS[raw] };
}

export function isCheckInMessage(body: unknown): boolean {
  return parseCheckIn(body) !== null;
}
