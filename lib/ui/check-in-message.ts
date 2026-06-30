import {
  formatStatusPulse,
  isStatusPulse,
  type PulseKind,
  parseStatusPulse,
} from "@/lib/messages/status-pulse";

/** @deprecated Use {@link formatStatusPulse}. */
export function formatCheckIn(status: PulseKind = "alive"): string {
  return formatStatusPulse(status);
}

/** @deprecated Use {@link parseStatusPulse}. */
export function parseCheckIn(body: unknown): { status: PulseKind } | null {
  const pulse = parseStatusPulse(body);
  if (!pulse) return null;
  return { status: pulse.kind };
}

export function isCheckInMessage(body: unknown): boolean {
  return isStatusPulse(body);
}

export { formatStatusPulse, isStatusPulse, parseStatusPulse };
