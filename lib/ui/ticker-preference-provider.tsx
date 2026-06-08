"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  COIN_TICKER_FULL,
  COIN_TICKER_SHORT,
  getDisplayTicker,
  getUseShortTicker,
  loadTickerPreference,
  setTickerPreference,
  subscribeTickerPreference,
} from "@/lib/ui/ticker-preference";

type TickerPreferenceContextValue = {
  useShortTicker: boolean;
  tickerSymbol: string;
  setUseShortTicker: (useShortTicker: boolean) => Promise<void>;
};

const TickerPreferenceContext = createContext<TickerPreferenceContextValue | null>(null);

export function useDisplayTicker(): string {
  return useSyncExternalStore(subscribeTickerPreference, getDisplayTicker, () => COIN_TICKER_FULL);
}

export function TickerPreferenceProvider({ children }: { children: React.ReactNode }) {
  const useShortTicker = useSyncExternalStore(
    subscribeTickerPreference,
    getUseShortTicker,
    () => false,
  );

  useEffect(() => {
    void loadTickerPreference();
  }, []);

  const value = useMemo<TickerPreferenceContextValue>(
    () => ({
      useShortTicker,
      tickerSymbol: getDisplayTicker(),
      setUseShortTicker: setTickerPreference,
    }),
    [useShortTicker],
  );

  return (
    <TickerPreferenceContext.Provider value={value}>{children}</TickerPreferenceContext.Provider>
  );
}

export function useTickerPreference(): TickerPreferenceContextValue {
  const context = useContext(TickerPreferenceContext);
  if (!context) {
    throw new Error("useTickerPreference must be used inside TickerPreferenceProvider");
  }
  return context;
}

export function TickerBadge({ className }: { className?: string }) {
  const tickerSymbol = useDisplayTicker();
  return <span className={className}>{tickerSymbol}</span>;
}

/** Remount wallet UI when ticker changes so `formatCcx` output refreshes everywhere. */
export function WalletTickerRefresh({ children }: { children: React.ReactNode }) {
  const tickerSymbol = useDisplayTicker();
  return <div key={tickerSymbol}>{children}</div>;
}

export const TICKER_OPTIONS = [
  { value: "full" as const, label: COIN_TICKER_FULL },
  { value: "short" as const, label: COIN_TICKER_SHORT },
];
