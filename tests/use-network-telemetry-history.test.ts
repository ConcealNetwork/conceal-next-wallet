import { describe, expect, it } from "vitest";
import {
  accumulateNetworkTelemetry,
  ensureSparklinePoints,
  normalizeHashrateChartSeries,
  TELEMETRY_MAX_POINTS,
} from "@/lib/hooks/use-network-telemetry-history";
import type { NodeStatus } from "@/lib/types";

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
    tipBlockTimestamp: 0,
    tipBlockAgeSeconds: 45,
    heightHistory: [],
    hashrateHistory: [],
    peersHistory: [],
    tipBlockAgeHistory: [],
    ...over,
  };
}

describe("accumulateNetworkTelemetry", () => {
  it("starts empty and records one point per reading", () => {
    let history = accumulateNetworkTelemetry(
      { height: [], hashrate: [], peers: [], tipBlockAge: [] },
      status({ networkHeight: 100, hashrate: 10, peers: 4, tipBlockAgeSeconds: 30 }),
    );
    expect(history).toEqual({
      height: [100],
      hashrate: [10],
      peers: [4],
      tipBlockAge: [30],
    });

    history = accumulateNetworkTelemetry(
      history,
      status({ networkHeight: 101, hashrate: 12, peers: 5, tipBlockAgeSeconds: 8 }),
    );
    expect(history).toEqual({
      height: [100, 101],
      hashrate: [10, 12],
      peers: [4, 5],
      tipBlockAge: [30, 8],
    });
  });

  it("caps the series at TELEMETRY_MAX_POINTS, keeping the newest", () => {
    let history = accumulateNetworkTelemetry(
      { height: [], hashrate: [], peers: [], tipBlockAge: [] },
      status({ networkHeight: 0 }),
    );
    for (let i = 1; i < TELEMETRY_MAX_POINTS + 6; i += 1) {
      history = accumulateNetworkTelemetry(history, status({ networkHeight: i }));
    }
    expect(history.height.length).toBe(TELEMETRY_MAX_POINTS);
    expect(history.height.at(-1)).toBe(TELEMETRY_MAX_POINTS + 5);
  });
});

describe("normalizeHashrateChartSeries", () => {
  it("centers the rolling mean and amplifies small deviations", () => {
    const chart = normalizeHashrateChartSeries([10_000_000, 10_010_000, 9_990_000, 10_005_000]);
    expect(chart.length).toBe(4);
    expect(Math.min(...chart)).toBeLessThan(50);
    expect(Math.max(...chart)).toBeGreaterThan(50);
  });

  it("returns a flat midline for a single sample", () => {
    expect(normalizeHashrateChartSeries([10_700_000])).toEqual([50, 50]);
  });
});

describe("ensureSparklinePoints", () => {
  it("duplicates a lone point so sparklines can render", () => {
    expect(ensureSparklinePoints([118])).toEqual([118, 118]);
  });
});
