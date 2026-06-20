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

function readLocalPreference(): boolean | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : raw === "true";
  } catch {
    return null;
  }
}

function writeLocalPreference(value: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Private-mode / quota — non-critical UI preference; keep the in-memory value.
  }
}

/**
 * Load the persisted preference. localStorage is the canonical store — the same
 * `useShortTicker` key the device-data vault backs up.
 */
export async function loadTickerPreference(): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  const local = readLocalPreference();
  useShortTicker = local ?? false;
  if (local === null) {
    writeLocalPreference(useShortTicker);
  }

  notifyListeners();
  return useShortTicker;
}

export async function setTickerPreference(nextUseShortTicker: boolean): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  useShortTicker = nextUseShortTicker;
  writeLocalPreference(nextUseShortTicker);
  notifyListeners();
}

export function stripTickerSuffix(formatted: string): string {
  const suffix = ` ${getDisplayTicker()}`;
  return formatted.endsWith(suffix) ? formatted.slice(0, -suffix.length) : formatted;
}
