import type {
  AddressEntry,
  Deposit,
  MarketData,
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

export const mockMarketData: MarketData = {
  price: usdAmount(0.045),
  change24hPct: 2.34,
  volume24h: usdAmount(125000),
  portfolioValueUsd: usdAmount(56.2725),
  history: [
    ["Apr 22", 0.037],
    ["Apr 26", 0.039],
    ["Apr 30", 0.038],
    ["May 04", 0.041],
    ["May 08", 0.044],
    ["May 12", 0.043],
    ["May 16", 0.046],
    ["May 20", 0.044],
    ["May 22", 0.045],
  ].map(([date, price]) => ({ date: String(date), price: Number(price) })),
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
