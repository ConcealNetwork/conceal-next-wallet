/** Plain-number fields (no JSBigInt) — shared by config.ts and generate-public-config.mjs */
export const walletNetworkScalars = {
  coinUnitPlaces: 6,
  coinFeeAtomic: 1000,
  minimumFeeV2Atomic: 1000,
  remoteNodeFeeAtomic: 10000,
  feePerKBAtomic: 1000,
  dustThresholdAtomic: 10,
  messageTxAmountAtomic: 100,
  depositMinAmountCoin: 1,
  depositMinTermMonth: 1,
  depositMinTermBlock: 21900,
  depositMaxTermMonth: 12,
  depositSmallWithdrawFee: 10,
  avgBlockTime: 120,
  maxMessageSize: 260,
  cryptonoteMemPoolTxLifetimeSeconds: 60 * 60 * 12,
}
