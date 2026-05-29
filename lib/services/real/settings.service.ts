import { ensureAllWalletLegacyLibs } from "@/lib/conceal/init"
import type { SettingsService } from "@/lib/services/settings.service"
import type { WalletSettings } from "@/lib/types"

async function settingsOps() {
  await ensureAllWalletLegacyLibs()
  return import("@/lib/wallet-core/settings-operations")
}

export const realSettingsService: SettingsService = {
  async getSettings(): Promise<WalletSettings> {
    return (await settingsOps()).getSettingsOperation()
  },
  async updateSettings(input: Partial<WalletSettings>): Promise<WalletSettings> {
    return (await settingsOps()).updateSettingsOperation(input)
  },
  async optimizeWallet() {
    return (await settingsOps()).optimizeWalletOperation()
  },
  async resetAndRescan() {
    return (await settingsOps()).resetAndRescanOperation()
  },
}
