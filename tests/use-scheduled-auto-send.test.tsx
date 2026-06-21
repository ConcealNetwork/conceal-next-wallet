import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduledPayment } from "@/lib/ui/scheduled-payments";

/**
 * Critical safety property of the #92 phase-2 auto-send engine: each due schedule is
 * ADVANCED (markSchedulePaid) BEFORE the send, so a crash/re-tick/reload can't re-fire it —
 * the worst case on failure is a missed payment, never a double-send.
 */

const order: string[] = [];
const sendTransaction = vi.fn(async (_input?: unknown) => {
  order.push("send");
  return {} as never;
});
const markSchedulePaid = vi.fn((_id: string, _at: string) => {
  order.push("mark");
  return [] as ScheduledPayment[];
});
let schedules: ScheduledPayment[] = [];

vi.mock("@/lib/env", () => ({ env: { useMockWallet: false } }));
vi.mock("@/lib/session/wallet-session", () => ({ useWalletSession: () => ({ status: "open" }) }));
vi.mock("@/lib/hooks", () => ({ useWalletInfo: () => ({ data: { viewOnly: false } }) }));
vi.mock("@/lib/hooks/query-provider", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/services", () => ({
  services: { transactions: { sendTransaction: (input: unknown) => sendTransaction(input) } },
}));
vi.mock("@/lib/storage/scheduled-payments-store", () => ({
  listSchedules: () => schedules,
  markSchedulePaid: (id: string, at: string) => markSchedulePaid(id, at),
}));

import { useScheduledAutoSend } from "@/lib/hooks/use-scheduled-auto-send";

const armedDue: ScheduledPayment = {
  id: "rent",
  label: "Rent",
  address: "ccx7test",
  amount: "10",
  cadence: "monthly",
  anchorDate: "2020-01-01T00:00:00.000Z", // long past → due
  autoSend: true,
};

describe("useScheduledAutoSend", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    order.length = 0;
    sendTransaction.mockClear();
    markSchedulePaid.mockClear();
    schedules = [];
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("advances the schedule BEFORE sending, exactly once", async () => {
    schedules = [armedDue];
    renderHook(() => useScheduledAutoSend());
    await vi.advanceTimersByTimeAsync(0); // flush the mount tick

    expect(markSchedulePaid).toHaveBeenCalledTimes(1);
    expect(sendTransaction).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["mark", "send"]); // advance precedes the broadcast
    expect(sendTransaction).toHaveBeenCalledWith({ address: "ccx7test", amount: 10 });
  });

  it("does not auto-send a non-armed schedule", async () => {
    schedules = [{ ...armedDue, autoSend: false }];
    renderHook(() => useScheduledAutoSend());
    await vi.advanceTimersByTimeAsync(0);
    expect(sendTransaction).not.toHaveBeenCalled();
  });
});
