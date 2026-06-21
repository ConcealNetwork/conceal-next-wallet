import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduledPayment } from "@/lib/ui/scheduled-payments";

/**
 * Critical safety properties of the #92 phase-2 auto-send engine: each due schedule is
 * ADVANCED (compare-and-swap markSchedulePaidIfDue) BEFORE the send, and once advanced it
 * never re-fires — the worst case on failure is a missed payment, never a double-send.
 */

const order: string[] = [];
const sendTransaction = vi.fn(async (_input?: unknown) => {
  order.push("send");
  return {} as never;
});
let dueOnNextCas = true; // markSchedulePaidIfDue: true once, then false (advanced)
const markSchedulePaidIfDue = vi.fn((_id: string, _at: string) => {
  order.push("mark");
  const fired = dueOnNextCas;
  dueOnNextCas = false;
  return fired;
});
let schedules: ScheduledPayment[] = [];

vi.mock("@/lib/env", () => ({ env: { useMockWallet: false } }));
vi.mock("@/lib/session/wallet-session", () => ({ useWalletSession: () => ({ status: "open" }) }));
vi.mock("@/lib/hooks", () => ({
  useWalletInfo: () => ({ data: { viewOnly: false } }),
  useWallets: () => ({ data: [{ id: "default", isActive: true }] }),
}));
vi.mock("@/lib/hooks/query-provider", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/notifications/notify", () => ({ notify: vi.fn(), canNotify: () => false }));
vi.mock("@/lib/services", () => ({
  services: { transactions: { sendTransaction: (input: unknown) => sendTransaction(input) } },
}));
vi.mock("@/lib/storage/scheduled-payments-store", () => ({
  listSchedules: () => schedules,
  markSchedulePaidIfDue: (id: string, at: string) => markSchedulePaidIfDue(id, at),
  setScheduleAutoSend: vi.fn(),
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
    markSchedulePaidIfDue.mockClear();
    dueOnNextCas = true;
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

    expect(order).toEqual(["mark", "send"]); // advance precedes the broadcast
    expect(sendTransaction).toHaveBeenCalledTimes(1);
    expect(sendTransaction).toHaveBeenCalledWith({ address: "ccx7test", amount: 10 });
  });

  it("does not auto-send a non-armed schedule", async () => {
    schedules = [{ ...armedDue, autoSend: false }];
    renderHook(() => useScheduledAutoSend());
    await vi.advanceTimersByTimeAsync(0);
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("does not re-send on a later tick once the instance is advanced (CAS guards it)", async () => {
    schedules = [armedDue];
    sendTransaction.mockRejectedValueOnce(new Error("boom")); // even a failed send stays advanced
    renderHook(() => useScheduledAutoSend());
    await vi.advanceTimersByTimeAsync(0); // tick 1: mark(true) → send (fails)
    await vi.advanceTimersByTimeAsync(30_000); // tick 2: markSchedulePaidIfDue → false → no send

    expect(sendTransaction).toHaveBeenCalledTimes(1);
  });
});
