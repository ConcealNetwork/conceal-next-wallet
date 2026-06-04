import type { WalletSettings } from "@/lib/types";

export interface SettingsService {
  getSettings(): Promise<WalletSettings>;
  updateSettings(input: Partial<WalletSettings>): Promise<WalletSettings>;
  optimizeWallet(): Promise<{ ok: true }>;
  resetAndRescan(): Promise<{ ok: true }>;
}
