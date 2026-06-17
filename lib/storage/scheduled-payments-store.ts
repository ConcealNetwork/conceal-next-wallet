import { isCadence, type ScheduledPayment } from "@/lib/ui/scheduled-payments";

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
    isCadence(s.cadence)
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

/** Stamp a schedule as paid `at` (ISO), advancing its next-due. */
export function markSchedulePaid(id: string, at: string): ScheduledPayment[] {
  const next = listSchedules().map((s) => (s.id === id ? { ...s, lastPaidAt: at } : s));
  persist(next);
  return next;
}
