export type CcxAmount = {
  atomic: number;
};

export type UsdAmount = {
  value: number;
};

export type WalletInfo = {
  address: string;
  balanceTotal: CcxAmount;
  available: CcxAmount;
  pending: CcxAmount;
  lockedDeposits: CcxAmount;
  staking: CcxAmount;
  withdrawable: CcxAmount;
  trends?: Partial<
    Record<
      "balanceTotal" | "available" | "pending" | "lockedDeposits" | "staking" | "withdrawable",
      WalletStatTrend
    >
  >;
  creationHeight: number;
  /** Wallet scan height (blocks applied to this wallet). */
  currentHeight: number;
  /** Chain tip from the connected daemon. */
  networkHeight: number;
};

export type WalletStatTrend = {
  trend: number[];
  changePct: number;
};

export type TransactionType =
  | "receive"
  | "send"
  | "deposit"
  | "withdrawal"
  | "fusion"
  | "miner"
  | "message";

export type Transaction = {
  id: string;
  hash: string;
  type: TransactionType;
  amount: CcxAmount;
  address: string;
  timestamp: string;
  confirmations: number;
  paymentId?: string;
  message?: string;
  /** Standalone message txs only — true when this wallet sent the 0.0001 CCX envelope. */
  outgoing?: boolean;
};

export type DepositStatus = "active" | "unlocked" | "spent";

export type Deposit = {
  id: string;
  txHash: string;
  globalOutputIndex: number;
  amount: CcxAmount;
  status: DepositStatus;
  durationMonths: number;
  apr: number;
  interest: CcxAmount;
  unlocksInDays: number;
  progressPct: number;
  address: string;
  withdrawPending?: boolean;
};

export type Message = {
  id: string;
  direction: "received" | "sent";
  counterpartyName: string;
  counterpartyAddress: string;
  body: string;
  timestamp: string;
  unread: boolean;
  /** Mempool TTL expiry (unix seconds); set when blockHeight === 0 and tx.ttl > 0. */
  ttlExpiresAt?: number;
};

export type MarketData = {
  price: UsdAmount;
  change24hPct: number;
  high24h: UsdAmount;
  low24h: UsdAmount;
  volume24h: UsdAmount;
  marketCap: UsdAmount;
  circulatingSupply: CcxAmount;
  ath?: UsdAmount;
  history: { date: string; price: number }[];
  historyByTimeframe: Record<MarketTimeframe, MarketHistoryPoint[]>;
  portfolioValueUsd: UsdAmount;
  /** Live feed source when using real market service. */
  priceSource?: "coingecko" | "coinpaprika";
};

export type MarketTimeframe = "24H" | "7D" | "30D" | "90D";

export type MarketHistoryPoint = {
  date: string;
  price: number;
};

export type AddressEntry = {
  id: string;
  label: string;
  address: string;
  paymentId?: string;
  /** Optional contact photo as a data URL (mock — set client-side). */
  avatar?: string;
};

export type NodeStatus = {
  url: string;
  height: number;
  networkHeight: number;
  peers: number;
  peersOut: number;
  peersIn: number;
  isCustom: boolean;
  version: string;
  // TODO(backend): the fields below map to Conceal daemon `getinfo`
  difficulty: number;
  hashrate: number; // hashes per second
  mempool: number; // pending tx count (tx_pool_size)
  lastBlockSecondsAgo: number;
  avgBlockTimeSeconds: number;
  latencyMs: number;
  uptimeSeconds: number;
  // Short recent-history series used by the telemetry sparklines (oldest → newest)
  heightHistory: number[];
  hashrateHistory: number[];
  peersHistory: number[];
  blockTimeHistory: number[];
};

import type { SyncSpeed } from "@/lib/ui/sync-speed";

export type { SyncSpeed };

export type WalletSettings = {
  language: string;
  useCustomNode: boolean;
  nodeUrl: string;
  /** Parallel sync intensity (maps to wallet-core options.readSpeed). */
  syncSpeed: SyncSpeed;
  /** When true, sync includes coinbase (miner) outputs — required for solo mining rewards. */
  readMinorTx: boolean;
  autoLock: boolean;
  biometric: boolean;
  creationHeight?: number;
  scanHeight?: number;
};
