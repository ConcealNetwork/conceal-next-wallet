import type { WalletInfo } from "@/lib/types";

export type FinalizeCreateWalletInput = {
  password: string;
};

export type PrepareCreateWalletResult = {
  mnemonic: string;
  address: string;
};

export type OpenWalletInput = {
  password?: string;
  label?: string;
};

export type ImportWalletInput =
  | {
      method: "mnemonic";
      mnemonic: string;
      password: string;
      scanHeight?: number;
      language?: string;
      label?: string;
    }
  | {
      method: "keys";
      address: string;
      viewOnly: boolean;
      privateViewKey: string;
      privateSpendKey: string;
      password: string;
      scanHeight?: number;
      label?: string;
    }
  | { method: "file"; file: ArrayBuffer | string; password: string; label?: string }
  | { method: "qr"; payload: string; password: string; label?: string }
  | { method: "open"; password: string; label?: string };

export type ExportWalletData = {
  address: string;
  mnemonic: string;
  spendKey: string;
  viewKey: string;
  creationHeight: number;
};

export type DownloadWalletBackupInput = {
  filename: string;
  password: string;
};

export type DownloadWalletBackupResult = {
  filename: string;
  payload: unknown;
};

export interface WalletService {
  getWalletInfo(): Promise<WalletInfo>;
  refreshWallet(): Promise<WalletInfo>;
  hasStoredWallet(): Promise<boolean>;
  openWallet(input?: OpenWalletInput): Promise<WalletInfo>;
  prepareCreateWallet(): Promise<PrepareCreateWalletResult>;
  finalizeCreateWallet(input: FinalizeCreateWalletInput): Promise<WalletInfo>;
  deleteStoredWallet(): Promise<void>;
  abortCreateWallet(): Promise<void>;
  importWallet(input: ImportWalletInput): Promise<WalletInfo>;
  exportWallet(): Promise<ExportWalletData>;
  exportWalletPdf(): Promise<{ filename: string }>;
  downloadWalletBackup(input: DownloadWalletBackupInput): Promise<DownloadWalletBackupResult>;
  changePassword(input: { currentPassword: string; newPassword: string }): Promise<{ ok: true }>;
  disconnect?(): Promise<void>;
}
