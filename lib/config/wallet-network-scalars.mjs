/** Plain-number fields (no JSBigInt) — shared by config.ts and generate-public-config.mjs */
export const walletNetworkScalars = {
  coinUnitPlaces: 6,
  coinFeeAtomic: 1000,
  minimumFeeV2Atomic: 1000,
  remoteNodeFeeAtomic: 10000,
  feePerKBAtomic: 1000,
  defaultDustThresholdAtomic: 10,
  messageTxAmountAtomic: 100,
  depositMinAmountCoin: 1,
  depositMinTermMonth: 1,
  depositMinTermBlock: 21900,
  depositMaxTermMonth: 12,
  depositSmallWithdrawFee: 10,
  avgBlockTime: 120,
  // Max ENCRYPTED-BODY length in UTF-8 BYTES. The on-chain tx_extra message
  // length field is a single byte (≤255) and the blob = body bytes + 4-byte
  // zero checksum, so the body ceiling is 255 − 4 = 251 bytes. Treated as a
  // byte budget everywhere it's checked (NOT a UTF-16 char count) — a value
  // >251 here would silently corrupt long/multi-byte messages.
  maxMessageSize: 251,
  cryptonoteMemPoolTxLifetimeSeconds: 60 * 60 * 12,
};
