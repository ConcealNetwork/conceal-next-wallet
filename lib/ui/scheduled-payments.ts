/**
 * Recurring payment scheduling — pure logic. By default a schedule is a *reminder*
 * (it never moves funds; "Send now" pre-fills the send form). A schedule the user
 * explicitly ARMS (`autoSend`, #92 phase 2) additionally auto-sends when due — but
 * only while the wallet is open + unlocked (keys are never persisted), with a
 * one-time consent at arming and no per-fire prompt.
 */

export type Cadence = "weekly" | "monthly" | "quarterly" | "yearly";

export const CADENCES: readonly Cadence[] = ["weekly", "monthly", "quarterly", "yearly"];

export interface ScheduledPayment {
  id: string;
  /** Friendly name, e.g. "Rent". */
  label: string;
  address: string;
  /** Amount in CCX, kept as the user typed it (the send form re-validates). */
  amount: string;
  cadence: Cadence;
  /** First due date, ISO (date or datetime). */
  anchorDate: string;
  paymentId?: string;
  /** ISO timestamp of the last time the user marked this paid (advances the schedule). */
  lastPaidAt?: string;
  /**
   * ISO; while now < snoozedUntil the reminder is suppressed (parity with
   * check-in watchers). Optional and additive — absent means "not snoozed".
   */
  snoozedUntil?: string;
  /**
   * When true (#92 phase 2), this schedule AUTO-SENDS its payment when due — set
   * only after an explicit one-time consent. Absent/false = reminder-only. Auto-send
   * fires only while the wallet is open + unlocked.
   */
  autoSend?: boolean;
  /**
   * The wallet id this schedule was armed on (stamped at consent). The engine only
   * auto-sends it from THIS wallet, so a different active wallet never pays it by mistake.
   * Absent = legacy/any (pre-stamp); the engine then uses the active wallet.
   */
  autoSendWalletId?: string;
}

const CADENCE_LABELS: Record<Cadence, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

export function formatCadence(cadence: Cadence): string {
  return CADENCE_LABELS[cadence];
}

export function isCadence(value: unknown): value is Cadence {
  return typeof value === "string" && (CADENCES as readonly string[]).includes(value);
}

/** Days in the given UTC year/month (month is 0-based). */
function daysInUTCMonth(year: number, month: number): number {
  // Day 0 of the *next* month is the last day of `month`.
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Step `date` forward by `months` calendar months (UTC), clamping the day to
 * the target month's length. This avoids JS's `setUTCMonth` overflow — e.g. a
 * Jan-31 anchor + 1 month would otherwise roll to Mar 3 (Feb has no 31st) and
 * keep drifting. Clamping pins it to Feb 28/29 while preserving the anchor day
 * for months that have it (Feb → Mar still lands on the 31st).
 */
function addUTCMonthsClamped(date: Date, months: number): Date {
  const anchorDay = date.getUTCDate();
  const targetMonthIndex = date.getUTCMonth() + months;
  // Normalize the (year, month) without letting the day overflow: build from
  // day 1, then set the clamped day explicitly.
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const clampedDay = Math.min(anchorDay, daysInUTCMonth(targetYear, targetMonth));
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      clampedDay,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/** Months advanced per cadence step (weekly handled separately). */
const CADENCE_MONTHS: Record<Exclude<Cadence, "weekly">, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

/** One cadence step after `date` (immutably). Uses UTC so it's DST-immune. */
export function addCadence(date: Date, cadence: Cadence): Date {
  if (cadence === "weekly") {
    const next = new Date(date.getTime());
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }
  return addUTCMonthsClamped(date, CADENCE_MONTHS[cadence]);
}

/**
 * The `n`-th occurrence after the anchor (n=0 → the anchor itself). For
 * month-based cadences this is computed from the anchor in a single clamped
 * step rather than by iterating, so a Jan-31 anchor yields Feb 28/29, then
 * **Mar 31** again (the original anchor day is preserved, not the clamped one).
 */
function nthOccurrence(anchor: Date, cadence: Cadence, n: number): Date {
  if (cadence === "weekly") {
    const next = new Date(anchor.getTime());
    next.setUTCDate(next.getUTCDate() + 7 * n);
    return next;
  }
  return addUTCMonthsClamped(anchor, CADENCE_MONTHS[cadence] * n);
}

/**
 * The next due date: the anchor if never paid, otherwise the first occurrence
 * strictly after `lastPaidAt`. Returns an ISO string.
 */
export function computeNextDue(
  schedule: Pick<ScheduledPayment, "anchorDate" | "cadence" | "lastPaidAt">,
): string {
  const anchor = new Date(schedule.anchorDate);
  if (Number.isNaN(anchor.getTime())) return schedule.anchorDate;
  let occurrence = anchor;
  if (schedule.lastPaidAt) {
    const paid = new Date(schedule.lastPaidAt);
    // Advance to the first occurrence strictly after the last payment. Each
    // occurrence is computed from the anchor (not the previous, possibly-clamped
    // step) so month-end anchors don't drift. Bounded guard: each step is
    // >= 7 days, so this terminates quickly.
    for (let n = 1; n <= 10_000 && occurrence.getTime() <= paid.getTime(); n += 1) {
      occurrence = nthOccurrence(anchor, schedule.cadence, n);
    }
  }
  return occurrence.toISOString();
}

/** True while `now` is before the schedule's snooze expiry (suppresses due-ness). */
export function isSnoozed(
  schedule: Pick<ScheduledPayment, "snoozedUntil">,
  nowISO: string,
): boolean {
  return (
    schedule.snoozedUntil !== undefined &&
    new Date(nowISO).getTime() < new Date(schedule.snoozedUntil).getTime()
  );
}

/**
 * True when the next due date is on or before `nowISO` and the reminder isn't
 * snoozed. Snooze is additive: a schedule with no `snoozedUntil` behaves exactly
 * as before.
 */
export function isDue(
  schedule: Pick<ScheduledPayment, "anchorDate" | "cadence" | "lastPaidAt" | "snoozedUntil">,
  nowISO: string,
): boolean {
  if (isSnoozed(schedule, nowISO)) return false;
  return new Date(computeNextDue(schedule)).getTime() <= new Date(nowISO).getTime();
}

/** How many schedules are currently due (snoozed ones excluded). */
export function countDue(schedules: readonly ScheduledPayment[], nowISO: string): number {
  return schedules.reduce((n, s) => (isDue(s, nowISO) ? n + 1 : n), 0);
}

/**
 * A stable key identifying "this schedule, due on this occurrence". Used by the
 * reminder hook to notify at most once per due-instance per session: when the
 * schedule advances (marked paid) the next-due changes, so a fresh key is
 * minted and the reminder can fire again.
 */
export function dueInstanceKey(
  schedule: Pick<ScheduledPayment, "id" | "anchorDate" | "cadence" | "lastPaidAt">,
): string {
  return `${schedule.id}@${computeNextDue(schedule)}`;
}

/** The set of due-instance keys for the schedules that are currently due. */
export function dueInstanceKeys(schedules: readonly ScheduledPayment[], nowISO: string): string[] {
  return schedules.filter((s) => isDue(s, nowISO)).map((s) => dueInstanceKey(s));
}

/**
 * Schedules that should AUTO-SEND right now (#92 phase 2): armed (`autoSend`) AND due (which
 * already excludes snoozed) AND belonging to the ACTIVE wallet — a schedule stamped for a
 * different wallet never fires from the wrong one (an unstamped/legacy schedule matches the
 * active wallet). The engine advances each (marks paid) BEFORE sending, so a re-tick or
 * reload can't re-fire the same instance. Pure — no funds move here.
 */
export function schedulesToAutoSend(
  schedules: readonly ScheduledPayment[],
  nowISO: string,
  activeWalletId?: string,
): ScheduledPayment[] {
  return schedules.filter(
    (s) =>
      s.autoSend === true &&
      isDue(s, nowISO) &&
      (s.autoSendWalletId === undefined || s.autoSendWalletId === activeWalletId),
  );
}
