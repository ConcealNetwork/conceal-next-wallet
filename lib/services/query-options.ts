import { env } from "@/lib/env"
import { MARKET_SNAPSHOT_TTL_MS } from "@/lib/market/coingecko"

const NETWORK_POLL_MS = 15_000
const MARKET_CHART_STALE_MS = 30 * 60 * 1000

export const marketQueryOptions = {
  staleTime: env.useMockWallet ? 0 : MARKET_SNAPSHOT_TTL_MS,
  refetchInterval: env.useMockWallet ? (false as const) : MARKET_SNAPSHOT_TTL_MS,
}

export const marketHistoryQueryOptions = {
  staleTime: env.useMockWallet ? 0 : MARKET_CHART_STALE_MS,
}

export const networkQueryOptions = {
  refetchInterval: env.useMockWallet ? (false as const) : NETWORK_POLL_MS,
}
