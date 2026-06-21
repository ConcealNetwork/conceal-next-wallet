/**
 * Shared test helpers (not a test file — excluded from the `*.test.ts` run pattern).
 */

/**
 * A coinbase-shaped daemon tx (a single `gen` input) for each block in HALF-OPEN `[start, end)`.
 *
 * The real-mode sync now VERIFIES range coverage by forcing `include_miner_txs` on (every block
 * carries a coinbase = a universal coverage marker) — see `fetchVerifiedRange`. So a daemon mock
 * driving `syncOnce` must return a coinbase per block or coverage verification rightly throws.
 * These coinbases are filtered out before folding (a non-mining wallet), so they never affect
 * balances/messages — merge any owned/special txs alongside them.
 */
export function coinbaseTxsFor(start: number, end: number) {
  const out = [];
  for (let h = start; h < end; h++) {
    out.push({
      transaction: { extra: "", vout: [], vin: [{ gen: { height: h } }] },
      timestamp: 1_700_000_000 + h,
      outputIndexes: [],
      height: h,
      blockHash: "bb".repeat(32),
      hash: `cb${h}`,
      fee: 0,
    });
  }
  return out;
}
