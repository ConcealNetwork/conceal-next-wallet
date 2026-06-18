import { beforeEach, describe, expect, it } from "vitest";
import {
  listSchedules,
  markSchedulePaid,
  removeSchedule,
  saveSchedule,
  snoozeSchedule,
} from "@/lib/storage/scheduled-payments-store";
import {
  addCadence,
  computeNextDue,
  countDue,
  dueInstanceKey,
  dueInstanceKeys,
  isCadence,
  isDue,
  isSnoozed,
  type ScheduledPayment,
} from "@/lib/ui/scheduled-payments";

function schedule(over: Partial<ScheduledPayment> = {}): ScheduledPayment {
  return {
    id: "s1",
    label: "Rent",
    address: "ccx7abc",
    amount: "100",
    cadence: "monthly",
    anchorDate: "2026-01-15T00:00:00.000Z",
    ...over,
  };
}

describe("addCadence", () => {
  it("advances by the cadence immutably", () => {
    const d = new Date("2026-01-15T00:00:00.000Z");
    expect(addCadence(d, "weekly").toISOString()).toBe("2026-01-22T00:00:00.000Z");
    expect(addCadence(d, "monthly").toISOString()).toBe("2026-02-15T00:00:00.000Z");
    expect(addCadence(d, "quarterly").toISOString()).toBe("2026-04-15T00:00:00.000Z");
    expect(addCadence(d, "yearly").toISOString()).toBe("2027-01-15T00:00:00.000Z");
    expect(d.toISOString()).toBe("2026-01-15T00:00:00.000Z"); // unchanged
  });
});

describe("computeNextDue / isDue", () => {
  it("uses the anchor when never paid", () => {
    expect(computeNextDue(schedule())).toBe("2026-01-15T00:00:00.000Z");
  });

  it("advances to the first occurrence after the last payment", () => {
    const s = schedule({ lastPaidAt: "2026-01-16T00:00:00.000Z" });
    expect(computeNextDue(s)).toBe("2026-02-15T00:00:00.000Z");
  });

  it("skips multiple missed cadences after a stale last payment", () => {
    const s = schedule({ lastPaidAt: "2026-04-20T00:00:00.000Z" });
    expect(computeNextDue(s)).toBe("2026-05-15T00:00:00.000Z");
  });

  it("is due when the next occurrence is on/before now", () => {
    expect(isDue(schedule(), "2026-02-01T00:00:00.000Z")).toBe(true); // anchor passed
    expect(isDue(schedule(), "2026-01-01T00:00:00.000Z")).toBe(false); // anchor in future
  });

  it("counts due schedules", () => {
    const now = "2026-03-01T00:00:00.000Z";
    const due = schedule({ id: "due" });
    const future = schedule({ id: "future", anchorDate: "2026-12-01T00:00:00.000Z" });
    expect(countDue([due, future], now)).toBe(1);
  });
});

describe("isCadence", () => {
  it("guards the cadence union", () => {
    expect(isCadence("monthly")).toBe(true);
    expect(isCadence("daily")).toBe(false);
    expect(isCadence(null)).toBe(false);
  });
});

describe("scheduled-payments store", () => {
  beforeEach(() => localStorage.clear());

  it("saves, lists, marks paid, and removes", () => {
    saveSchedule(schedule());
    expect(listSchedules()).toHaveLength(1);

    saveSchedule(schedule({ label: "Rent (updated)" })); // same id → update
    const list = listSchedules();
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe("Rent (updated)");

    markSchedulePaid("s1", "2026-02-01T00:00:00.000Z");
    expect(listSchedules()[0].lastPaidAt).toBe("2026-02-01T00:00:00.000Z");

    removeSchedule("s1");
    expect(listSchedules()).toHaveLength(0);
  });

  it("ignores corrupt / malformed stored entries", () => {
    localStorage.setItem("ccx-scheduled-payments", JSON.stringify([{ id: "x" }, "junk"]));
    expect(listSchedules()).toEqual([]);
  });

  it("snoozes and resumes a schedule, clearing snooze on mark-paid", () => {
    saveSchedule(schedule());
    snoozeSchedule("s1", "2026-02-01T00:00:00.000Z");
    expect(listSchedules()[0].snoozedUntil).toBe("2026-02-01T00:00:00.000Z");

    // Marking paid clears the snooze and advances the schedule.
    markSchedulePaid("s1", "2026-01-16T00:00:00.000Z");
    expect(listSchedules()[0].snoozedUntil).toBeUndefined();

    // Clear snooze explicitly.
    snoozeSchedule("s1", "2026-03-01T00:00:00.000Z");
    snoozeSchedule("s1", undefined);
    expect(listSchedules()[0].snoozedUntil).toBeUndefined();
  });

  it("accepts a valid stored snoozedUntil and rejects a non-string one", () => {
    localStorage.setItem(
      "ccx-scheduled-payments",
      JSON.stringify([
        { ...schedule(), snoozedUntil: "2026-02-01T00:00:00.000Z" },
        { ...schedule({ id: "bad" }), snoozedUntil: 123 },
      ]),
    );
    const list = listSchedules();
    expect(list).toHaveLength(1);
    expect(list[0].snoozedUntil).toBe("2026-02-01T00:00:00.000Z");
  });
});

describe("addCadence month-end clamp (bug fix)", () => {
  it("clamps a Jan-31 monthly anchor to Feb 28 (non-leap), not Mar 3", () => {
    const jan31 = new Date("2026-01-31T00:00:00.000Z"); // 2026 is not a leap year
    expect(addCadence(jan31, "monthly").toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("clamps a Jan-31 monthly anchor to Feb 29 in a leap year", () => {
    const jan31 = new Date("2024-01-31T00:00:00.000Z"); // 2024 is a leap year
    expect(addCadence(jan31, "monthly").toISOString()).toBe("2024-02-29T00:00:00.000Z");
  });

  it("clamps a Jan-31 quarterly anchor to Apr 30 (Apr has 30 days)", () => {
    const jan31 = new Date("2026-01-31T00:00:00.000Z");
    expect(addCadence(jan31, "quarterly").toISOString()).toBe("2026-04-30T00:00:00.000Z");
  });

  it("preserves the day when the target month has it (Mar 31 monthly → Apr 30)", () => {
    const mar31 = new Date("2026-03-31T00:00:00.000Z");
    expect(addCadence(mar31, "monthly").toISOString()).toBe("2026-04-30T00:00:00.000Z");
  });

  it("Feb-29 yearly clamps to Feb 28 in the following (non-leap) year", () => {
    const feb29 = new Date("2024-02-29T00:00:00.000Z");
    expect(addCadence(feb29, "yearly").toISOString()).toBe("2025-02-28T00:00:00.000Z");
  });

  it("preserves the time-of-day component across a clamped step", () => {
    const jan31 = new Date("2026-01-31T09:30:15.250Z");
    expect(addCadence(jan31, "monthly").toISOString()).toBe("2026-02-28T09:30:15.250Z");
  });
});

describe("computeNextDue month-end recurrence (no drift)", () => {
  function monthly(anchorDate: string, lastPaidAt?: string): ScheduledPayment {
    return schedule({ anchorDate, cadence: "monthly", lastPaidAt });
  }

  it("Jan-31 anchor walks 31 → Feb 28 → Mar 31 (anchor day preserved, no stick)", () => {
    // Paid just after Jan 31 → next is Feb 28.
    expect(computeNextDue(monthly("2026-01-31T00:00:00.000Z", "2026-02-01T00:00:00.000Z"))).toBe(
      "2026-02-28T00:00:00.000Z",
    );
    // Paid just after Feb 28 → next is Mar 31 (NOT Mar 28 — the anchor day, 31,
    // is preserved rather than the clamped Feb day).
    expect(computeNextDue(monthly("2026-01-31T00:00:00.000Z", "2026-03-01T00:00:00.000Z"))).toBe(
      "2026-03-31T00:00:00.000Z",
    );
  });

  it("Feb-29 yearly anchor returns Feb 28 in a non-leap year, then Feb 29 again in a leap year", () => {
    const anchor = "2024-02-29T00:00:00.000Z";
    // After 2024 → 2025 (non-leap) clamps to Feb 28.
    expect(
      computeNextDue(
        schedule({ anchorDate: anchor, cadence: "yearly", lastPaidAt: "2024-03-01T00:00:00.000Z" }),
      ),
    ).toBe("2025-02-28T00:00:00.000Z");
    // After 2027 → 2028 (leap) restores Feb 29 (computed from the anchor, not the clamp).
    expect(
      computeNextDue(
        schedule({ anchorDate: anchor, cadence: "yearly", lastPaidAt: "2028-01-01T00:00:00.000Z" }),
      ),
    ).toBe("2028-02-29T00:00:00.000Z");
  });
});

describe("snooze suppresses due-ness", () => {
  it("isSnoozed reflects the snooze window", () => {
    const s = schedule({ snoozedUntil: "2026-02-01T00:00:00.000Z" });
    expect(isSnoozed(s, "2026-01-20T00:00:00.000Z")).toBe(true);
    expect(isSnoozed(s, "2026-02-02T00:00:00.000Z")).toBe(false);
    expect(isSnoozed(schedule(), "2026-02-02T00:00:00.000Z")).toBe(false); // no snooze set
  });

  it("a snoozed-but-due schedule is not due until the snooze elapses", () => {
    const now = "2026-02-01T00:00:00.000Z"; // anchor (Jan 15) has passed → due
    expect(isDue(schedule(), now)).toBe(true);
    const snoozed = schedule({ snoozedUntil: "2026-02-15T00:00:00.000Z" });
    expect(isDue(snoozed, now)).toBe(false); // suppressed
    expect(isDue(snoozed, "2026-02-20T00:00:00.000Z")).toBe(true); // snooze elapsed
    expect(countDue([schedule(), snoozed], now)).toBe(1); // only the un-snoozed one
  });
});

describe("dueInstanceKey / dueInstanceKeys (per-instance de-dupe)", () => {
  it("keys a schedule by id + its next-due, changing when it advances", () => {
    const s = schedule();
    const before = dueInstanceKey(s);
    const after = dueInstanceKey({ ...s, lastPaidAt: "2026-01-16T00:00:00.000Z" });
    expect(before).toContain("s1@");
    expect(after).not.toBe(before); // advancing the schedule mints a new key
  });

  it("returns keys only for currently-due, non-snoozed schedules", () => {
    const now = "2026-03-01T00:00:00.000Z";
    const due = schedule({ id: "due" });
    const future = schedule({ id: "future", anchorDate: "2026-12-01T00:00:00.000Z" });
    const snoozed = schedule({ id: "snz", snoozedUntil: "2026-04-01T00:00:00.000Z" });
    const keys = dueInstanceKeys([due, future, snoozed], now);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toContain("due@");
  });
});
