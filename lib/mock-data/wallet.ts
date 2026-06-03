import type {
  AddressEntry,
  Deposit,
  MarketData,
  MarketHistoryPoint,
  MarketTimeframe,
  Message,
  NodeStatus,
  Transaction,
  WalletInfo,
  WalletSettings,
} from "@/lib/types";
import { ccxAmount, usdAmount } from "@/lib/utils";

export const MOCK_ADDRESS =
  "ccx7QbH7J9PpM5rK2sL8nV4xA1zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m";

export const mockWalletInfo: WalletInfo = {
  address: MOCK_ADDRESS,
  balanceTotal: ccxAmount(1250.5),
  available: ccxAmount(634.75),
  pending: ccxAmount(15.75),
  lockedDeposits: ccxAmount(500),
  staking: ccxAmount(100),
  withdrawable: ccxAmount(734.75),
  trends: {
    balanceTotal: {
      trend: [1192.25, 1208.1, 1201.6, 1226.35, 1238.9, 1234.4, 1250.5],
      changePct: 2.34,
    },
    available: {
      trend: [602.4, 611.2, 608.75, 620.5, 628.1, 626.9, 634.75],
      changePct: 1.78,
    },
    staking: {
      trend: [92, 94.5, 95.25, 97, 98.4, 99.1, 100],
      changePct: 3.12,
    },
  },
  creationHeight: 1971774,
  currentHeight: 1971337,
  networkHeight: 1971337,
};

export const mockTransactions: Transaction[] = [
  {
    id: "tx-001",
    // TODO(backend): replace mock hash with the walletd transaction hash.
    hash: "8c3f6fbb51e79ff33f90bb1a41635e27f9d67a2acaa55fc5b5a968c9d42f011a",
    type: "receive",
    amount: ccxAmount(100),
    address: "ccx7IncomingA1zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m",
    timestamp: "2026-05-22T01:20:00.000Z",
    confirmations: 12,
    message: "Invoice payment",
  },
  {
    id: "tx-002",
    // TODO(backend): replace mock hash with the walletd transaction hash.
    hash: "68d12f7225bb7c6e4ef91c6b8dc8b7fd1c71d3f33d72ebcfbd6bd20433aa9c92",
    type: "send",
    amount: ccxAmount(50),
    address: "ccx7OutgoingB2zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m",
    timestamp: "2026-05-21T18:10:00.000Z",
    confirmations: 24,
    paymentId: "a".repeat(64),
  },
  {
    id: "tx-003",
    // TODO(backend): replace mock hash with the walletd transaction hash.
    hash: "3d7bb0e693ad5d9de58a05cc97ea9b2c5b0d45c4ad8e8f5b6f98c9f04cb7df35",
    type: "deposit",
    amount: ccxAmount(200),
    address: MOCK_ADDRESS,
    timestamp: "2026-05-20T11:45:00.000Z",
    confirmations: 85,
  },
  {
    id: "tx-004",
    // TODO(backend): replace mock hash with the walletd transaction hash.
    hash: "fe9ce188607f23c38b413bc216f6f2f8db12a62e6bfe518123328297248b2a71",
    type: "receive",
    amount: ccxAmount(75),
    address: "ccx7IncomingC3zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m",
    timestamp: "2026-05-18T09:00:00.000Z",
    confirmations: 120,
  },
  {
    id: "tx-005",
    // TODO(backend): replace mock hash with the walletd transaction hash.
    hash: "f0a03fd6c4cb37e92dc4ed1ac04f6896d73cc69e09a50210a0c9568671eec24e",
    type: "send",
    amount: ccxAmount(25),
    address: "ccx7OutgoingD4zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m",
    timestamp: "2026-05-17T16:30:00.000Z",
    confirmations: 144,
  },
  {
    id: "tx-006",
    // TODO(backend): replace mock hash with the walletd transaction hash.
    hash: "72ee8158d6c6bd56fb290f195b77f20616d6074e433f55ef0b117b90420961e1",
    type: "withdrawal",
    amount: ccxAmount(150),
    address: MOCK_ADDRESS,
    timestamp: "2026-05-14T13:35:00.000Z",
    confirmations: 320,
  },
  {
    id: "tx-007",
    // TODO(backend): replace mock hash with the walletd transaction hash.
    hash: "276585050412d162479ef0c0c789b192e28baa3574d5e4fc3bca749d5e92de45",
    type: "deposit",
    amount: ccxAmount(500),
    address: MOCK_ADDRESS,
    timestamp: "2026-04-28T07:15:00.000Z",
    confirmations: 900,
  },
  {
    id: "tx-008",
    // TODO(backend): replace mock hash with the walletd transaction hash.
    hash: "d1dedc197df2bfe9d92da420a69798099a878529f581bd5f47fe1443de0b4f38",
    type: "send",
    amount: ccxAmount(100),
    address: "ccx7OutgoingE5zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m",
    timestamp: "2026-04-22T22:05:00.000Z",
    confirmations: 1280,
  },
];

export const mockDeposits: Deposit[] = [
  {
    id: "dep-001",
    txHash: "3d7bb0e693ad5d9de58a05cc97ea9b2c5b0d45c4ad8e8f5b6f98c9f04cb7df35",
    globalOutputIndex: 0,
    amount: ccxAmount(250),
    status: "active",
    durationMonths: 12,
    apr: 4.6,
    interest: ccxAmount(11.5),
    unlocksInDays: 87,
    progressPct: 63,
    address: MOCK_ADDRESS,
  },
  {
    id: "dep-002",
    txHash: "276585050412d162479ef0c0c789b192e28baa3574d5e4fc3bca749d5e92de45",
    globalOutputIndex: 1,
    amount: ccxAmount(500),
    status: "active",
    durationMonths: 12,
    apr: 4.6,
    interest: ccxAmount(54),
    unlocksInDays: 221,
    progressPct: 29,
    address: MOCK_ADDRESS,
  },
];

export const mockMessages: Message[] = [
  {
    id: "msg-001",
    direction: "received",
    counterpartyName: "Nora",
    counterpartyAddress:
      "ccx7NoraMessageAddressT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m",
    body: "Payment received. Thanks for the quick settlement.",
    timestamp: "2026-05-22T00:55:00.000Z",
    unread: true,
  },
  {
    id: "msg-002",
    direction: "received",
    counterpartyName: "Liam",
    counterpartyAddress:
      "ccx7LiamMessageAddressT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m",
    body: "Can you confirm the payment ID for the deposit?",
    timestamp: "2026-05-21T21:30:00.000Z",
    unread: true,
  },
  {
    id: "msg-003",
    direction: "sent",
    counterpartyName: "Maya",
    counterpartyAddress:
      "ccx7MayaMessageAddressT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m",
    body: "Sent the CCX transfer and attached a short memo.",
    timestamp: "2026-05-20T13:15:00.000Z",
    unread: false,
  },
];

const MARKET_PRICE_USD = 0.045;
const CIRCULATING_SUPPLY_CCX = 6_456_200;
const TIMEFRAME_POINT_COUNT: Record<MarketTimeframe, number> = {
  "24H": 25,
  "7D": 8,
  "30D": 31,
  "90D": 91,
};
const TIMEFRAME_DRIFT: Record<MarketTimeframe, number> = {
  "24H": 0.0012,
  "7D": 0.0035,
  "30D": 0.008,
  "90D": 0.013,
};
const TIMEFRAME_WAVE: Record<MarketTimeframe, number> = {
  "24H": 0.00055,
  "7D": 0.001,
  "30D": 0.0015,
  "90D": 0.0024,
};

function formatMockHistoryLabel(date: Date, range: MarketTimeframe) {
  if (range === "24H") {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "UTC",
    });
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  });
}

function generateMockPriceHistory(range: MarketTimeframe): MarketHistoryPoint[] {
  const pointCount = TIMEFRAME_POINT_COUNT[range];
  const anchor = new Date("2026-05-22T12:00:00.000Z");
  const stepMs = range === "24H" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const drift = TIMEFRAME_DRIFT[range];
  const wave = TIMEFRAME_WAVE[range];

  return Array.from({ length: pointCount }, (_, index) => {
    const progress = pointCount === 1 ? 1 : index / (pointCount - 1);
    const date = new Date(anchor.getTime() - (pointCount - 1 - index) * stepMs);
    const waveOffset =
      Math.sin(index * 1.21 + range.length) * wave + Math.cos(index * 0.47) * wave * 0.45;
    const price =
      index === pointCount - 1
        ? MARKET_PRICE_USD
        : MARKET_PRICE_USD - drift * (1 - progress) + waveOffset;

    return {
      date: formatMockHistoryLabel(date, range),
      price: Number(Math.max(price, 0.001).toFixed(6)),
    };
  });
}

export const mockMarketHistoryByTimeframe: Record<MarketTimeframe, MarketHistoryPoint[]> = {
  "24H": generateMockPriceHistory("24H"),
  "7D": generateMockPriceHistory("7D"),
  "30D": generateMockPriceHistory("30D"),
  "90D": generateMockPriceHistory("90D"),
};

export const mockMarketData: MarketData = {
  price: usdAmount(MARKET_PRICE_USD),
  change24hPct: 2.34,
  high24h: usdAmount(0.0462),
  low24h: usdAmount(0.0438),
  volume24h: usdAmount(125000),
  marketCap: usdAmount(MARKET_PRICE_USD * CIRCULATING_SUPPLY_CCX),
  circulatingSupply: ccxAmount(CIRCULATING_SUPPLY_CCX),
  ath: usdAmount(0.0875),
  portfolioValueUsd: usdAmount(56.2725),
  history: mockMarketHistoryByTimeframe["30D"],
  historyByTimeframe: mockMarketHistoryByTimeframe,
};

export const mockAddressBook: AddressEntry[] = [
  // TODO(backend): replace with real saved addresses from the wallet store
  {
    id: "addr-1",
    label: "Kraken Exchange",
    address: "ccx7Exch7J9PpM5rK2sL8nV4xA1zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF",
    paymentId: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7ef099",
    avatar: "/brand/contacts/kraken.png",
  },
  {
    id: "addr-2",
    label: "Alice",
    address: "ccx7AliceWalletAddr2eZ9waDXgsLS7Uc11e2CpNSCWVdxEqSRFAm6P6NQhSb7XMG1D6VAZKm",
    avatar: "/brand/contacts/alice.png",
  },
  {
    id: "addr-3",
    label: "Mining Pool",
    address: "ccx7PoolPayoutAddrK2sL8nV4xA1zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF",
    paymentId: "7f3a44bc99de10ab7654321089abcdef1122334455667788990011223344c11cd",
    avatar: "/brand/contacts/mining-pool.png",
  },
  {
    id: "addr-4",
    label: "Cold Storage",
    address: "ccx7ColdStoreAddrV2wX5yZ8aB1cD4eF7gH0jK3mNoPqRsTuVwXyZ1234567890aBcDeFgHiJ",
    avatar: "/brand/contacts/cold-storage.png",
  },
];

export const mockNodeStatus: NodeStatus = {
  url: "https://explorer.conceal.network/daemon/",
  height: 1971337,
  networkHeight: 1971337,
  peers: 18,
  peersOut: 12,
  peersIn: 6,
  isCustom: false,
  version: "Conceal Core 6.9.2",
  // TODO(backend): replace with real values from the Conceal daemon `getinfo`
  difficulty: 1284560233,
  hashrate: 10704668, // difficulty / 120s block target ≈ 10.70 MH/s
  mempool: 3,
  lastBlockSecondsAgo: 47,
  avgBlockTimeSeconds: 118,
  latencyMs: 42,
  uptimeSeconds: 15120, // 4h 12m
  heightHistory: [1971330, 1971331, 1971332, 1971333, 1971334, 1971335, 1971336, 1971337],
  hashrateHistory: [10.21, 10.38, 10.29, 10.62, 10.55, 10.71, 10.64, 10.7],
  peersHistory: [14, 15, 14, 16, 17, 16, 18, 18],
  blockTimeHistory: [124, 117, 121, 113, 119, 110, 122, 118],
};

export const mockSettings: WalletSettings = {
  language: "English",
  useCustomNode: false,
  nodeUrl: "https://explorer.conceal.network/daemon/",
  syncSpeed: "medium",
  readMinorTx: false,
  autoLock: true,
  biometric: false,
};

export const mockExportData = {
  mnemonic:
    "mock amber orbit velvet zero carbon river lunar basic sample wallet conceal never real crypto placeholder safe display only",
  spendKey: "mock-spend-key-placeholder-not-real-".padEnd(98, "x"),
  viewKey: "mock-view-key-placeholder-not-real-".padEnd(98, "y"),
};
