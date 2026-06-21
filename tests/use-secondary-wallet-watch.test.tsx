import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SecondaryWalletStatus } from "@/lib/types";

/**
 * Hook-level coverage for the #108 background watcher — the timer/teardown orchestration the
 * pure {@link detectWalletChanges} tests can't reach: silent first observation, notify on a
 * later delta, and the canNotify() gate. Modules are mocked so no engine/session is needed.
 */

const syncSecondaryWallets = vi.fn<() => Promise<SecondaryWalletStatus[]>>();
const notify = vi.fn();
const canNotify = vi.fn(() => true);

vi.mock("@/lib/env", () => ({ env: { useMockWallet: false } }));
vi.mock("@/lib/session/wallet-session", () => ({ useWalletSession: () => ({ status: "open" }) }));
vi.mock("@/lib/notifications/watch-wallets", () => ({ isWatchOtherWalletsEnabled: () => true }));
vi.mock("@/lib/notifications/notify", () => ({
  notify: (...args: unknown[]) => notify(...args),
  canNotify: () => canNotify(),
}));
vi.mock("@/lib/services", () => ({
  services: { wallet: { syncSecondaryWallets: () => syncSecondaryWallets() } },
}));

import { useSecondaryWalletWatch } from "@/lib/hooks/use-secondary-wallet-watch";

function status(atomic: number): SecondaryWalletStatus {
  return { id: "w1", label: "Savings", balanceTotal: { atomic }, receivedCount: 0 };
}

describe("useSecondaryWalletWatch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    syncSecondaryWallets.mockReset();
    notify.mockReset();
    canNotify.mockReturnValue(true);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("seeds silently on first observation, then notifies on a later balance increase", async () => {
    syncSecondaryWallets
      .mockResolvedValueOnce([status(1000)]) // mount tick → seed
      .mockResolvedValueOnce([status(1700)]); // next tick → +700 funds notice

    renderHook(() => useSecondaryWalletWatch());
    await vi.advanceTimersByTimeAsync(0); // flush the mount tick
    expect(notify).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(45_000); // next poll
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toContain("Savings");
  });

  it("never notifies while OS permission is not granted", async () => {
    canNotify.mockReturnValue(false);
    syncSecondaryWallets
      .mockResolvedValueOnce([status(1000)])
      .mockResolvedValueOnce([status(5000)]);

    renderHook(() => useSecondaryWalletWatch());
    await vi.advanceTimersByTimeAsync(45_000);
    expect(notify).not.toHaveBeenCalled();
  });
});
