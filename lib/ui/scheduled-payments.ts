/**
 * Recurring payment *reminders* — pure scheduling logic. This is a reminder
 * system only: it never moves funds. "Send now" pre-fills the send form, where
 * the user unlocks and confirms as usual. Keys are never persisted, so there is
 * deliberately no autopay.
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

/** One cadence step after `date` (immutably). Uses UTC so it's DST-immune. */
export function addCadence(date: Date, cadence: Cadence): Date {
  const next = new Date(date.getTime());
  switch (cadence) {
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "monthly":
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case "quarterly":
      next.setUTCMonth(next.getUTCMonth() + 3);
      break;
    case "yearly":
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      break;
  }
  return next;
}

/**
 * The next due date: the anchor if never paid, otherwise the first occurrence
 * strictly after `lastPaidAt`. Returns an ISO string.
 */
export function computeNextDue(
  schedule: Pick<ScheduledPayment, "anchorDate" | "cadence" | "lastPaidAt">,
): string {
  let occurrence = new Date(schedule.anchorDate);
  if (Number.isNaN(occurrence.getTime())) return schedule.anchorDate;
  if (schedule.lastPaidAt) {
    const paid = new Date(schedule.lastPaidAt);
    // Advance to the first occurrence strictly after the last payment.
    // Bounded guard: each step is >= 7 days, so this terminates quickly.
    for (let i = 0; i < 10_000 && occurrence.getTime() <= paid.getTime(); i += 1) {
      occurrence = addCadence(occurrence, schedule.cadence);
    }
  }
  return occurrence.toISOString();
}

/** True when the next due date is on or before `nowISO`. */
export function isDue(
  schedule: Pick<ScheduledPayment, "anchorDate" | "cadence" | "lastPaidAt">,
  nowISO: string,
): boolean {
  return new Date(computeNextDue(schedule)).getTime() <= new Date(nowISO).getTime();
}

/** How many schedules are currently due. */
export function countDue(schedules: readonly ScheduledPayment[], nowISO: string): number {
  return schedules.reduce((n, s) => (isDue(s, nowISO) ? n + 1 : n), 0);
}
