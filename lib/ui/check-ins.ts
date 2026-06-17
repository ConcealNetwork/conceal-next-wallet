import type { Message } from "@/lib/types";

/**
 * "Check-ins" — a proof-of-life *watcher*. You mark a contact as one you expect
 * to hear from on a cadence; if no message arrives within interval + grace, the
 * wallet flags them so you remember to reach out.
 *
 * Honest framing: this is a *worry/nudge* trigger, never proof of anything — a
 * missed check-in usually has an ordinary cause (lost wallet, no fee funds,
 * travel). Evaluation is purely local: it reads the messages the wallet has
 * already synced; "overdue" means "no received message seen", not "message
 * expired" (on-chain messages are permanent). Callers must only evaluate once
 * the wallet is synced, or an in-progress sync will cry wolf.
 */

export type CheckInStatus = "ok" | "due-soon" | "overdue" | "waiting" | "paused";

export interface WatchedContact {
  id: string;
  address: string;
  label: string;
  /** Expected days between check-ins. */
  intervalDays: number;
  /** Extra days before "overdue" trips, to absorb ordinary delays. */
  graceDays: number;
  paused?: boolean;
  /** ISO; while now < snoozedUntil the contact is treated as paused. */
  snoozedUntil?: string;
}

const DAY_MS = 86_400_000;

/** Newest received-message timestamp from `address`, or null if none seen. */
export function lastReceivedFrom(messages: readonly Message[], address: string): string | null {
  let latest: string | null = null;
  for (const m of messages) {
    if (m.direction !== "received" || m.counterpartyAddress !== address || !m.timestamp) continue;
    if (latest === null || m.timestamp > latest) latest = m.timestamp;
  }
  return latest;
}

export function isPaused(watcher: WatchedContact, nowISO: string): boolean {
  if (watcher.paused) return true;
  return (
    watcher.snoozedUntil !== undefined &&
    new Date(nowISO).getTime() < new Date(watcher.snoozedUntil).getTime()
  );
}

export function checkInStatus(
  watcher: WatchedContact,
  lastHeardISO: string | null,
  nowISO: string,
): CheckInStatus {
  if (isPaused(watcher, nowISO)) return "paused";
  if (!lastHeardISO) return "waiting";
  const last = new Date(lastHeardISO).getTime();
  const now = new Date(nowISO).getTime();
  const dueAt = last + watcher.intervalDays * DAY_MS;
  const overdueAt = dueAt + watcher.graceDays * DAY_MS;
  if (now >= overdueAt) return "overdue";
  if (now >= dueAt) return "due-soon";
  return "ok";
}

/** How many watched contacts are overdue right now (drives the nav badge). */
export function countOverdue(
  watchers: readonly WatchedContact[],
  messages: readonly Message[],
  nowISO: string,
): number {
  return watchers.reduce(
    (n, w) => (checkInStatus(w, lastReceivedFrom(messages, w.address), nowISO) === "overdue" ? n + 1 : n),
    0,
  );
}

/** Whole days between two ISO instants (for "heard 3 days ago"). */
export function daysSince(iso: string, nowISO: string): number {
  return Math.max(0, Math.floor((new Date(nowISO).getTime() - new Date(iso).getTime()) / DAY_MS));
}
