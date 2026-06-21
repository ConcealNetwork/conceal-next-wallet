import { beforeEach, describe, expect, it } from "vitest";
import {
  listSchedules,
  markSchedulePaidIfDue,
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

  it("only fires a schedule for the wallet it was armed on (never the wrong active wallet)", () => {
    const list = [
      sched({ id: "for-A", autoSend: true, autoSendWalletId: "A" }),
      sched({ id: "for-B", autoSend: true, autoSendWalletId: "B" }),
      sched({ id: "legacy", autoSend: true }), // unstamped → matches the active wallet
    ];
    expect(schedulesToAutoSend(list, NOW, "A").map((s) => s.id)).toEqual(["for-A", "legacy"]);
    expect(schedulesToAutoSend(list, NOW, "B").map((s) => s.id)).toEqual(["for-B", "legacy"]);
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

  it("round-trips autoSend + walletId through the persistence guard", () => {
    saveSchedule(sched({ id: "y", autoSend: true, autoSendWalletId: "wallet-2" }));
    const read = listSchedules().find((s) => s.id === "y");
    expect(read?.autoSend).toBe(true);
    expect(read?.autoSendWalletId).toBe("wallet-2");
  });

  it("stamps + clears the wallet id when arming / disarming", () => {
    saveSchedule(sched({ id: "z" }));
    setScheduleAutoSend("z", true, "wallet-9");
    expect(listSchedules()[0].autoSendWalletId).toBe("wallet-9");
    setScheduleAutoSend("z", false);
    expect(listSchedules()[0].autoSendWalletId).toBeUndefined();
  });
});

describe("markSchedulePaidIfDue (compare-and-swap)", () => {
  beforeEach(() => localStorage.clear());

  it("advances a due schedule once, then refuses (no double-fire)", () => {
    saveSchedule(sched({ id: "cas", autoSend: true }));
    expect(markSchedulePaidIfDue("cas", NOW)).toBe(true);
    // Now advanced (lastPaidAt = NOW) → next occurrence is in the future → not due.
    expect(markSchedulePaidIfDue("cas", NOW)).toBe(false);
  });

  it("returns false for an unknown id", () => {
    expect(markSchedulePaidIfDue("nope", NOW)).toBe(false);
  });
});
