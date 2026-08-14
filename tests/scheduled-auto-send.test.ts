import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_WALLET_ID } from "@/lib/auth/biometric-store";
import {
  clearSchedules,
  listSchedules,
  markSchedulePaidIfDue,
  saveSchedule,
  setScheduleAutoSend,
} from "@/lib/storage/scheduled-payments-store";
import {
  belongsToWallet,
  type ScheduledPayment,
  schedulesToAutoSend,
} from "@/lib/ui/scheduled-payments";

/** Pure-selector + store coverage for scheduled auto-send (#92 phase 2). */

const NOW = "2026-06-22T00:00:00.000Z";
const PAST = "2020-01-01T00:00:00.000Z";
const FUTURE = "2999-01-01T00:00:00.000Z";

function sched(over: Partial<ScheduledPayment> = {}): ScheduledPayment {
  return {
    id: "s1",
    walletId: DEFAULT_WALLET_ID,
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

  it("only fires a schedule for the wallet it belongs to (never the wrong active wallet)", () => {
    const list = [
      sched({ id: "for-A", autoSend: true, walletId: "A" }),
      sched({ id: "for-B", autoSend: true, walletId: "B" }),
      sched({ id: "legacy", autoSend: true }), // unstamped → default wallet
    ];
    expect(schedulesToAutoSend(list, NOW, "A").map((s) => s.id)).toEqual(["for-A"]);
    expect(schedulesToAutoSend(list, NOW, "B").map((s) => s.id)).toEqual(["for-B"]);
    expect(schedulesToAutoSend(list, NOW, DEFAULT_WALLET_ID).map((s) => s.id)).toEqual(["legacy"]);
  });
});

describe("belongsToWallet", () => {
  it("resolves walletId, then autoSendWalletId, then default", () => {
    expect(belongsToWallet({ walletId: "w1" }, "w1")).toBe(true);
    expect(belongsToWallet({ autoSendWalletId: "w2" }, "w2")).toBe(true);
    expect(belongsToWallet({}, DEFAULT_WALLET_ID)).toBe(true);
    expect(belongsToWallet({ walletId: "w1" }, "w2")).toBe(false);
  });
});

describe("setScheduleAutoSend store", () => {
  beforeEach(() => localStorage.clear());

  it("arms and disarms a saved schedule", () => {
    saveSchedule(sched({ id: "x" }));
    expect(listSchedules(DEFAULT_WALLET_ID)[0].autoSend).toBeUndefined();
    setScheduleAutoSend("x", true, DEFAULT_WALLET_ID);
    expect(listSchedules(DEFAULT_WALLET_ID)[0].autoSend).toBe(true);
    setScheduleAutoSend("x", false, DEFAULT_WALLET_ID);
    expect(listSchedules(DEFAULT_WALLET_ID)[0].autoSend).toBe(false);
  });

  it("round-trips autoSend + walletId through the persistence guard", () => {
    saveSchedule(
      sched({ id: "y", autoSend: true, autoSendWalletId: "wallet-2", walletId: "wallet-2" }),
    );
    const read = listSchedules("wallet-2").find((s) => s.id === "y");
    expect(read?.autoSend).toBe(true);
    expect(read?.autoSendWalletId).toBe("wallet-2");
    expect(read?.walletId).toBe("wallet-2");
  });

  it("stamps + clears the wallet id when arming / disarming", () => {
    saveSchedule(sched({ id: "z", walletId: "wallet-9" }));
    setScheduleAutoSend("z", true, "wallet-9");
    expect(listSchedules("wallet-9")[0].autoSendWalletId).toBe("wallet-9");
    setScheduleAutoSend("z", false, "wallet-9");
    expect(listSchedules("wallet-9")[0].autoSendWalletId).toBeUndefined();
  });

  it("clearSchedules removes only the targeted wallet's entries", () => {
    saveSchedule(sched({ id: "keep", walletId: "wallet-a" }));
    saveSchedule(sched({ id: "drop", walletId: "wallet-b" }));
    clearSchedules("wallet-b");
    expect(listSchedules("wallet-a").map((s) => s.id)).toEqual(["keep"]);
    expect(listSchedules("wallet-b")).toHaveLength(0);
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
