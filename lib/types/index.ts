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
  withdrawable: CcxAmount;
  trends?: Partial<
    Record<
      "balanceTotal" | "available" | "pending" | "lockedDeposits" | "withdrawable",
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
  /** Block height at inclusion; 0 while pending in the mempool. */
  blockHeight: number;
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
  /** False when sent envelope is known but local body was not saved (e.g. after rescan). */
  hasBody: boolean;
  /** Recipient CCX address for sent messages. */
  sentTo?: string | null;
  timestamp: string;
  unread: boolean;
  /** PID on incoming messages; always null on sent. */
  paymentIdFrom: string | null;
  /** PID embedded in outgoing tx; always null on received. Topic threads later. */
  paymentIdTo: string | null;
  blockHeight: number;
  threadKey: string;
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
  /** Built-in avatar slug (e.g. "kraken") — maps to `/brand/contacts/{slug}.png`. */
  avatar?: string;
};

export type SmartNode = {
  id: string;
  name: string;
  url: string;
  /** Raw `url.host` from pool list (e.g. explorer.conceal.network/daemon). */
  poolHost: string;
  isActive?: boolean;
  /** Pool registry `status.startTime` (ISO). */
  poolStartTime?: string;
  /** Pool registry `status.uptime` (0–100). */
  poolUptimePercent?: number;
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
  // Populated from the Conceal daemon `getinfo` response (see getNodeStatusOperation).
  difficulty: number;
  hashrate: number; // hashes per second
  mempool: number; // pending tx count (tx_pool_size)
  lastBlockSecondsAgo: number;
  avgBlockTimeSeconds: number;
  // Short recent-history series used by the telemetry sparklines (oldest → newest)
  heightHistory: number[];
  hashrateHistory: number[];
  peersHistory: number[];
  blockTimeHistory: number[];
};

import type { SyncSpeed } from "@/lib/ui/sync-speed";

export type { SyncSpeed };

export type WalletSettings = {
  useCustomNode: boolean;
  nodeUrl: string;
  /** Parallel sync intensity (maps to wallet-core options.readSpeed). */
  syncSpeed: SyncSpeed;
  /** When true, sync includes coinbase (miner) outputs — required for solo mining rewards. */
  readMinorTx: boolean;
  /** Idle minutes before the wallet auto-locks; 0 disables auto-lock. */
  autoLockMinutes: number;
  creationHeight?: number;
  scanHeight?: number;
};

export type OptimizationStatus = {
  isNeeded: boolean;
  unspentOutputs: number;
};

export type OptimizeWalletResult = {
  ok: true;
  optimized: boolean;
};
