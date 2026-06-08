import type { OptimizationStatus, OptimizeWalletResult, WalletSettings } from "@/lib/types";

export interface SettingsService {
  getSettings(): Promise<WalletSettings>;
  updateSettings(input: Partial<WalletSettings>): Promise<WalletSettings>;
  getOptimizationStatus(): Promise<OptimizationStatus>;
  optimizeWallet(): Promise<OptimizeWalletResult>;
  resetAndRescan(): Promise<{ ok: true }>;
}
