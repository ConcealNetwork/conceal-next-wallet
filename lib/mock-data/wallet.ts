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
} from "@/lib/types"
import { ccxAmount, usdAmount } from "@/lib/utils"

export const MOCK_ADDRESS =
  "ccx7QbH7J9PpM5rK2sL8nV4xA1zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m"

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
}

export const mockTransactions: Transaction[] = [
  {
    id: "tx-001",
    type: "receive",
    amount: ccxAmount(100),
    address: "ccx7IncomingA1zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m",
    timestamp: "2026-05-22T01:20:00.000Z",
    confirmations: 12,
    message: "Invoice payment",
  },
  {
    id: "tx-002",
    type: "send",
    amount: ccxAmount(50),
    address: "ccx7OutgoingB2zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m",
    timestamp: "2026-05-21T18:10:00.000Z",
    confirmations: 24,
    paymentId: "a".repeat(64),
  },
  {
    id: "tx-003",
    type: "deposit",
    amount: ccxAmount(200),
    address: MOCK_ADDRESS,
    timestamp: "2026-05-20T11:45:00.000Z",
    confirmations: 85,
  },
  {
    id: "tx-004",
    type: "receive",
    amount: ccxAmount(75),
    address: "ccx7IncomingC3zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m",
    timestamp: "2026-05-18T09:00:00.000Z",
    confirmations: 120,
  },
  {
    id: "tx-005",
    type: "send",
    amount: ccxAmount(25),
    address: "ccx7OutgoingD4zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m",
    timestamp: "2026-05-17T16:30:00.000Z",
    confirmations: 144,
  },
  {
    id: "tx-006",
    type: "withdrawal",
    amount: ccxAmount(150),
    address: MOCK_ADDRESS,
    timestamp: "2026-05-14T13:35:00.000Z",
    confirmations: 320,
  },
  {
    id: "tx-007",
    type: "deposit",
    amount: ccxAmount(500),
    address: MOCK_ADDRESS,
    timestamp: "2026-04-28T07:15:00.000Z",
    confirmations: 900,
  },
  {
    id: "tx-008",
    type: "send",
    amount: ccxAmount(100),
    address: "ccx7OutgoingE5zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m",
    timestamp: "2026-04-22T22:05:00.000Z",
    confirmations: 1280,
  },
]

export const mockDeposits: Deposit[] = [
  {
    id: "dep-001",
    amount: ccxAmount(250),
    status: "active",
    durationMonths: 12,
    apr: 4.2,
    interest: ccxAmount(0.089),
    unlocksInDays: 87,
    progressPct: 63,
    address: MOCK_ADDRESS,
  },
  {
    id: "dep-002",
    amount: ccxAmount(500),
    status: "active",
    durationMonths: 24,
    apr: 5.4,
    interest: ccxAmount(0.089),
    unlocksInDays: 221,
    progressPct: 29,
    address: MOCK_ADDRESS,
  },
]

export const mockMessages: Message[] = [
  {
    id: "msg-001",
    direction: "received",
    counterpartyName: "Nora",
    counterpartyAddress: "ccx7NoraMessageAddressT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m",
    body: "Payment received. Thanks for the quick settlement.",
    timestamp: "2026-05-22T00:55:00.000Z",
    unread: true,
  },
  {
    id: "msg-002",
    direction: "received",
    counterpartyName: "Liam",
    counterpartyAddress: "ccx7LiamMessageAddressT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m",
    body: "Can you confirm the payment ID for the deposit?",
    timestamp: "2026-05-21T21:30:00.000Z",
    unread: true,
  },
  {
    id: "msg-003",
    direction: "sent",
    counterpartyName: "Maya",
    counterpartyAddress: "ccx7MayaMessageAddressT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m",
    body: "Sent the CCX transfer and attached a short memo.",
    timestamp: "2026-05-20T13:15:00.000Z",
    unread: false,
  },
]

const MARKET_PRICE_USD = 0.045
const CIRCULATING_SUPPLY_CCX = 6_456_200
const TIMEFRAME_POINT_COUNT: Record<MarketTimeframe, number> = {
  "24H": 25,
  "7D": 8,
  "30D": 31,
  "90D": 91,
}
const TIMEFRAME_DRIFT: Record<MarketTimeframe, number> = {
  "24H": 0.0012,
  "7D": 0.0035,
  "30D": 0.008,
  "90D": 0.013,
}
const TIMEFRAME_WAVE: Record<MarketTimeframe, number> = {
  "24H": 0.00055,
  "7D": 0.001,
  "30D": 0.0015,
  "90D": 0.0024,
}

function formatMockHistoryLabel(date: Date, range: MarketTimeframe) {
  if (range === "24H") {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "UTC",
    })
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  })
}

function generateMockPriceHistory(range: MarketTimeframe): MarketHistoryPoint[] {
  const pointCount = TIMEFRAME_POINT_COUNT[range]
  const anchor = new Date("2026-05-22T12:00:00.000Z")
  const stepMs = range === "24H" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  const drift = TIMEFRAME_DRIFT[range]
  const wave = TIMEFRAME_WAVE[range]

  return Array.from({ length: pointCount }, (_, index) => {
    const progress = pointCount === 1 ? 1 : index / (pointCount - 1)
    const date = new Date(anchor.getTime() - (pointCount - 1 - index) * stepMs)
    const waveOffset = Math.sin(index * 1.21 + range.length) * wave + Math.cos(index * 0.47) * wave * 0.45
    const price = index === pointCount - 1 ? MARKET_PRICE_USD : MARKET_PRICE_USD - drift * (1 - progress) + waveOffset

    return {
      date: formatMockHistoryLabel(date, range),
      price: Number(Math.max(price, 0.001).toFixed(6)),
    }
  })
}

export const mockMarketHistoryByTimeframe: Record<MarketTimeframe, MarketHistoryPoint[]> = {
  "24H": generateMockPriceHistory("24H"),
  "7D": generateMockPriceHistory("7D"),
  "30D": generateMockPriceHistory("30D"),
  "90D": generateMockPriceHistory("90D"),
}

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
}

export const mockAddressBook: AddressEntry[] = []

export const mockNodeStatus: NodeStatus = {
  url: "https://node.conceal.network:16000/",
  height: 1971337,
  peers: 18,
  isCustom: false,
  version: "Conceal Core 6.9.2",
}

export const mockSettings: WalletSettings = {
  language: "English",
  useCustomNode: false,
  nodeUrl: "https://node.conceal.network:16000/",
  readMinorTx: false,
  autoLock: true,
  biometric: false,
}

export const mockExportData = {
  mnemonic:
    "mock amber orbit velvet zero carbon river lunar basic sample wallet conceal never real crypto placeholder safe display only",
  spendKey: "mock-spend-key-placeholder-not-real-".padEnd(98, "x"),
  viewKey: "mock-view-key-placeholder-not-real-".padEnd(98, "y"),
}
