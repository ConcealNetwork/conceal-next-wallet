import { mockExportData, mockWalletInfo } from "@/lib/mock-data/wallet";
import { clone, mockDelay } from "@/lib/services/mock/helpers";
import type { DownloadWalletBackupResult, WalletService } from "@/lib/services/wallet.service";
import type { CcxAmount, WalletInfo, WalletSummary } from "@/lib/types";
import { backupDownloadFilename } from "@/lib/ui/download-json-file";
import { ccxAmount } from "@/lib/utils";

// Mock services are module singletons, so the imported view-only state lives
// here. A view-only `importWallet` flips it on; any full import/create resets it.
let mockViewOnly = false;

// --- multi-wallet mock state (#95) -----------------------------------------
// A believable two-wallet registry, mutated immutably (spread, never in place).
// Each wallet carries a distinct balance so the switcher can show per-wallet totals.
type MockWalletEntry = { id: string; label: string; address?: string; balanceTotal: CcxAmount };

const INITIAL_MOCK_WALLETS: readonly MockWalletEntry[] = [
  {
    id: "default",
    label: "Main wallet",
    address: mockWalletInfo.address,
    balanceTotal: mockWalletInfo.balanceTotal,
  },
  {
    id: "mock-savings",
    label: "Savings",
    address: mockExportData.address,
    balanceTotal: ccxAmount(4820.25),
  },
];

let mockWallets: readonly MockWalletEntry[] = INITIAL_MOCK_WALLETS;
let mockActiveId = "default";

/** Test-only reset so suites that mutate the mock registry don't leak state. */
export function _resetMockWallets(): void {
  mockWallets = INITIAL_MOCK_WALLETS;
  mockActiveId = "default";
}

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
    // Opening the default mock wallet is spend-capable; don't inherit a prior
    // view-only import (real mode re-derives from the stored keys on unlock).
    mockViewOnly = false;
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
  async panicWipe() {
    // No persisted wallet/engine state in mock mode; the hook clears the
    // mode-agnostic local data (tx notes, prefs) and the session.
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
  async verifyPassword(password: string) {
    // No real password in mock mode; accept any non-empty value.
    await mockDelay();
    return password.length > 0;
  },
  async disconnect() {
    // no runtime in mock mode; clear view-only so the next open starts clean
    mockViewOnly = false;
  },
  async listWallets(): Promise<WalletSummary[]> {
    await mockDelay();
    return mockWallets.map((wallet) => ({
      id: wallet.id,
      label: wallet.label,
      ...(wallet.address ? { address: wallet.address } : {}),
      isActive: wallet.id === mockActiveId,
      balanceTotal: wallet.balanceTotal,
    }));
  },
  async switchWallet(id: string): Promise<WalletInfo | null> {
    await mockDelay();
    if (mockWallets.some((wallet) => wallet.id === id)) {
      mockActiveId = id;
    }
    // Mock mode keeps the session "open" (the mock unlock takes no password), so a
    // switch is always instant — return the current wallet info, never null.
    return currentWalletInfo();
  },
  async renameWallet(id: string, label: string) {
    await mockDelay();
    const trimmed = label.trim();
    if (!trimmed) {
      throw new Error("A wallet name is required.");
    }
    mockWallets = mockWallets.map((wallet) =>
      wallet.id === id ? { ...wallet, label: trimmed } : wallet,
    );
  },
  async deleteWallet(id: string) {
    await mockDelay();
    mockWallets = mockWallets.filter((wallet) => wallet.id !== id);
    if (mockActiveId === id) {
      mockActiveId = mockWallets[0]?.id ?? "default";
    }
  },
  async syncSecondaryWallets() {
    // Mock mode has no real per-wallet background sync — nothing to watch (#108).
    return [];
  },
};
