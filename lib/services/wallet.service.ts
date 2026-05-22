import type { WalletInfo } from "@/lib/types"

export type CreateWalletInput = {
  name: string
  password: string
}

export type ImportWalletInput = {
  method: "mnemonic" | "keys" | "file" | "qr" | "open"
  label?: string
}

export type ExportWalletData = {
  mnemonic: string
  spendKey: string
  viewKey: string
}

export interface WalletService {
  getWalletInfo(): Promise<WalletInfo>
  refreshWallet(): Promise<WalletInfo>
  openWallet(label?: string): Promise<WalletInfo>
  createWallet(input: CreateWalletInput): Promise<{ wallet: WalletInfo; mnemonic: string }>
  importWallet(input: ImportWalletInput): Promise<WalletInfo>
  exportWallet(): Promise<ExportWalletData>
  changePassword(input: { currentPassword: string; newPassword: string }): Promise<{ ok: true }>
}
