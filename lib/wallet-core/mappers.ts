import type { Transaction as UiTransaction, WalletInfo } from "@/lib/types"
import type { Transaction as CoreTransaction } from "./Transaction"
import type { Wallet } from "./Wallet"

export function clampImportHeight(scanHeight: number | undefined, currentHeight: number): number {
  let height = scanHeight ?? 0
  if (Number.isNaN(height) || height < 0) height = 0
  if (height >= currentHeight) height = currentHeight - 1
  height -= 10
  if (height < 0) height = 0
  if (height > currentHeight) height = currentHeight
  return height
}

export function mapWalletToInfo(wallet: Wallet, networkHeight: number): WalletInfo {
  const walletHeight = Math.max(0, Number(wallet.lastHeight))
  const available = wallet.availableAmount(networkHeight)
  const locked = wallet.lockedDeposits(networkHeight)
  const withdrawable = wallet.unlockedDeposits(networkHeight)
  const pending = Math.max(0, wallet.availableAmount(-1) - available)

  return {
    address: wallet.getPublicAddress(),
    balanceTotal: { atomic: available + locked },
    available: { atomic: available },
    pending: { atomic: pending },
    lockedDeposits: { atomic: locked },
    staking: { atomic: 0 },
    withdrawable: { atomic: withdrawable },
    creationHeight: wallet.creationHeight,
    currentHeight: walletHeight,
    networkHeight,
  }
}

export function mapCoreTransaction(tx: CoreTransaction, blockchainHeight: number, walletAddress: string): UiTransaction {
  const amount = tx.getAmount()
  const isSend = amount < 0
  const confirmations =
    tx.blockHeight === 0
      ? 0
      : Math.max(0, blockchainHeight - tx.blockHeight)

  return {
    id: tx.hash || `${tx.timestamp}-${Math.abs(amount)}`,
    hash: tx.hash,
    type: isSend ? "send" : "receive",
    amount: { atomic: Math.abs(amount) },
    address: isSend ? "" : walletAddress,
    timestamp: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : new Date().toISOString(),
    confirmations,
    paymentId: tx.paymentId || undefined,
    message: tx.message || undefined,
  }
}

export function listWalletTransactions(wallet: Wallet, blockchainHeight: number): UiTransaction[] {
  const address = wallet.getPublicAddress()
  return wallet.txsMem
    .concat(wallet.getTransactionsCopy().reverse())
    .map((tx) => mapCoreTransaction(tx, blockchainHeight, address))
}
