import { env } from "@/lib/env";
import { MARKET_SNAPSHOT_TTL_MS } from "@/lib/market/coingecko";

const NETWORK_POLL_MS = 15_000;
const MARKET_CHART_STALE_MS = 30 * 60 * 1000;

export const marketQueryOptions = {
  staleTime: env.useMockWallet ? 0 : MARKET_SNAPSHOT_TTL_MS,
  refetchInterval: env.useMockWallet ? (false as const) : MARKET_SNAPSHOT_TTL_MS,
};

export const marketHistoryQueryOptions = {
  staleTime: env.useMockWallet ? 0 : MARKET_CHART_STALE_MS,
};

export const networkQueryOptions = {
  refetchInterval: env.useMockWallet ? (false as const) : NETWORK_POLL_MS,
};

/** Message list — expensive (scans all txs); not refetched on every sync tick. */
export const messagesQueryOptions = {
  staleTime: 60_000,
  refetchOnWindowFocus: false,
};

/** Fusion readiness — walks unspent outputs; refresh after sync or optimize. */
export const optimizationStatusQueryOptions = {
  staleTime: 60_000,
  refetchOnWindowFocus: false,
};

/** Pool list — fetched once when the Network page mounts; not polled or invalidated on sync. */
export const smartNodesQueryOptions = {
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchInterval: false as const,
};
