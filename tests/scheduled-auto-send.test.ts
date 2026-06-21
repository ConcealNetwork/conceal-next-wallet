import { beforeEach, describe, expect, it } from "vitest";
import {
  listSchedules,
  saveSchedule,
  setScheduleAutoSend,
} from "@/lib/storage/scheduled-payments-store";
import { type ScheduledPayment, schedulesToAutoSend } from "@/lib/ui/scheduled-payments";

/** Pure-selector + store coverage for scheduled auto-send (#92 phase 2). */

const NOW = "2026-06-22T00:00:00.000Z";
const PAST = "2020-01-01T00:00:00.000Z";
const FUTURE = "2999-01-01T00:00:00.000Z";

function sched(over: Partial<ScheduledPayment> = {}): ScheduledPayment {
  return {
    id: "s1",
    label: "Rent",
    address: "ccx7test",
    amount: "10",
    cadence: "monthly",
    anchorDate: PAST,
    ...over,
  };
}

describe("schedulesToAutoSend", () => {
  it("selects only armed AND due schedules", () => {
    const list = [
      sched({ id: "armed-due", autoSend: true }),
      sched({ id: "armed-future", autoSend: true, anchorDate: FUTURE }),
      sched({ id: "armed-snoozed", autoSend: true, snoozedUntil: FUTURE }),
      sched({ id: "unarmed-due", autoSend: false }),
      sched({ id: "default-due" }), // autoSend undefined
    ];
    expect(schedulesToAutoSend(list, NOW).map((s) => s.id)).toEqual(["armed-due"]);
  });
});

describe("setScheduleAutoSend store", () => {
  beforeEach(() => localStorage.clear());

  it("arms and disarms a saved schedule", () => {
    saveSchedule(sched({ id: "x" }));
    expect(listSchedules()[0].autoSend).toBeUndefined();
    setScheduleAutoSend("x", true);
    expect(listSchedules()[0].autoSend).toBe(true);
    setScheduleAutoSend("x", false);
    expect(listSchedules()[0].autoSend).toBe(false);
  });

  it("round-trips autoSend through the persistence guard", () => {
    saveSchedule(sched({ id: "y", autoSend: true }));
    // Re-read from storage (the guard must accept the boolean field).
    expect(listSchedules().find((s) => s.id === "y")?.autoSend).toBe(true);
  });
});
