import { describe, expect, it } from "vitest";
import { services } from "@/lib/services";

describe("mock services", () => {
  it("returns valid typed data from every mock service", async () => {
    const [
      wallet,
      refreshed,
      opened,
      prepared,
      finalized,
      imported,
      exportedWallet,
      changedPassword,
      transactions,
      sentTransaction,
      market,
      messages,
      sentMessage,
      readMessage,
      deposits,
      createdDeposit,
      addresses,
      createdAddress,
      updatedAddress,
      deletedAddress,
      network,
      settings,
      updatedSettings,
      optimized,
      optimizationStatus,
      rescanned,
    ] = await Promise.all([
      services.wallet.getWalletInfo(),
      services.wallet.refreshWallet(),
      services.wallet.openWallet(),
      services.wallet.prepareCreateWallet(),
      services.wallet.finalizeCreateWallet({ password: "password123" }),
      services.wallet.importWallet({
        method: "mnemonic",
        mnemonic: "mock",
        password: "password123",
      }),
      services.wallet.exportWallet(),
      services.wallet.changePassword({
        currentPassword: "password123",
        newPassword: "password456",
      }),
      services.transactions.listTransactions(),
      services.transactions.sendTransaction({ address: "ccx7mockaddress", amount: 1 }),
      services.market.getMarketData(),
      services.messages.listMessages(),
      services.messages.sendMessage({ recipientAddress: "ccx7mockaddress", body: "hello" }),
      services.messages.markRead("msg-001"),
      services.deposits.listDeposits(),
      services.deposits.createDeposit({ amount: 10, durationMonths: 12 }),
      services.addressBook.listEntries(),
      services.addressBook.createEntry({ label: "Mock", address: "ccx7mockaddress" }),
      services.addressBook.updateEntry("addr-1", { label: "Updated", address: "ccx7mockaddress" }),
      services.addressBook.deleteEntry("addr-1"),
      services.network.getNodeStatus(),
      services.settings.getSettings(),
      services.settings.updateSettings({ readMinorTx: true }),
      services.settings.optimizeWallet(),
      services.settings.getOptimizationStatus(),
      services.settings.resetAndRescan(),
    ]);

    expect(wallet.address).toMatch(/^ccx7/);
    expect(refreshed.balanceTotal.atomic).toBeGreaterThan(0);
    expect(opened.available.atomic).toBeGreaterThan(0);
    expect(prepared.mnemonic).toContain("mock");
    expect(finalized.address).toMatch(/^ccx7/);
    expect(imported.address).toMatch(/^ccx7/);
    expect(exportedWallet.spendKey).toContain("mock");
    expect(changedPassword.ok).toBe(true);
    expect(transactions).toHaveLength(8);
    expect(sentTransaction.type).toBe("send");
    expect(market.price.value).toBeGreaterThan(0);
    expect(messages[0].counterpartyAddress).toMatch(/^ccx7/);
    expect(sentMessage.direction).toBe("sent");
    expect(readMessage.id).toBe("msg-001");
    expect(deposits[0].amount.atomic).toBeGreaterThan(0);
    expect(createdDeposit.durationMonths).toBe(12);
    expect(addresses.length).toBeGreaterThan(0);
    expect(addresses.every((entry) => entry.address.startsWith("ccx7"))).toBe(true);
    expect(createdAddress.label).toBe("Mock");
    expect(updatedAddress.label).toBe("Updated");
    expect(deletedAddress.ok).toBe(true);
    expect(network.peers).toBeGreaterThan(0);
    expect(typeof settings.nodeUrl).toBe("string");
    expect(updatedSettings.readMinorTx).toBe(true);
    expect(optimized.ok).toBe(true);
    expect(optimized.optimized).toBe(true);
    expect(optimizationStatus.isNeeded).toBe(true);
    expect(optimizationStatus.unspentOutputs).toBeGreaterThan(0);
    expect(rescanned.ok).toBe(true);
  });

  // #193: the mock must mirror the real SDK's error contract — throw on an unknown id rather
  // than silently returning the wrong message (which would patch the wrong row's read state).
  it("markRead rejects an unknown message id (matches the real SDK contract)", async () => {
    await expect(services.messages.markRead("does-not-exist")).rejects.toThrow(
      "Message not found.",
    );
  });
});
