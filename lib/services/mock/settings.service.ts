import { mockSettings } from "@/lib/mock-data/wallet"
import { clone, mockDelay } from "@/lib/services/mock/helpers"
import type { SettingsService } from "@/lib/services/settings.service"

let currentSettings = clone(mockSettings)

export const mockSettingsService: SettingsService = {
  async getSettings() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return clone(currentSettings)
  },
  async updateSettings(input) {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    currentSettings = { ...currentSettings, ...input }
    return clone(currentSettings)
  },
  async optimizeWallet() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return { ok: true }
  },
  async resetAndRescan() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return { ok: true }
  },
}
