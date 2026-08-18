import { describe, expect, it } from "vitest";
import { parseGetInfo } from "@/lib/network/parse-getinfo";

/** Live Conceal explorer `getinfo` (v6.7.5) — no `start_time`, has `last_block_timestamp`. */
const CONCEAL_GETINFO = {
  alt_blocks_count: 41,
  difficulty: 23_300_000,
  fee_address:
    "ccx7V4LeUXy2eZ9waDXgsLS7Uc11e2CpNSCWVdxEqSRFAm6P6NQhSb7XMG1D6VAZKmJeaJP37WYQg84zbNrPduTX2whZ5pacfj",
  grey_peerlist_size: 3084,
  height: 2_137_644,
  incoming_connections_count: 20,
  last_block_timestamp: 1_786_724_881,
  outgoing_connections_count: 8,
  status: "OK",
  tx_count: 2_535_416,
  tx_pool_size: 0,
  version: "6.7.5",
  white_peerlist_size: 178,
} as const;

describe("parseGetInfo", () => {
  it("reads Conceal last_block_timestamp and tx_pool_size", () => {
    const info = parseGetInfo({ ...CONCEAL_GETINFO });
    expect(info.lastBlockTimestamp).toBe(1_786_724_881);
    expect(info.startTime).toBe(0);
    expect(info.txPoolSize).toBe(0);
    expect(info.version).toBe("6.7.5");
    expect(info.height).toBe(2_137_644);
  });

  it("reads Monero-style start_time and transactions_pool_size", () => {
    const info = parseGetInfo({
      status: "OK",
      height: 100,
      difficulty: 1,
      start_time: 1_700_000_000,
      transactions_pool_size: 2,
      incoming_connections_count: 1,
      outgoing_connections_count: 1,
      white_peerlist_size: 1,
      grey_peerlist_size: 1,
      version: "1.0",
    });
    expect(info.startTime).toBe(1_700_000_000);
    expect(info.txPoolSize).toBe(2);
  });

  it("throws on non-OK status", () => {
    expect(() => parseGetInfo({ status: "ERROR" })).toThrow(/non-OK status/);
  });
});
