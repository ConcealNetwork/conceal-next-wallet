import { ensureAllWalletLegacyLibs } from "@/lib/conceal/init";
import type {
  CreateWalletInput,
  ExportWalletData,
  ImportWalletInput,
  WalletService,
} from "@/lib/services/wallet.service";
import type { WalletInfo } from "@/lib/types";

async function walletOps() {
  await ensureAllWalletLegacyLibs();
  return import("@/lib/wallet-core/wallet-operations");
}

export const realWalletService: WalletService = {
  async getWalletInfo(): Promise<WalletInfo> {
    return (await walletOps()).getWalletInfoOperation();
  },
  async refreshWallet(): Promise<WalletInfo> {
    return (await walletOps()).refreshWalletOperation();
  },
  async hasStoredWallet(): Promise<boolean> {
    const { hasStoredWalletOnDevice } = await import("@/lib/wallet-core/stored-wallet-check");
    return hasStoredWalletOnDevice();
  },
  async openWallet(input) {
    if (input?.password) {
      return (await walletOps()).unlockStoredWallet(input.password);
    }
    throw new Error("Password is required to open a stored wallet.");
  },
  async createWallet(input: CreateWalletInput) {
    return (await walletOps()).createWalletOperation(input.name, input.password);
  },
  async importWallet(input: ImportWalletInput): Promise<WalletInfo> {
    return (await walletOps()).importWalletOperation(input);
  },
  async exportWallet(): Promise<ExportWalletData> {
    return (await walletOps()).exportWalletOperation();
  },
  async changePassword(input) {
    await (await walletOps()).changePasswordOperation(input.currentPassword, input.newPassword);
    return { ok: true as const };
  },
  async disconnect() {
    await disconnectWalletRuntime();
  },
};

export async function disconnectWalletRuntime() {
  await ensureAllWalletLegacyLibs();
  const { disconnectWalletRuntime: disconnect } = await import("@/lib/wallet-core/wallet-runtime");
  disconnect();
}
