import { mockExportData, mockWalletInfo } from "@/lib/mock-data/wallet";
import { clone, mockDelay } from "@/lib/services/mock/helpers";
import type { DownloadWalletBackupResult, WalletService } from "@/lib/services/wallet.service";
import type { WalletInfo } from "@/lib/types";
import { backupDownloadFilename } from "@/lib/ui/download-json-file";

// Mock services are module singletons, so the imported view-only state lives
// here. A view-only `importWallet` flips it on; any full import/create resets it.
let mockViewOnly = false;

/** Current mock view-only state — read by the mock spend-service guards. */
export function isMockViewOnly(): boolean {
  return mockViewOnly;
}

/** Test-only reset so suites that toggle view-only don't leak state. */
export function _resetMockViewOnly(): void {
  mockViewOnly = false;
}

function currentWalletInfo(): WalletInfo {
  return { ...clone(mockWalletInfo), viewOnly: mockViewOnly };
}

export const mockWalletService: WalletService = {
  async getWalletInfo() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay();
    return currentWalletInfo();
  },
  async refreshWallet() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay();
    return currentWalletInfo();
  },
  async hasStoredWallet() {
    return false;
  },
  async openWallet() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay();
    return currentWalletInfo();
  },
  async prepareCreateWallet() {
    await mockDelay();
    return { mnemonic: mockExportData.mnemonic, address: mockWalletInfo.address };
  },
  async finalizeCreateWallet() {
    await mockDelay();
    mockViewOnly = false;
    return currentWalletInfo();
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
    mockViewOnly = input.method === "keys" && input.viewOnly === true;
    return currentWalletInfo();
  },
  async previewKeys() {
    // Mock mode has no crypto engine; echo sample export data for UI review.
    await mockDelay();
    return { address: mockExportData.address, viewKey: mockExportData.viewKey };
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
