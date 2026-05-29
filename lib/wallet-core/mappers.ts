import { createWalletNetworkConfig, type WalletNetworkConfig } from "@/lib/config/network"
import type { Deposit as UiDeposit, Transaction as UiTransaction, TransactionType, WalletInfo } from "@/lib/types"
import type { Deposit as CoreDeposit, Transaction as CoreTransaction } from "./Transaction"
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

/** Classify a synced core transaction for the UI (matches Transaction.ts getters). */
export function resolveTransactionType(tx: CoreTransaction): TransactionType {
  if (tx.isDeposit) return "deposit"
  if (tx.isWithdrawal) return "withdrawal"
  if (tx.isFusion) return "fusion"
  if (tx.isCoinbase()) return "miner"
  return tx.getAmount() < 0 ? "send" : "receive"
}

/** Atomic amount shown in lists; fusion may net to zero — fall back to fee. */
export function resolveTransactionDisplayAmount(tx: CoreTransaction, type: TransactionType): number {
  const net = tx.getAmount()
  const absolute = Math.abs(net)
  if (type === "fusion" && absolute === 0) {
    return Math.abs(tx.fees ?? 0)
  }
  return absolute
}

export function mapCoreTransaction(tx: CoreTransaction, blockchainHeight: number, walletAddress: string): UiTransaction {
  const type = resolveTransactionType(tx)
  const displayAtomic = resolveTransactionDisplayAmount(tx, type)
  const confirmations =
    tx.blockHeight === 0 ? 0 : Math.max(0, blockchainHeight - tx.blockHeight)

  const address =
    type === "send" ? "" : walletAddress

  return {
    id: tx.hash || `${tx.timestamp}-${displayAtomic}-${type}`,
    hash: tx.hash,
    type,
    amount: { atomic: displayAtomic },
    address,
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

/** Indicative APR from principal, accrued interest, and term (for UI labels). */
export function deriveIndicativeDepositApr(
  amountAtomic: number,
  interestAtomic: number,
  termBlocks: number,
  network: WalletNetworkConfig = createWalletNetworkConfig(),
): number {
  const months = termBlocks / network.depositMinTermBlock
  if (months <= 0 || amountAtomic <= 0) return 0
  const divider = Math.pow(10, network.coinUnitPlaces)
  const principal = amountAtomic / divider
  const interest = interestAtomic / divider
  return (interest / principal / (months / 12)) * 100
}

export function mapCoreDeposit(
  deposit: CoreDeposit,
  blockchainHeight: number,
  walletAddress: string,
  network: WalletNetworkConfig = createWalletNetworkConfig(),
): UiDeposit {
  const coreStatus = deposit.getStatus(blockchainHeight)
  const status =
    coreStatus === "Locked" ? "active" : coreStatus === "Unlocked" ? "unlocked" : "spent"
  const blocksRemaining = Math.max(0, deposit.unlockHeight - blockchainHeight)
  const unlocksInDays = Math.ceil((blocksRemaining * network.avgBlockTime) / 86400)
  const elapsedBlocks = Math.max(0, blockchainHeight - deposit.blockHeight)
  const progressPct =
    deposit.term > 0 ? Math.min(100, Math.round((elapsedBlocks / deposit.term) * 100)) : 100
  const durationMonths = Math.max(
    1,
    Math.round(deposit.term / network.depositMinTermBlock),
  )

  return {
    id: `${deposit.txHash}:${deposit.globalOutputIndex}`,
    txHash: deposit.txHash,
    globalOutputIndex: deposit.globalOutputIndex,
    amount: { atomic: deposit.amount },
    interest: { atomic: deposit.interest },
    status,
    durationMonths,
    apr: deriveIndicativeDepositApr(deposit.amount, deposit.interest, deposit.term, network),
    unlocksInDays: status === "spent" ? 0 : unlocksInDays,
    progressPct: status === "spent" ? 100 : progressPct,
    address: walletAddress,
    withdrawPending: deposit.withdrawPending || undefined,
  }
}

export function listWalletDeposits(wallet: Wallet, blockchainHeight: number): UiDeposit[] {
  const address = wallet.getPublicAddress()
  return wallet
    .getDepositsCopy()
    .reverse()
    .map((deposit) => mapCoreDeposit(deposit, blockchainHeight, address))
}

export function getWalletDepositConstraints(
  wallet: Wallet,
  networkHeight: number,
  network: WalletNetworkConfig = createWalletNetworkConfig(),
) {
  const walletHeight = Math.max(0, Number(wallet.lastHeight))
  const currencyDivider = Math.pow(10, network.coinUnitPlaces)
  const coinFee = Number(network.coinFee)
  const unlocked = wallet.availableAmount(networkHeight)
  const maxDepositAmount = Math.floor((unlocked - coinFee) / currencyDivider)
  const isWalletSyncing = walletHeight + 2 < networkHeight

  return {
    maxDepositAmount,
    isDepositDisabled: isWalletSyncing || maxDepositAmount < network.depositMinAmountCoin,
    isWalletSyncing,
    hasPendingDeposit: wallet.hasPendingDeposit,
  }
}
