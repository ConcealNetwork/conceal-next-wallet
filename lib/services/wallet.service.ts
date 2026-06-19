import type { WalletInfo, WalletSummary } from "@/lib/types";

export type { WalletSummary };

export type FinalizeCreateWalletInput = {
  password: string;
  /** Optional wallet label (multi-wallet #95); defaults applied by the engine. */
  label?: string;
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

export type PreviewKeysInput = {
  spendKey: string;
  viewKey?: string;
};

export type PreviewKeysResult = {
  address: string;
  viewKey: string;
};

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
  /**
   * Panic wipe: delete the stored wallet AND clear all persisted wallet-engine
   * state (settings, custom node, …), terminating any sync workers. The UI layer
   * additionally clears mode-agnostic local data (tx notes, prefs).
   */
  panicWipe(): Promise<void>;
  abortCreateWallet(): Promise<void>;
  importWallet(input: ImportWalletInput): Promise<WalletInfo>;
  /** Derive the public address (and effective view key) from a spend key, locally. */
  previewKeys(input: PreviewKeysInput): Promise<PreviewKeysResult>;
  exportWallet(): Promise<ExportWalletData>;
  exportWalletPdf(): Promise<{ filename: string }>;
  downloadWalletBackup(input: DownloadWalletBackupInput): Promise<DownloadWalletBackupResult>;
  changePassword(input: { currentPassword: string; newPassword: string }): Promise<{ ok: true }>;
  /**
   * Verify a password against the stored wallet WITHOUT opening it — used to
   * confirm the password before encrypting it for a newly added passkey. Returns
   * false on a wrong password rather than throwing.
   */
  verifyPassword(password: string): Promise<boolean>;
  disconnect?(): Promise<void>;
  /**
   * Multi-wallet (#95). The engine can hold several encrypted wallets on one
   * device; these manage the switcher + Settings list. Creating/importing a wallet
   * (`finalizeCreateWallet` / `importWallet`) ADDS a wallet rather than replacing
   * the current one. `deleteStoredWallet` / `panicWipe` target the active wallet.
   */
  /** All wallets registered on this device, with the active one flagged. */
  listWallets(): Promise<WalletSummary[]>;
  /**
   * Make `id` the active wallet. The in-memory session is closed (keys are never
   * kept), so the UI must drive an unlock for the target afterward.
   */
  switchWallet(id: string): Promise<void>;
  /** Rename a wallet (label only). */
  renameWallet(id: string, label: string): Promise<void>;
  /** Delete a wallet by id (erases its keyspace + drops it from the registry). */
  deleteWallet(id: string): Promise<void>;
}
