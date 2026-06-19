import { beforeEach, describe, expect, it } from "vitest";
import { _resetMockWallets, mockWalletService } from "@/lib/services/mock/wallet.service";

/**
 * Multi-wallet service spine (#95), mock implementation: listWallets / switchWallet
 * / renameWallet / deleteWallet, exercised through the WalletService interface. The
 * mock keeps an in-module registry of two fake wallets, mutated immutably.
 */

beforeEach(() => {
  _resetMockWallets();
});

describe("mock wallet service — multi-wallet (#95)", () => {
  it("lists the seeded wallets with exactly one active", async () => {
    const wallets = await mockWalletService.listWallets();
    expect(wallets).toHaveLength(2);
    expect(wallets.filter((w) => w.isActive)).toHaveLength(1);
    expect(wallets[0].isActive).toBe(true);
    expect(wallets.every((w) => typeof w.label === "string" && w.label.length > 0)).toBe(true);
  });

  it("switches the active wallet", async () => {
    const before = await mockWalletService.listWallets();
    const target = before.find((w) => !w.isActive);
    if (!target) throw new Error("expected an inactive wallet to switch to");

    await mockWalletService.switchWallet(target.id);
    const after = await mockWalletService.listWallets();
    expect(after.find((w) => w.id === target.id)?.isActive).toBe(true);
    expect(after.filter((w) => w.isActive)).toHaveLength(1);
  });

  it("ignores a switch to an unknown id", async () => {
    const before = await mockWalletService.listWallets();
    await mockWalletService.switchWallet("does-not-exist");
    const after = await mockWalletService.listWallets();
    expect(after.find((w) => w.isActive)?.id).toBe(before.find((w) => w.isActive)?.id);
  });

  it("renames a wallet and rejects a blank name", async () => {
    const [first] = await mockWalletService.listWallets();
    await mockWalletService.renameWallet(first.id, "  Renamed  ");
    const after = await mockWalletService.listWallets();
    expect(after.find((w) => w.id === first.id)?.label).toBe("Renamed");

    await expect(mockWalletService.renameWallet(first.id, "   ")).rejects.toThrow();
  });

  it("deletes a wallet and reassigns active when the active one is removed", async () => {
    const before = await mockWalletService.listWallets();
    const active = before.find((w) => w.isActive);
    if (!active) throw new Error("expected an active wallet");
    await mockWalletService.deleteWallet(active.id);

    const after = await mockWalletService.listWallets();
    expect(after).toHaveLength(1);
    expect(after.find((w) => w.id === active.id)).toBeUndefined();
    // A surviving wallet becomes active.
    expect(after.filter((w) => w.isActive)).toHaveLength(1);
  });
});
