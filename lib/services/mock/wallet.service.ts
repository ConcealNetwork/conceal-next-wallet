import { mockExportData, mockWalletInfo } from "@/lib/mock-data/wallet";
import { clone, mockDelay } from "@/lib/services/mock/helpers";
import type { DownloadWalletBackupResult, WalletService } from "@/lib/services/wallet.service";
import { backupDownloadFilename } from "@/lib/ui/download-json-file";

export const mockWalletService: WalletService = {
  async getWalletInfo() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay();
    return clone(mockWalletInfo);
  },
  async refreshWallet() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay();
    return clone(mockWalletInfo);
  },
  async hasStoredWallet() {
    return false;
  },
  async openWallet() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay();
    return clone(mockWalletInfo);
  },
  async prepareCreateWallet() {
    await mockDelay();
    return { mnemonic: mockExportData.mnemonic, address: mockWalletInfo.address };
  },
  async finalizeCreateWallet() {
    await mockDelay();
    return clone(mockWalletInfo);
  },
  async abortCreateWallet() {
    // no draft state in mock mode
  },
  async deleteStoredWallet() {
    // no persisted wallet in mock mode
  },
  async importWallet(input) {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay();
    void input;
    return clone(mockWalletInfo);
  },
  async exportWallet() {
    await mockDelay();
    return clone(mockExportData);
  },
  async exportWalletPdf() {
    await mockDelay();
    const { downloadWalletExportPdf } = await import("@/lib/ui/wallet-export-pdf");
    const filename = await downloadWalletExportPdf(clone(mockExportData));
    return { filename };
  },
  async downloadWalletBackup(input): Promise<DownloadWalletBackupResult> {
    await mockDelay();
    return {
      filename: backupDownloadFilename(input.filename),
      payload: {
        mock: true,
        note: "Placeholder encrypted wallet backup for UI review.",
      },
    };
  },
  async changePassword() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay();
    return { ok: true };
  },
  async disconnect() {
    // no runtime in mock mode
  },
};
