import { beforeEach, describe, expect, it } from "vitest";
import { detectWalletChanges, type WalletBaseline } from "@/lib/notifications/wallet-change-detect";
import {
  isWatchOtherWalletsEnabled,
  setWatchOtherWalletsEnabled,
} from "@/lib/notifications/watch-wallets";
import type { SecondaryWalletStatus } from "@/lib/types";

/**
 * Coverage for the multi-wallet background watcher (#108): the pure change-detection diff
 * and the device-local opt-in store.
 */

function status(over: Partial<SecondaryWalletStatus> = {}): SecondaryWalletStatus {
  return { id: "w1", label: "Wallet 1", balanceTotal: { atomic: 1000 }, receivedCount: 0, ...over };
}

describe("detectWalletChanges", () => {
  it("seeds the baseline on first observation without a notice", () => {
    const { notices, next } = detectWalletChanges(new Map(), [status()]);
    expect(notices).toEqual([]);
    expect(next.get("w1")).toEqual({ balanceAtomic: 1000, receivedCount: 0 });
  });

  it("fires a funds notice with the delta on a balance increase", () => {
    const prev = new Map<string, WalletBaseline>([
      ["w1", { balanceAtomic: 1000, receivedCount: 0 }],
    ]);
    const { notices } = detectWalletChanges(prev, [status({ balanceTotal: { atomic: 1700 } })]);
    expect(notices).toEqual([{ id: "w1", label: "Wallet 1", kind: "funds", deltaAtomic: 700 }]);
  });

  it("never notifies on a balance DECREASE (an outbound spend)", () => {
    const prev = new Map<string, WalletBaseline>([
      ["w1", { balanceAtomic: 1000, receivedCount: 0 }],
    ]);
    const { notices } = detectWalletChanges(prev, [status({ balanceTotal: { atomic: 400 } })]);
    expect(notices).toEqual([]);
  });

  it("fires a message notice on a received-count increase", () => {
    const prev = new Map<string, WalletBaseline>([
      ["w1", { balanceAtomic: 1000, receivedCount: 2 }],
    ]);
    const { notices } = detectWalletChanges(prev, [status({ receivedCount: 3 })]);
    expect(notices).toEqual([{ id: "w1", label: "Wallet 1", kind: "message" }]);
  });

  it("fires BOTH a funds and a message notice when both grew", () => {
    const prev = new Map<string, WalletBaseline>([
      ["w1", { balanceAtomic: 1000, receivedCount: 0 }],
    ]);
    const { notices } = detectWalletChanges(prev, [
      status({ balanceTotal: { atomic: 1100 }, receivedCount: 1 }),
    ]);
    expect(notices.map((n) => n.kind).sort()).toEqual(["funds", "message"]);
  });

  it("carries every observed wallet forward in the next baseline", () => {
    const { next } = detectWalletChanges(new Map(), [
      status({ id: "a", balanceTotal: { atomic: 5 } }),
      status({ id: "b", balanceTotal: { atomic: 9 }, receivedCount: 4 }),
    ]);
    expect(next.get("a")).toEqual({ balanceAtomic: 5, receivedCount: 0 });
    expect(next.get("b")).toEqual({ balanceAtomic: 9, receivedCount: 4 });
  });

  it("preserves the baseline of a wallet absent this round (transient sync failure)", () => {
    const prev = new Map<string, WalletBaseline>([
      ["w1", { balanceAtomic: 1000, receivedCount: 0 }],
      ["w2", { balanceAtomic: 50, receivedCount: 1 }],
    ]);
    // Only w1 reported this round; w2 transiently failed to sync. Its baseline must survive
    // so funds that arrived during the outage are still announced when it reappears.
    const { notices, next } = detectWalletChanges(prev, [status({ id: "w1" })]);
    expect(notices).toEqual([]);
    expect(next.get("w2")).toEqual({ balanceAtomic: 50, receivedCount: 1 });
  });
});

describe("watch-other-wallets opt-in store", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to false", () => {
    expect(isWatchOtherWalletsEnabled()).toBe(false);
  });

  it("round-trips the enabled flag", () => {
    setWatchOtherWalletsEnabled(true);
    expect(isWatchOtherWalletsEnabled()).toBe(true);
    setWatchOtherWalletsEnabled(false);
    expect(isWatchOtherWalletsEnabled()).toBe(false);
  });
});
