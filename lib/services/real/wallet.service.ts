import { ensureAllWalletLegacyLibs } from "@/lib/conceal/init";
import type {
  DownloadWalletBackupInput,
  ExportWalletData,
  FinalizeCreateWalletInput,
  ImportWalletInput,
  WalletService,
} from "@/lib/services/wallet.service";
import type { WalletInfo, WalletSummary } from "@/lib/types";

/** The legacy wallet-core engine is single-wallet — multi-wallet needs the SDK. */
const MULTI_WALLET_UNSUPPORTED = "Multiple wallets require the SDK engine.";

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
  async prepareCreateWallet() {
    return (await walletOps()).generateWalletDraftOperation();
  },
  async finalizeCreateWallet(input: FinalizeCreateWalletInput) {
    return (await walletOps()).finalizeWalletCreationOperation(input.password);
  },
  async abortCreateWallet() {
    (await walletOps()).abortWalletCreationOperation();
  },
  async deleteStoredWallet() {
    await (await walletOps()).deleteStoredWalletOperation();
  },
  async panicWipe() {
    await (await walletOps()).panicWipeOperation();
  },
  async importWallet(input: ImportWalletInput): Promise<WalletInfo> {
    return (await walletOps()).importWalletOperation(input);
  },
  async previewKeys(input) {
    return (await walletOps()).previewKeysOperation(input);
  },
  async exportWallet(): Promise<ExportWalletData> {
    return (await walletOps()).exportWalletOperation();
  },
  async exportWalletPdf() {
    return (await walletOps()).exportWalletPdfOperation();
  },
  async downloadWalletBackup(input: DownloadWalletBackupInput) {
    return (await walletOps()).downloadWalletBackupOperation(input);
  },
  async changePassword(input) {
    await (await walletOps()).changePasswordOperation(input.currentPassword, input.newPassword);
    return { ok: true as const };
  },
  async verifyPassword(password) {
    return (await walletOps()).verifyPasswordOperation(password);
  },
  async disconnect() {
    await disconnectWalletRuntime();
  },
  // Multi-wallet (#95): the legacy wallet-core engine holds a single wallet, so it
  // reports exactly one entry (the open wallet) and rejects multi-wallet actions.
  async listWallets(): Promise<WalletSummary[]> {
    try {
      const info = await (await walletOps()).getWalletInfoOperation();
      return [{ id: "default", label: "Main wallet", address: info.address, isActive: true }];
    } catch {
      // No open wallet (locked / not yet created) — nothing to list.
      return [];
    }
  },
  async switchWallet(id: string): Promise<WalletInfo | null> {
    // The legacy wallet-core engine holds a single wallet ("default"). Switching to
    // it is a no-op that returns the open wallet's info (instant); any other id is
    // unsupported.
    if (id !== "default") {
      throw new Error(MULTI_WALLET_UNSUPPORTED);
    }
    try {
      return await (await walletOps()).getWalletInfoOperation();
    } catch {
      // No open wallet (locked) — the caller must unlock.
      return null;
    }
  },
  async renameWallet() {
    throw new Error(MULTI_WALLET_UNSUPPORTED);
  },
  async deleteWallet() {
    // The single wallet is deleted via deleteStoredWallet / panicWipe.
    throw new Error(MULTI_WALLET_UNSUPPORTED);
  },
};

export async function disconnectWalletRuntime() {
  await ensureAllWalletLegacyLibs();
  const { disconnectWalletRuntime: disconnect } = await import("@/lib/wallet-core/wallet-runtime");
  await disconnect();
}
