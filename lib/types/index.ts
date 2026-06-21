export type CcxAmount = {
  atomic: number;
};

export type UsdAmount = {
  value: number;
};

export type WalletInfo = {
  address: string;
  /** True when the wallet holds no private spend key (watch-only import). Send,
   *  Deposits create/withdraw, and Message send are unavailable. */
  viewOnly: boolean;
  balanceTotal: CcxAmount;
  available: CcxAmount;
  dust: CcxAmount;
  pending: CcxAmount;
  /** Unconfirmed funds addressed to us still in the mempool (#109). Display-only — NOT
   *  in `balanceTotal`/`available` (not yet spendable); shown as a separate "pending in"
   *  bucket. Absent/0 when none or the daemon has no pool RPC. */
  incomingPending?: CcxAmount;
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

/** One wallet in the multi-wallet switcher / management list (#95). */
export type WalletSummary = {
  id: string;
  label: string;
  /** ccx7… address, cached after the first successful open. */
  address?: string;
  /** True for the currently-active wallet. */
  isActive: boolean;
  /**
   * Total balance, when known. The active wallet's balance always comes from
   * `getWalletInfo` (live); this is for OTHER wallets in the switcher list. Mock
   * mode fills it for every wallet; real mode leaves it undefined for non-active
   * wallets (they're locked/encrypted and not loaded).
   */
  balanceTotal?: CcxAmount;
};

/**
 * Live status of an UNLOCKED non-active wallet after a background sync (#108). Used to
 * detect funds/messages arriving on a wallet the user isn't currently viewing, so a
 * cross-wallet notification can fire. Real mode reports one entry per unlocked non-active
 * wallet; mock mode returns none (no real background sync).
 */
export type SecondaryWalletStatus = {
  id: string;
  label: string;
  /** Mined balance — an INCREASE since the last observation means funds arrived. */
  balanceTotal: CcxAmount;
  /** Count of reconstructed received-message records — an INCREASE means a new message. */
  receivedCount: number;
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

/** Stored address-book row (v1/v3 wallet backup shape). Relocated from lib/wallet-core/Wallet (#91 decoupling). */
export type RawAddressEntry = {
  id: string;
  label: string;
  address: string;
  paymentId?: string;
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
