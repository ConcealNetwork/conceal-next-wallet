import { mockExportData, mockWalletInfo } from "@/lib/mock-data/wallet"
import { clone, mockDelay } from "@/lib/services/mock/helpers"
import type { WalletService } from "@/lib/services/wallet.service"

export const mockWalletService: WalletService = {
  async getWalletInfo() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return clone(mockWalletInfo)
  },
  async refreshWallet() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return clone(mockWalletInfo)
  },
  async openWallet() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return clone(mockWalletInfo)
  },
  async createWallet() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return { wallet: clone(mockWalletInfo), mnemonic: mockExportData.mnemonic }
  },
  async importWallet() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return clone(mockWalletInfo)
  },
  async exportWallet() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return clone(mockExportData)
  },
  async changePassword() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return { ok: true }
  },
}
