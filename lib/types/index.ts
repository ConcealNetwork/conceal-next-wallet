export type CcxAmount = {
  atomic: number
}

export type UsdAmount = {
  value: number
}

export type WalletInfo = {
  address: string
  balanceTotal: CcxAmount
  available: CcxAmount
  pending: CcxAmount
  lockedDeposits: CcxAmount
  staking: CcxAmount
  withdrawable: CcxAmount
  trends?: Partial<Record<"balanceTotal" | "available" | "pending" | "lockedDeposits" | "staking" | "withdrawable", WalletStatTrend>>
  creationHeight: number
  currentHeight: number
}

export type WalletStatTrend = {
  trend: number[]
  changePct: number
}

export type TransactionType = "receive" | "send" | "deposit" | "withdrawal"

export type Transaction = {
  id: string
  type: TransactionType
  amount: CcxAmount
  address: string
  timestamp: string
  confirmations: number
  paymentId?: string
  message?: string
}

export type Deposit = {
  id: string
  amount: CcxAmount
  status: "active" | "unlocked"
  durationMonths: number
  apr: number
  interest: CcxAmount
  unlocksInDays: number
  progressPct: number
  address: string
}

export type Message = {
  id: string
  direction: "received" | "sent"
  counterpartyName: string
  counterpartyAddress: string
  body: string
  timestamp: string
  unread: boolean
}

export type MarketData = {
  price: UsdAmount
  change24hPct: number
  high24h: UsdAmount
  low24h: UsdAmount
  volume24h: UsdAmount
  marketCap: UsdAmount
  circulatingSupply: CcxAmount
  ath?: UsdAmount
  history: { date: string; price: number }[]
  historyByTimeframe: Record<MarketTimeframe, MarketHistoryPoint[]>
  portfolioValueUsd: UsdAmount
}

export type MarketTimeframe = "24H" | "7D" | "30D" | "90D"

export type MarketHistoryPoint = {
  date: string
  price: number
}

export type AddressEntry = {
  id: string
  label: string
  address: string
  paymentId?: string
}

export type NodeStatus = {
  url: string
  height: number
  peers: number
  isCustom: boolean
  version: string
}

export type WalletSettings = {
  language: string
  useCustomNode: boolean
  nodeUrl: string
  readMinorTx: boolean
  autoLock: boolean
  biometric: boolean
}
