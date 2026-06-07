import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NodeStatus } from "@/lib/types";
import {
  TELEMETRY_MAX_POINTS,
  useNetworkTelemetryHistory,
} from "@/lib/hooks/use-network-telemetry-history";

function status(over: Partial<NodeStatus>): NodeStatus {
  return {
    url: "https://node",
    height: 1,
    networkHeight: 1,
    peers: 3,
    peersOut: 1,
    peersIn: 2,
    isCustom: false,
    version: "1.0",
    difficulty: 100,
    hashrate: 50,
    mempool: 0,
    lastBlockSecondsAgo: 5,
    avgBlockTimeSeconds: 120,
    heightHistory: [],
    hashrateHistory: [],
    peersHistory: [],
    blockTimeHistory: [],
    ...over,
  };
}

describe("useNetworkTelemetryHistory", () => {
  it("starts empty for undefined data", () => {
    const { result } = renderHook(() => useNetworkTelemetryHistory(undefined));
    expect(result.current).toEqual({ height: [], hashrate: [], peers: [], blockTime: [] });
  });

  it("records one point per reading", () => {
    const { result, rerender } = renderHook(({ d }) => useNetworkTelemetryHistory(d), {
      initialProps: { d: status({ height: 100, hashrate: 10, peers: 4 }) },
    });
    expect(result.current.height).toEqual([100]);
    rerender({ d: status({ height: 101, hashrate: 12, peers: 5 }) });
    expect(result.current.height).toEqual([100, 101]);
    expect(result.current.hashrate).toEqual([10, 12]);
    expect(result.current.peers).toEqual([4, 5]);
  });

  it("caps the series at TELEMETRY_MAX_POINTS, keeping the newest", () => {
    const { result, rerender } = renderHook(({ d }) => useNetworkTelemetryHistory(d), {
      initialProps: { d: status({ height: 0 }) },
    });
    for (let i = 1; i < TELEMETRY_MAX_POINTS + 6; i += 1) {
      rerender({ d: status({ height: i }) });
    }
    expect(result.current.height.length).toBe(TELEMETRY_MAX_POINTS);
    expect(result.current.height.at(-1)).toBe(TELEMETRY_MAX_POINTS + 5);
  });
});
