import { describe, expect, it } from "vitest";
import { isWalletSyncing, walletSyncPercent } from "@/lib/ui/wallet-sync";
import type { WalletInfo } from "@/lib/types";

const zero = { atomic: 0 };

function walletInfo(overrides: Partial<WalletInfo> = {}): WalletInfo {
  return {
    address: "ccx7test",
    viewOnly: false,
    balanceTotal: zero,
    available: zero,
    dust: zero,
    pending: zero,
    lockedDeposits: zero,
    withdrawable: zero,
    creationHeight: 0,
    currentHeight: 0,
    networkHeight: 0,
    ...overrides,
  };
}

describe("isWalletSyncing", () => {
  it("returns false when wallet info is missing", () => {
    expect(isWalletSyncing(undefined)).toBe(false);
  });

  it("returns false when within two blocks of the tip", () => {
    expect(isWalletSyncing(walletInfo({ currentHeight: 98, networkHeight: 100 }))).toBe(false);
    expect(isWalletSyncing(walletInfo({ currentHeight: 99, networkHeight: 100 }))).toBe(false);
  });

  it("returns true when more than two blocks behind", () => {
    expect(isWalletSyncing(walletInfo({ currentHeight: 97, networkHeight: 100 }))).toBe(true);
  });
});

describe("walletSyncPercent", () => {
  it("returns zero when network height is unknown", () => {
    expect(walletSyncPercent(undefined)).toBe(0);
    expect(walletSyncPercent(walletInfo())).toBe(0);
  });

  it("rounds the synced percentage", () => {
    expect(walletSyncPercent(walletInfo({ currentHeight: 50, networkHeight: 100 }))).toBe(50);
    expect(walletSyncPercent(walletInfo({ currentHeight: 1, networkHeight: 3 }))).toBe(33);
  });
});
