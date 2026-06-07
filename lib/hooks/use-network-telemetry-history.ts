"use client";

import { useEffect, useState } from "react";
import type { NodeStatus } from "@/lib/types";

/** How many recent readings to keep for the telemetry sparklines. */
export const TELEMETRY_MAX_POINTS = 24;

export type NetworkTelemetryHistory = {
  height: number[];
  hashrate: number[];
  peers: number[];
  blockTime: number[];
};

const EMPTY: NetworkTelemetryHistory = { height: [], hashrate: [], peers: [], blockTime: [] };

function append(series: number[], value: number): number[] {
  const next = series.length >= TELEMETRY_MAX_POINTS ? series.slice(1) : series.slice();
  next.push(value);
  return next;
}

/**
 * Accumulate node-status readings into short history series so the network
 * telemetry sparklines show real trends. The daemon `getinfo` is a snapshot, so
 * the trend has to be built client-side, one point per poll (the effect fires
 * only when React Query hands back a new `data` reference).
 */
export function useNetworkTelemetryHistory(data: NodeStatus | undefined): NetworkTelemetryHistory {
  const [history, setHistory] = useState<NetworkTelemetryHistory>(EMPTY);

  useEffect(() => {
    if (!data) return;
    setHistory((prev) => ({
      height: append(prev.height, data.height),
      hashrate: append(prev.hashrate, data.hashrate),
      peers: append(prev.peers, data.peers),
      blockTime: append(prev.blockTime, data.avgBlockTimeSeconds),
    }));
  }, [data]);

  return history;
}
