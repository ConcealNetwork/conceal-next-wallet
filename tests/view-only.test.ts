import { afterEach, describe, expect, it } from "vitest";
import { MOCK_ADDRESS, mockWalletInfo } from "@/lib/mock-data/wallet";
import { services } from "@/lib/services";
import { _resetMockViewOnly } from "@/lib/services/mock/wallet.service";
import { assertCanSpend, ViewOnlyWalletError } from "@/lib/services/view-only";

const viewOnlyImport = {
  method: "keys" as const,
  address: MOCK_ADDRESS,
  viewOnly: true,
  privateViewKey: "a".repeat(64),
  privateSpendKey: "",
  password: "password123",
};

afterEach(() => {
  _resetMockViewOnly();
});

describe("assertCanSpend", () => {
  it("throws a typed ViewOnlyWalletError when view-only", () => {
    expect(() => assertCanSpend(true, "nope")).toThrow(ViewOnlyWalletError);
    expect(() => assertCanSpend(true, "nope")).toThrow("nope");
  });

  it("is a no-op when not view-only", () => {
    expect(() => assertCanSpend(false, "nope")).not.toThrow();
  });
});

describe("mock view-only state", () => {
  it("defaults to viewOnly:false and propagates a view-only keys import", async () => {
    expect((await services.wallet.getWalletInfo()).viewOnly).toBe(false);

    const imported = await services.wallet.importWallet(viewOnlyImport);
    expect(imported.viewOnly).toBe(true);
    expect((await services.wallet.getWalletInfo()).viewOnly).toBe(true);
  });

  it("treats a non-view-only keys import and mnemonic import as spend-capable", async () => {
    const keys = await services.wallet.importWallet({ ...viewOnlyImport, viewOnly: false });
    expect(keys.viewOnly).toBe(false);

    await services.wallet.importWallet(viewOnlyImport); // flip on
    const mnemonic = await services.wallet.importWallet({
      method: "mnemonic",
      mnemonic: "mock",
      password: "password123",
    });
    expect(mnemonic.viewOnly).toBe(false); // mnemonic import resets
  });

  it("resets to spend-capable after creating a wallet", async () => {
    await services.wallet.importWallet(viewOnlyImport);
    await services.wallet.finalizeCreateWallet({ password: "password123" });
    expect((await services.wallet.getWalletInfo()).viewOnly).toBe(false);
  });

  it("does not mutate the shared mockWalletInfo fixture", async () => {
    const before = mockWalletInfo.viewOnly;
    const info = await services.wallet.importWallet(viewOnlyImport);
    expect(info).not.toBe(mockWalletInfo);
    expect(mockWalletInfo.viewOnly).toBe(before); // still false
  });
});

describe("view-only spend guards (mock parity with real)", () => {
  it("blocks every spend operation with friendly copy when view-only", async () => {
    await services.wallet.importWallet(viewOnlyImport);

    await expect(
      services.transactions.sendTransaction({ address: "ccx7mockaddress", amount: 1 }),
    ).rejects.toThrow(/view-only/i);
    await expect(
      services.deposits.createDeposit({ amount: 10, durationMonths: 12 }),
    ).rejects.toThrow(/view-only/i);
    await expect(
      services.deposits.withdrawDeposit({ txHash: "mock-deposit-tx-hash", globalOutputIndex: 0 }),
    ).rejects.toThrow(/view-only/i);
    await expect(
      services.messages.sendMessage({ recipientAddress: "ccx7mockaddress", body: "hi" }),
    ).rejects.toThrow(/view-only/i);
    await expect(services.settings.optimizeWallet()).rejects.toThrow(/view-only/i);
  });

  it("leaves read operations working when view-only", async () => {
    await services.wallet.importWallet(viewOnlyImport);

    await expect(services.transactions.listTransactions()).resolves.toBeInstanceOf(Array);
    await expect(services.deposits.listDeposits()).resolves.toBeInstanceOf(Array);
    await expect(services.messages.listMessages()).resolves.toBeInstanceOf(Array);
    await expect(services.messages.markRead("msg-001")).resolves.toMatchObject({ unread: false });
  });
});
