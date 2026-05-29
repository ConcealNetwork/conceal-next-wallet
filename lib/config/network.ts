/**
 * Network constants ported from conceal-web-wallet/src/config.ts.
 * Applied to `window.config` after legacy globals load.
 */

export type WalletNetworkConfig = {
  debug: boolean
  apiUrl: string[]
  nodeList: string[]
  publicNodes: string
  mainnetExplorerUrl: string
  mainnetExplorerUrlHash: string
  mainnetExplorerUrlBlock: string
  testnetExplorerUrl: string
  testnetExplorerUrlHash: string
  testnetExplorerUrlBlock: string
  testnet: boolean
  coinUnitPlaces: number
  coinDisplayUnitPlaces: number
  txMinConfirms: number
  txCoinbaseMinConfirms: number
  addressPrefix: number
  integratedAddressPrefix: number
  subAddressPrefix: number
  addressPrefixTestnet: number
  integratedAddressPrefixTestnet: number
  subAddressPrefixTestnet: number
  UPGRADE_HEIGHT_V4: number
  coinFee: JSBigIntInstance
  minimumFee_V2: JSBigIntInstance
  remoteNodeFee: JSBigIntInstance
  feePerKB: JSBigIntInstance
  dustThreshold: JSBigIntInstance
  defaultMixin: number
  optimizeOutputs: number
  optimizeThreshold: number
  messageTxAmount: JSBigIntInstance
  maxMessageSize: number
  cryptonoteMemPoolTxLifetime: number
  fusionTxMinInOutCountRatio: number
  maxFusionOutputs: number
  idleTimeout: number
  idleWarningDuration: number
  syncBlockCount: number
  syncScreenMinTxPerShard: number
  maxBlockQueue: number
  maxTxQueueHigh: number
  maxTxQueueLow: number
  maxTxQueuePackets: number
  maxRemoteNodes: number
  maxPrefetchParallel: number
  maxWorkerCores: number
  coinSymbol: string
  coinSymbolShort: string
  openAliasPrefix: string
  coinName: string
  coinUriPrefix: string
  donationAddress: string
  donationAddresses: string[]
  avgBlockTime: number
  maxBlockNumber: number
  depositMinAmountCoin: number
  depositMinTermMonth: number
  depositMinTermBlock: number
  depositMaxTermMonth: number
  depositSmallWithdrawFee: number
  depositRateV3: number[]
  PRETTY_AMOUNTS: number[]
}

export function createWalletNetworkConfig(): WalletNetworkConfig {
  return {
    debug: false,
    apiUrl: ["https://ccxapi.conceal.network/api/"],
    nodeList: [
      "https://explorer.conceal.network/daemon/",
      "https://ccxapi.conceal.network/daemon/",
    ],
    publicNodes: "https://explorer.conceal.network/pool",
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
    coinUnitPlaces: 6,
    coinDisplayUnitPlaces: 6,
    txMinConfirms: 10,
    txCoinbaseMinConfirms: 10,
    addressPrefix: 0x7ad4,
    integratedAddressPrefix: 0x7ad5,
    subAddressPrefix: 0x7ad6,
    addressPrefixTestnet: 0x7ad4,
    integratedAddressPrefixTestnet: 0x7ad5,
    subAddressPrefixTestnet: 0x7ad6,
    UPGRADE_HEIGHT_V4: 45000,
    coinFee: new JSBigInt("1000"),
    minimumFee_V2: new JSBigInt("1000"),
    remoteNodeFee: new JSBigInt("10000"),
    feePerKB: new JSBigInt("1000"),
    dustThreshold: new JSBigInt("10"),
    defaultMixin: 5,
    optimizeOutputs: 100,
    optimizeThreshold: 100,
    messageTxAmount: new JSBigInt("100"),
    maxMessageSize: 260,
    cryptonoteMemPoolTxLifetime: 60 * 60 * 12,
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
    coinUriPrefix: "conceal:",
    donationAddress:
      "ccx7V4LeUXy2eZ9waDXgsLS7Uc11e2CpNSCWVdxEqSRFAm6P6NQhSb7XMG1D6VAZKmJeaJP37WYQg84zbNrPduTX2whZ5pacfj",
    donationAddresses: [
      "ccx7NzuofXxcypov8Yqm2A118xT17HereBFjp3RScjzM7wncf8BRcnHZbACy63sWD71L7NmkJRgQKXFE3weCfAh31RAVFHgttf",
      "ccx7V4LeUXy2eZ9waDXgsLS7Uc11e2CpNSCWVdxEqSRFAm6P6NQhSb7XMG1D6VAZKmJeaJP37WYQg84zbNrPduTX2whZ5pacfj",
      "ccx7YZ4RC97fqMh1bmzrFtDoSSiEgvEYzhaLE53SR9bh4QrDBUhGUH3TCmXqv8MTLjJDtnCeeaT5bLC2ZSzp3ZmQ19DoiPLLXS",
    ],
    avgBlockTime: 120,
    maxBlockNumber: 500_000_000,
    depositMinAmountCoin: 1,
    depositMinTermMonth: 1,
    depositMinTermBlock: 21900,
    depositMaxTermMonth: 12,
    depositSmallWithdrawFee: 10,
    depositRateV3: [0.029, 0.039, 0.049],
    PRETTY_AMOUNTS: buildPrettyAmounts(),
  }
}

function buildPrettyAmounts(): number[] {
  const amounts: number[] = []
  for (let exp = 0; exp <= 18; exp++) {
    const base = 10 ** exp
    for (let digit = 1; digit <= 9; digit++) {
      amounts.push(digit * base)
    }
  }
  return amounts
}

export function applyWalletNetworkConfig(): WalletNetworkConfig {
  const networkConfig = createWalletNetworkConfig()
  if (typeof window !== "undefined") {
    window.config = networkConfig
    // wallet-core modules use ambient global `config` (v1 parity)
    ;(globalThis as typeof globalThis & { config: WalletNetworkConfig }).config = networkConfig
    window.logDebugMsg = (...args: unknown[]) => {
      if (networkConfig.debug) console.log(...args)
    }
  }
  return networkConfig
}
