/**
 * Network constants + default daemon nodes for the SDK engine. (Originally copied
 * from conceal-web-wallet/src/config.ts.)
 */

import { walletNetworkScalars as walletNetworkScalarsSource } from "./wallet-network-scalars.mjs";

/** Plain-number fields (no JSBigInt) — safe for UI imports and tests. */
export const walletNetworkScalars = walletNetworkScalarsSource;

export const COIN_UNIT_PLACES = walletNetworkScalars.coinUnitPlaces;
/** Confirmations at which a transaction is shown as "Confirmed" (UI + CSV export). */
export const TX_CONFIRMED_THRESHOLD = 10;
export const COIN_FEE_ATOMIC = walletNetworkScalars.coinFeeAtomic;
export const REMOTE_NODE_FEE_ATOMIC = walletNetworkScalars.remoteNodeFeeAtomic;
export const DEPOSIT_SMALL_WITHDRAW_FEE_ATOMIC = walletNetworkScalars.depositSmallWithdrawFee;
export const DEPOSIT_MIN_TERM_MONTH = walletNetworkScalars.depositMinTermMonth;
export const DEPOSIT_MAX_TERM_MONTH = walletNetworkScalars.depositMaxTermMonth;
export const DEPOSIT_MIN_TERM_BLOCK = walletNetworkScalars.depositMinTermBlock;
/** Base APR per deposit tier (V3 model): [<10k, 10k–20k, ≥20k CCX]. */
export const DEPOSIT_RATE_V3: readonly [number, number, number] = [0.029, 0.039, 0.049];
export const AVG_BLOCK_TIME_SECONDS = walletNetworkScalars.avgBlockTime;
export const MAX_MESSAGE_SIZE = walletNetworkScalars.maxMessageSize;
export const MAX_TTL_MINUTES = walletNetworkScalars.cryptonoteMemPoolTxLifetimeSeconds / 60;
export const MESSAGE_TX_AMOUNT_ATOMIC = walletNetworkScalars.messageTxAmountAtomic;
/** Sent message tx amount (remote node fee returned to wallet). */
export const SENT_MESSAGE_AMOUNT_SELF_ATOMIC = MESSAGE_TX_AMOUNT_ATOMIC + REMOTE_NODE_FEE_ATOMIC;
/** Sent message tx amount (remote node operator fee paid). */
export const SENT_MESSAGE_AMOUNT_REMOTE_ATOMIC = SENT_MESSAGE_AMOUNT_SELF_ATOMIC + COIN_FEE_ATOMIC;

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

export const WALLET_DONATION_ADDRESSES = [
  "ccx7NzuofXxcypov8Yqm2A118xT17HereBFjp3RScjzM7wncf8BRcnHZbACy63sWD71L7NmkJRgQKXFE3weCfAh31RAVFHgttf",
  WALLET_DONATION_ADDRESS,
  "ccx7YZ4RC97fqMh1bmzrFtDoSSiEgvEYzhaLE53SR9bh4QrDBUhGUH3TCmXqv8MTLjJDtnCeeaT5bLC2ZSzp3ZmQ19DoiPLLXS",
] as const;

/** Default (public) daemon nodes — the trusted reference set for the node-lag check. */
export const DEFAULT_DAEMON_NODES = [
  "https://explorer.conceal.network/daemon/",
  "https://ccxapi.conceal.network/daemon/",
] as const;
