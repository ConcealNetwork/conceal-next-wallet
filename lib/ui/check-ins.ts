import type { Message } from "@/lib/types";
import { parseCheckIn } from "@/lib/ui/check-in-message";
import { normalizePaymentId } from "@/lib/validation/ccx";

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
  /**
   * Optional shared payment-id. When set, a message must match BOTH this PID and
   * the address to count — an anti-spoof tightening (a third party can pick any
   * PID, but can't also send from the contact's address). Absent → address-only.
   */
  paymentId?: string;
}

const DAY_MS = 86_400_000;

/** Inbound PID of a received message (normalized), or "" when none. */
function inboundPid(message: Message): string {
  return normalizePaymentId(message.paymentIdFrom ?? undefined);
}

/** Does a received message belong to this watcher (address, and PID when set)? */
export function messageMatchesWatcher(message: Message, watcher: WatchedContact): boolean {
  if (message.direction !== "received" || message.counterpartyAddress !== watcher.address) {
    return false;
  }
  const wantPid = normalizePaymentId(watcher.paymentId);
  return wantPid ? inboundPid(message) === wantPid : true;
}

/** Newest received-message timestamp matching the watcher, or null. */
export function lastReceivedForWatcher(
  messages: readonly Message[],
  watcher: WatchedContact,
): string | null {
  let latest: string | null = null;
  for (const m of messages) {
    if (!m.timestamp || !messageMatchesWatcher(m, watcher)) continue;
    if (latest === null || m.timestamp > latest) latest = m.timestamp;
  }
  return latest;
}

/** Newest *structured check-in* timestamp matching the watcher, or null. */
export function lastCheckInForWatcher(
  messages: readonly Message[],
  watcher: WatchedContact,
): string | null {
  let latest: string | null = null;
  for (const m of messages) {
    if (!m.timestamp || !messageMatchesWatcher(m, watcher) || !parseCheckIn(m.body)) continue;
    if (latest === null || m.timestamp > latest) latest = m.timestamp;
  }
  return latest;
}

/** Newest received-message timestamp from `address`, or null if none seen. */
export function lastReceivedFrom(messages: readonly Message[], address: string): string | null {
  let latest: string | null = null;
  for (const m of messages) {
    if (m.direction !== "received" || m.counterpartyAddress !== address || !m.timestamp) continue;
    if (latest === null || m.timestamp > latest) latest = m.timestamp;
  }
  return latest;
}

/**
 * True when the contact has sent an intentional check-in recently (within
 * interval + grace) — drives the "checked in" indicator. Only structured
 * check-in messages count here; ordinary messages keep the freshness clock but
 * don't light the indicator.
 */
export function hasFreshCheckIn(
  watcher: WatchedContact,
  messages: readonly Message[],
  nowISO: string,
): boolean {
  if (isPaused(watcher, nowISO)) return false;
  const lastCheckIn = lastCheckInForWatcher(messages, watcher);
  if (!lastCheckIn) return false;
  const status = checkInStatus(watcher, lastCheckIn, nowISO);
  return status === "ok" || status === "due-soon";
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
    (n, w) =>
      checkInStatus(w, lastReceivedForWatcher(messages, w), nowISO) === "overdue" ? n + 1 : n,
    0,
  );
}

/**
 * Stable keys identifying "this contact, overdue on this last-heard basis".
 * Used by the alert hook to notify at most once per overdue-instance per
 * session: when a fresh message arrives the last-heard advances → a new key is
 * minted → the alert can fire again later. A never-heard ("waiting") contact is
 * not overdue, so it produces no key.
 */
export function overdueInstanceKeys(
  watchers: readonly WatchedContact[],
  messages: readonly Message[],
  nowISO: string,
): string[] {
  const keys: string[] = [];
  for (const w of watchers) {
    const lastHeard = lastReceivedForWatcher(messages, w);
    if (checkInStatus(w, lastHeard, nowISO) === "overdue") {
      keys.push(`${w.id}@${lastHeard ?? "never"}`);
    }
  }
  return keys;
}

/** Whole days between two ISO instants (for "heard 3 days ago"). */
export function daysSince(iso: string, nowISO: string): number {
  return Math.max(0, Math.floor((new Date(nowISO).getTime() - new Date(iso).getTime()) / DAY_MS));
}
