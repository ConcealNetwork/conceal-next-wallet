import { COIN_TICKER_FULL, COIN_TICKER_SHORT } from "@/lib/config/config";

const STORAGE_KEY = "useShortTicker";

type TickerPreferenceListener = (useShortTicker: boolean) => void;

let useShortTicker = false;
const listeners = new Set<TickerPreferenceListener>();

export { COIN_TICKER_FULL, COIN_TICKER_SHORT };

export function getDisplayTicker(): string {
  return useShortTicker ? COIN_TICKER_SHORT : COIN_TICKER_FULL;
}

export function getUseShortTicker(): boolean {
  return useShortTicker;
}

export function subscribeTickerPreference(listener: TickerPreferenceListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners(): void {
  listeners.forEach((listener) => {
    listener(useShortTicker);
  });
}

/** Load persisted preference from IndexedDB (same key as wallet-core `TickerStore`). */
export async function loadTickerPreference(): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const { tickerStore } = await import("@/lib/wallet-core/Translations");
    await tickerStore.initialize();
    useShortTicker = tickerStore.useShortTicker;
  } catch {
    const { Storage } = await import("@/lib/wallet-core/Storage");
    useShortTicker = Boolean(await Storage.getItem(STORAGE_KEY, false));
  }

  notifyListeners();
  return useShortTicker;
}

export async function setTickerPreference(nextUseShortTicker: boolean): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  useShortTicker = nextUseShortTicker;

  try {
    const { tickerStore } = await import("@/lib/wallet-core/Translations");
    await tickerStore.setTickerPreference(nextUseShortTicker);
  } catch {
    const { Storage } = await import("@/lib/wallet-core/Storage");
    await Storage.setItem(STORAGE_KEY, nextUseShortTicker);
  }

  notifyListeners();
}

export function stripTickerSuffix(formatted: string): string {
  const suffix = ` ${getDisplayTicker()}`;
  return formatted.endsWith(suffix) ? formatted.slice(0, -suffix.length) : formatted;
}
