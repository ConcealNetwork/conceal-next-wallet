"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useWalletSession } from "@/lib/session/wallet-session";
import { useNetworkStatus } from "@/lib/hooks";
import {
  EMPTY_NETWORK_TELEMETRY,
  accumulateNetworkTelemetry,
  normalizeHashrateChartSeries,
  type NetworkTelemetryHistory,
} from "@/lib/hooks/use-network-telemetry-history";

type NetworkTelemetryContextValue = {
  history: NetworkTelemetryHistory;
  hashrateChart: number[];
};

const NetworkTelemetryContext = createContext<NetworkTelemetryContextValue>({
  history: EMPTY_NETWORK_TELEMETRY,
  hashrateChart: [],
});

/**
 * Polls node status while the wallet shell is mounted and accumulates telemetry
 * so Network sparklines keep filling even when the user is on other pages.
 */
export function NetworkTelemetryProvider({ children }: { children: React.ReactNode }) {
  const { status } = useWalletSession();
  const { data, dataUpdatedAt } = useNetworkStatus();
  const [history, setHistory] = useState<NetworkTelemetryHistory>(EMPTY_NETWORK_TELEMETRY);

  useEffect(() => {
    if (status !== "open") {
      setHistory(EMPTY_NETWORK_TELEMETRY);
    }
  }, [status]);

  useEffect(() => {
    if (status !== "open" || !data || !dataUpdatedAt) return;
    setHistory((prev) => accumulateNetworkTelemetry(prev, data));
  }, [data, dataUpdatedAt, status]);

  const hashrateChart = useMemo(
    () => normalizeHashrateChartSeries(history.hashrate),
    [history.hashrate],
  );

  const value = useMemo(() => ({ history, hashrateChart }), [history, hashrateChart]);

  return (
    <NetworkTelemetryContext.Provider value={value}>{children}</NetworkTelemetryContext.Provider>
  );
}

export function useNetworkTelemetry() {
  return useContext(NetworkTelemetryContext);
}
