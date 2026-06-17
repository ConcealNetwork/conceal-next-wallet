import { beforeEach, describe, expect, it } from "vitest";
import {
  listSchedules,
  markSchedulePaid,
  removeSchedule,
  saveSchedule,
} from "@/lib/storage/scheduled-payments-store";
import {
  addCadence,
  computeNextDue,
  countDue,
  isCadence,
  isDue,
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
});
