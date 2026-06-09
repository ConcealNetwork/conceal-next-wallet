/**
 * Copied from conceal-web-wallet/src/config.ts — keep in sync when v1 changes.
 * Applied to `window.config` via `applyWalletNetworkConfig()` after legacy globals load.
 */

import { walletNetworkScalars as walletNetworkScalarsSource } from "./wallet-network-scalars.mjs";

/** Plain-number fields (no JSBigInt) — safe for UI imports and tests. */
export const walletNetworkScalars = walletNetworkScalarsSource;

export const COIN_UNIT_PLACES = walletNetworkScalars.coinUnitPlaces;
export const COIN_FEE_ATOMIC = walletNetworkScalars.coinFeeAtomic;
export const REMOTE_NODE_FEE_ATOMIC = walletNetworkScalars.remoteNodeFeeAtomic;
export const DEPOSIT_SMALL_WITHDRAW_FEE_ATOMIC = walletNetworkScalars.depositSmallWithdrawFee;
export const DEPOSIT_MIN_TERM_MONTH = walletNetworkScalars.depositMinTermMonth;
export const DEPOSIT_MAX_TERM_MONTH = walletNetworkScalars.depositMaxTermMonth;
export const DEPOSIT_MIN_TERM_BLOCK = walletNetworkScalars.depositMinTermBlock;
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

/** Payment QR / URI prefix (empty string to match Conceal Desktop Wallet, should evolve to "conceal:"). */
export const COIN_URI_PREFIX = "";

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

type WalletConfigBigInt = {
  new (value: string): { valueOf(): number };
};

export function createWalletConfig(JSBigInt: WalletConfigBigInt) {
  const s = walletNetworkScalars;
  return {
    debug: false,
    apiUrl: ["https://ccxapi.conceal.network/api/"],
    nodeList: [
      "https://explorer.conceal.network/daemon/",
      "https://ccxapi.conceal.network/daemon/",
    ],
    publicNodes: PUBLIC_NODES_POOL_BASE,
    curatedPoolListQuery: CURATED_POOL_LIST_QUERY,
    mainnetExplorerUrl: "https://explorer.conceal.network/",
    mainnetExplorerUrlHash:
      "https://explorer.conceal.network/index.html?hash={ID}#blockchain_transaction",
    mainnetExplorerUrlBlock:
      "https://explorer.conceal.network/index.html?hash={ID}#blockchain_block",

    testnetExplorerUrl: "https://explorer.testnet.conceal.network/",
    testnetExplorerUrlHash:
      "https://explorer.testnet.conceal.network/index.html?hash={ID}#blockchain_transaction",
    testnetExplorerUrlBlock:
      "https://explorer.testnet.conceal.network/index.html?hash={ID}#blockchain_block",
    testnet: false,

    coinUnitPlaces: s.coinUnitPlaces,
    coinDisplayUnitPlaces: s.coinUnitPlaces,
    txMinConfirms: 10,
    txCoinbaseMinConfirms: 10,

    addressPrefix: 0x7ad4,
    integratedAddressPrefix: 0x7ad5,
    subAddressPrefix: 0x7ad6,
    addressPrefixTestnet: 0x7ad4,
    integratedAddressPrefixTestnet: 0x7ad5,
    subAddressPrefixTestnet: 0x7ad6,

    UPGRADE_HEIGHT_V4: 45000,
    coinFee: new JSBigInt(String(s.coinFeeAtomic)),
    minimumFee_V2: new JSBigInt(String(s.minimumFeeV2Atomic)),
    remoteNodeFee: new JSBigInt(String(s.remoteNodeFeeAtomic)),
    feePerKB: new JSBigInt(String(s.feePerKBAtomic)),
    dustThreshold: new JSBigInt(String(s.dustThresholdAtomic)),
    defaultMixin: 5,
    optimizeOutputs: 100,
    optimizeThreshold: 900000000,
    messageTxAmount: new JSBigInt(String(s.messageTxAmountAtomic)),
    maxMessageSize: s.maxMessageSize,
    cryptonoteMemPoolTxLifetime: s.cryptonoteMemPoolTxLifetimeSeconds,
    fusionTxMinInOutCountRatio: 4,
    maxFusionOutputs: 8,

    idleTimeout: 30,
    idleWarningDuration: 20,
    syncBlockCount: 300,
    syncScreenMinTxPerShard: 800,
    maxBlockQueue: 10,
    maxTxQueueHigh: 2000,
    maxTxQueueLow: 500,
    maxTxQueuePackets: 100,
    maxRemoteNodes: 8,
    maxPrefetchParallel: 4,
    maxWorkerCores: 8,

    coinSymbol: "CCX",
    coinSymbolShort: "₡",
    openAliasPrefix: "ccx",
    coinName: "Conceal",
    coinUriPrefix: COIN_URI_PREFIX,

    donationAddress: WALLET_DONATION_ADDRESS,
    donationAddresses: [...WALLET_DONATION_ADDRESSES],

    avgBlockTime: s.avgBlockTime,
    maxBlockNumber: 500_000_000,

    depositMinAmountCoin: s.depositMinAmountCoin,
    depositMinTermMonth: s.depositMinTermMonth,
    depositMinTermBlock: s.depositMinTermBlock,
    depositMaxTermMonth: s.depositMaxTermMonth,
    depositSmallWithdrawFee: s.depositSmallWithdrawFee,
    depositRateV3: [0.029, 0.039, 0.049],

    PRETTY_AMOUNTS: [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 600,
      700, 800, 900, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 20000, 30000,
      40000, 50000, 60000, 70000, 80000, 90000, 100000, 200000, 300000, 400000, 500000, 600000,
      700000, 800000, 900000, 1000000, 2000000, 3000000, 4000000, 5000000, 6000000, 7000000,
      8000000, 9000000, 10000000, 20000000, 30000000, 40000000, 50000000, 60000000, 70000000,
      80000000, 90000000, 100000000, 200000000, 300000000, 400000000, 500000000, 600000000,
      700000000, 800000000, 900000000, 1000000000, 2000000000, 3000000000, 4000000000, 5000000000,
      6000000000, 7000000000, 8000000000, 9000000000, 10000000000, 20000000000, 30000000000,
      40000000000, 50000000000, 60000000000, 70000000000, 80000000000, 90000000000, 100000000000,
      200000000000, 300000000000, 400000000000, 500000000000, 600000000000, 700000000000,
      800000000000, 900000000000, 1000000000000, 2000000000000, 3000000000000, 4000000000000,
      5000000000000, 6000000000000, 7000000000000, 8000000000000, 9000000000000, 10000000000000,
      20000000000000, 30000000000000, 40000000000000, 50000000000000, 60000000000000,
      70000000000000, 80000000000000, 90000000000000, 100000000000000, 200000000000000,
      300000000000000, 400000000000000, 500000000000000, 600000000000000, 700000000000000,
      800000000000000, 900000000000000, 1000000000000000, 2000000000000000, 3000000000000000,
      4000000000000000, 5000000000000000, 6000000000000000, 7000000000000000, 8000000000000000,
      9000000000000000, 10000000000000000, 20000000000000000, 30000000000000000, 40000000000000000,
      50000000000000000, 60000000000000000, 70000000000000000, 80000000000000000, 90000000000000000,
      100000000000000000, 200000000000000000, 300000000000000000, 400000000000000000,
      500000000000000000, 600000000000000000, 700000000000000000, 800000000000000000,
      900000000000000000, 1000000000000000000, 2000000000000000000, 3000000000000000000,
      4000000000000000000, 5000000000000000000, 6000000000000000000, 7000000000000000000,
      8000000000000000000, 9000000000000000000, 10000000000000000000,
    ],
  };
}

export type WalletNetworkConfig = ReturnType<typeof createWalletConfig>;

export function createWalletNetworkConfig(): WalletNetworkConfig {
  return createWalletConfig(JSBigInt);
}

export function applyWalletNetworkConfig(): WalletNetworkConfig {
  const networkConfig = createWalletNetworkConfig();
  if (typeof window !== "undefined") {
    window.config = networkConfig;
    (globalThis as typeof globalThis & { config: WalletNetworkConfig }).config = networkConfig;
    window.logDebugMsg = (...args: unknown[]) => {
      if (networkConfig.debug) console.log(...args);
    };
  }
  return networkConfig;
}
