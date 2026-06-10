import type { NodeStatus } from "@/lib/types";

/** How many recent readings to keep for the telemetry sparklines. */
export const TELEMETRY_MAX_POINTS = 24;

export type NetworkTelemetryHistory = {
  height: number[];
  hashrate: number[];
  peers: number[];
  blockTime: number[];
};

export const EMPTY_NETWORK_TELEMETRY: NetworkTelemetryHistory = {
  height: [],
  hashrate: [],
  peers: [],
  blockTime: [],
};

function append(series: number[], value: number): number[] {
  const next = series.length >= TELEMETRY_MAX_POINTS ? series.slice(1) : series.slice();
  next.push(value);
  return next;
}

/**
 * Append one daemon snapshot to the rolling telemetry series.
 * Block time uses `lastBlockSecondsAgo` (observed, climbs until the next block).
 */
export function accumulateNetworkTelemetry(
  prev: NetworkTelemetryHistory,
  data: NodeStatus,
): NetworkTelemetryHistory {
  return {
    height: append(prev.height, data.networkHeight),
    hashrate: append(prev.hashrate, data.hashrate),
    peers: append(prev.peers, data.peers),
    blockTime: append(prev.blockTime, data.lastBlockSecondsAgo),
  };
}

/**
 * Map raw hashrate samples to a 0–100 sparkline band centered on the rolling
 * mean so small network swings stay visible on the chart.
 */
export function normalizeHashrateChartSeries(values: number[]): number[] {
  if (values.length === 0) return [];
  if (values.length === 1) return [50, 50];

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const deviations = values.map((value) => value - mean);
  const maxDeviation = Math.max(...deviations.map(Math.abs), mean * 0.002, 1);

  return deviations.map((deviation) => 50 + (deviation / maxDeviation) * 35);
}

/** Ensure sparkline components always receive at least two points. */
export function ensureSparklinePoints(values: number[]): number[] {
  if (values.length >= 2) return values;
  if (values.length === 1) return [values[0], values[0]];
  return values;
}
