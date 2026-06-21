import { isCadence, isDue, type ScheduledPayment } from "@/lib/ui/scheduled-payments";

/**
 * Device-local persistence for recurring payment reminders. Pure UI metadata —
 * no `wallet-core` import, no service-spine involvement; guards `localStorage`
 * for SSR / static-export safety.
 */

const STORAGE_KEY = "ccx-scheduled-payments";

function isScheduledPayment(value: unknown): value is ScheduledPayment {
  const s = value as Partial<ScheduledPayment>;
  return (
    typeof s === "object" &&
    s !== null &&
    typeof s.id === "string" &&
    typeof s.label === "string" &&
    typeof s.address === "string" &&
    typeof s.amount === "string" &&
    typeof s.anchorDate === "string" &&
    isCadence(s.cadence) &&
    (s.snoozedUntil === undefined || typeof s.snoozedUntil === "string") &&
    (s.autoSend === undefined || typeof s.autoSend === "boolean") &&
    (s.autoSendWalletId === undefined || typeof s.autoSendWalletId === "string")
  );
}

export function listSchedules(): ScheduledPayment[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isScheduledPayment) : [];
  } catch {
    return [];
  }
}

function persist(schedules: ScheduledPayment[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules));
}

/** Insert or update by id; returns the new list. */
export function saveSchedule(schedule: ScheduledPayment): ScheduledPayment[] {
  const next = listSchedules().filter((s) => s.id !== schedule.id);
  next.push(schedule);
  persist(next);
  return next;
}

export function removeSchedule(id: string): ScheduledPayment[] {
  const next = listSchedules().filter((s) => s.id !== id);
  persist(next);
  return next;
}

/** Stamp a schedule as paid `at` (ISO), advancing its next-due (and clearing any snooze). */
export function markSchedulePaid(id: string, at: string): ScheduledPayment[] {
  const next = listSchedules().map((s) =>
    s.id === id ? { ...s, lastPaidAt: at, snoozedUntil: undefined } : s,
  );
  persist(next);
  return next;
}

/**
 * Set (or clear, when `until` is undefined) a reminder's snooze. While snoozed,
 * the schedule is excluded from `isDue`/`countDue`. Returns the new list.
 */
export function snoozeSchedule(id: string, until: string | undefined): ScheduledPayment[] {
  const next = listSchedules().map((s) => (s.id === id ? { ...s, snoozedUntil: until } : s));
  persist(next);
  return next;
}

/**
 * Arm/disarm a schedule's auto-send (#92 phase 2). When arming, stamp the wallet id the
 * schedule belongs to so the engine only auto-sends it from THAT wallet (never the wrong
 * active wallet). Disarming clears the stamp. Returns the new list.
 */
export function setScheduleAutoSend(
  id: string,
  autoSend: boolean,
  walletId?: string,
): ScheduledPayment[] {
  const next = listSchedules().map((s) =>
    s.id === id ? { ...s, autoSend, autoSendWalletId: autoSend ? walletId : undefined } : s,
  );
  persist(next);
  return next;
}

/**
 * Atomically advance a schedule IF it's still due right now (compare-and-swap against the
 * freshest localStorage), returning whether it fired. The auto-send engine calls this
 * IMMEDIATELY before sending: re-reading + re-checking here (rather than trusting the array
 * it iterated) closes the stale-iteration window, and combined with the engine's cross-tab
 * Web Lock makes a given due instance fire at most once (#92 phase-2 review).
 */
export function markSchedulePaidIfDue(id: string, at: string): boolean {
  const list = listSchedules();
  const schedule = list.find((s) => s.id === id);
  if (!schedule || !isDue(schedule, at)) return false;
  persist(list.map((s) => (s.id === id ? { ...s, lastPaidAt: at, snoozedUntil: undefined } : s)));
  return true;
}
