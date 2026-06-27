/**
 * App-specific config (not chain consensus). Chain / fusion / message / tx scalars
 * live in `conceal-wallet-sdk` (`src/constants/index.ts`); import from the SDK.
 */

/** Confirmations at which a transaction is shown as "Confirmed" (UI + CSV export). */
export const TX_CONFIRMED_THRESHOLD = 10;

/** Full ticker label (settings + amount formatting). */
export const COIN_TICKER_FULL = "CCX";
/** Short Conceal symbol shown when compact ticker is enabled. */
export const COIN_TICKER_SHORT = "₡";

/** conceal: tx-URI prefix — decode/back-compat only; encodeTx emits bare ccx7. */
export const COIN_URI_PREFIX = "conceal:";

/** Explorer pool registry base (smart-node discovery). */
export const PUBLIC_NODES_POOL_BASE = "https://explorer.conceal.network/pool";

/** Curated nodes only: SSL + fee address + reachable (same filter for nodeList + Network UI). */
export const CURATED_POOL_LIST_QUERY = "hasFeeAddr=true&isReachable=true&hasSSL=true";

export function getCuratedPoolListUrl(poolBase: string = PUBLIC_NODES_POOL_BASE): string {
  return `${poolBase.replace(/\/$/, "")}/list?${CURATED_POOL_LIST_QUERY}`;
}

export const WALLET_DONATION_ADDRESS =
  "ccx7V4LeUXy2eZ9waDXgsLS7Uc11e2CpNSCWVdxEqSRFAm6P6NQhSb7XMG1D6VAZKmJeaJP37WYQg84zbNrPduTX2whZ5pacfj";

/** Default (public) daemon nodes — the trusted reference set for the node-lag check. */
export const DEFAULT_DAEMON_NODES = [
  "https://explorer.conceal.network/daemon/",
  "https://ccxapi.conceal.network/daemon/",
] as const;
