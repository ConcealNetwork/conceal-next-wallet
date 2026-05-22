import { describe, expect, it } from "vitest"
import { services } from "@/lib/services"

describe("mock services", () => {
  it("returns valid typed data from every mock service", async () => {
    const [
      wallet,
      refreshed,
      opened,
      created,
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
      rescanned,
    ] = await Promise.all([
      services.wallet.getWalletInfo(),
      services.wallet.refreshWallet(),
      services.wallet.openWallet(),
      services.wallet.createWallet({ name: "Mock", password: "password123" }),
      services.wallet.importWallet({ method: "mnemonic" }),
      services.wallet.exportWallet(),
      services.wallet.changePassword({ currentPassword: "password123", newPassword: "password456" }),
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
      services.settings.updateSettings({ autoLock: false }),
      services.settings.optimizeWallet(),
      services.settings.resetAndRescan(),
    ])

    expect(wallet.address).toMatch(/^ccx7/)
    expect(refreshed.balanceTotal.atomic).toBeGreaterThan(0)
    expect(opened.available.atomic).toBeGreaterThan(0)
    expect(created.mnemonic).toContain("mock")
    expect(imported.address).toMatch(/^ccx7/)
    expect(exportedWallet.spendKey).toContain("mock")
    expect(changedPassword.ok).toBe(true)
    expect(transactions).toHaveLength(8)
    expect(sentTransaction.type).toBe("send")
    expect(market.price.value).toBeGreaterThan(0)
    expect(messages[0].counterpartyAddress).toMatch(/^ccx7/)
    expect(sentMessage.direction).toBe("sent")
    expect(readMessage.id).toBe("msg-001")
    expect(deposits[0].amount.atomic).toBeGreaterThan(0)
    expect(createdDeposit.durationMonths).toBe(12)
    expect(addresses).toEqual([])
    expect(createdAddress.label).toBe("Mock")
    expect(updatedAddress.label).toBe("Updated")
    expect(deletedAddress.ok).toBe(true)
    expect(network.peers).toBeGreaterThan(0)
    expect(settings.language).toBe("English")
    expect(updatedSettings.autoLock).toBe(false)
    expect(optimized.ok).toBe(true)
    expect(rescanned.ok).toBe(true)
  })
})
