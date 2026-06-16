import { ensureAllWalletLegacyLibs } from "@/lib/conceal/init";
import { assertRealWalletCanSpend } from "@/lib/services/real/view-only-runtime";
import type { SettingsService } from "@/lib/services/settings.service";
import type { WalletSettings } from "@/lib/types";
import { walletCopy } from "@/lib/ui/wallet-copy";

async function settingsOps() {
  await ensureAllWalletLegacyLibs();
  return import("@/lib/wallet-core/settings-operations");
}

export const realSettingsService: SettingsService = {
  async getSettings(): Promise<WalletSettings> {
    return (await settingsOps()).getSettingsOperation();
  },
  async updateSettings(input: Partial<WalletSettings>): Promise<WalletSettings> {
    return (await settingsOps()).updateSettingsOperation(input);
  },
  async getOptimizationStatus() {
    return (await settingsOps()).getOptimizationStatusOperation();
  },
  async optimizeWallet() {
    await assertRealWalletCanSpend(walletCopy.viewOnlyOptimizeDisabled);
    return (await settingsOps()).optimizeWalletOperation();
  },
  async resetAndRescan() {
    return (await settingsOps()).resetAndRescanOperation();
  },
};
