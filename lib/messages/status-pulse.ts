import { encodeSmartMessage, parseSmartMessage } from "@/lib/messages/smart-message";

const MODULE = "status";

/** Wire tokens for `{status,<kind>,…}`. */
export type PulseKind = "alive" | "sos" | "sick" | "dnd";

export type PulsePhase = "ok" | "grace" | "overdue";

export interface StatusPulse {
  kind: PulseKind;
  /** Inclusive calendar end date `YYYY-MM-DD` (UTC), when set. */
  until?: string;
  graceDays: number;
}

const KINDS: Record<string, PulseKind> = {
  alive: "alive",
  ok: "alive",
  sos: "sos",
  sick: "sick",
  dnd: "dnd",
};

const DAY_MS = 86_400_000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseKind(raw: string | undefined): PulseKind | null {
  if (!raw || !Object.hasOwn(KINDS, raw)) return null;
  return KINDS[raw];
}

function parseGrace(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** End of the UTC calendar day for `YYYY-MM-DD`. */
export function untilEndMs(until: string): number | null {
  if (!DATE_RE.test(until)) return null;
  const end = Date.parse(`${until}T23:59:59.999Z`);
  return Number.isFinite(end) ? end : null;
}

export function formatStatusPulse(kind: PulseKind, until?: string, graceDays = 0): string {
  if (until && DATE_RE.test(until)) {
    return graceDays > 0
      ? encodeSmartMessage(MODULE, kind, until, String(graceDays))
      : encodeSmartMessage(MODULE, kind, until);
  }
  return encodeSmartMessage(MODULE, kind);
}

/** Parse `{status,alive,2026-07-02,2}` or legacy `{status,alive}`. */
export function parseStatusPulse(body: unknown): StatusPulse | null {
  const parts = parseSmartMessage(body);
  if (!parts || parts[0] !== MODULE) return null;
  const kind = parseKind(parts[1]?.toLowerCase());
  if (!kind) return null;

  let until: string | undefined;
  let graceDays = 0;
  if (parts[2]) {
    if (DATE_RE.test(parts[2])) {
      until = parts[2];
      graceDays = parseGrace(parts[3]);
    }
  }

  return { kind, until, graceDays };
}

export function isStatusPulse(body: unknown): boolean {
  return parseStatusPulse(body) !== null;
}

/**
 * ok — before until end (or no until); grace — until+grace window; overdue — past grace.
 * SOS uses red in ok phase too (caller picks icon).
 */
export function pulsePhase(pulse: StatusPulse, nowMs: number): PulsePhase {
  if (!pulse.until) return "ok";
  const end = untilEndMs(pulse.until);
  if (end === null) return "ok";
  if (nowMs <= end) return "ok";
  const graceEnd = end + pulse.graceDays * DAY_MS;
  if (nowMs <= graceEnd) return "grace";
  return "overdue";
}

/** Default until date for broadcast: today + `days` (UTC calendar). */
export function defaultUntilDate(daysFromNow: number, now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}
