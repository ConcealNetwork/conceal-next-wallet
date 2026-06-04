import type { MarketData, MarketHistoryPoint, MarketTimeframe } from "@/lib/types";
import { ccxAmount, usdAmount } from "@/lib/utils";

const COINGECKO_IDS = ["conceal", "conceal-network"] as const;
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const COINPAPRIKA_TICKER = "https://api.coinpaprika.com/v1/tickers/ccx-conceal";

/** Matches conceal-website app.config.refresh.cryptoPriceInterval (2 min). */
export const MARKET_SNAPSHOT_TTL_MS = 2 * 60 * 1000;
/** Chart history changes slowly — cache longer to spare CoinGecko quota. */
const CHART_TTL_MS = 30 * 60 * 1000;

const TIMEFRAME_DAYS: Record<MarketTimeframe, number> = {
  "24H": 1,
  "7D": 7,
  "30D": 30,
  "90D": 90,
};

const JSON_HEADERS: RequestInit = {
  mode: "cors",
  headers: { Accept: "application/json" },
};

export type MarketPriceSource = "coingecko" | "coinpaprika";

type PriceSnapshot = {
  source: MarketPriceSource;
  current_price: number;
  price_change_percentage_24h: number;
  high_24h: number;
  low_24h: number;
  total_volume: number;
  market_cap: number;
  circulating_supply: number;
  ath: number;
};

type CacheEnvelope<T> = {
  fetchedAt: number;
  data: T;
};

const SNAPSHOT_CACHE_KEY = "ccx-market-snapshot-v2";
const memorySnapshot: { current: CacheEnvelope<PriceSnapshot> | null } = { current: null };
const memoryCharts = new Map<MarketTimeframe, CacheEnvelope<MarketHistoryPoint[]>>();

function readLocal<T>(key: string): CacheEnvelope<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEnvelope<T>;
  } catch {
    return null;
  }
}

function writeLocal<T>(key: string, envelope: CacheEnvelope<T>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // quota or private mode — memory cache still helps
  }
}

function isFresh<T>(envelope: CacheEnvelope<T> | null | undefined, ttlMs: number): boolean {
  return envelope !== null && envelope !== undefined && Date.now() - envelope.fetchedAt < ttlMs;
}

/** Ported from conceal-website CryptoWidgetSection.fetchFromCoinGecko */
async function fetchFromCoinGecko(): Promise<PriceSnapshot | null> {
  for (const coinId of COINGECKO_IDS) {
    try {
      const response = await fetch(
        `${COINGECKO_API}/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`,
        JSON_HEADERS,
      );
      if (response.status === 429) {
        console.warn("CoinGecko rate limited, trying CoinPaprika fallback...");
        break;
      }
      if (!response.ok) continue;

      const data = (await response.json()) as Record<
        string,
        { usd?: number; usd_24h_change?: number }
      >;
      const row = data[coinId];
      if (!row?.usd) continue;

      const price = row.usd;
      const change = row.usd_24h_change ?? 0;
      const enriched = await tryCoinGeckoMarkets(coinId).catch(() => null);

      return {
        source: "coingecko",
        current_price: price,
        price_change_percentage_24h: change,
        high_24h: enriched?.high_24h ?? price,
        low_24h: enriched?.low_24h ?? price,
        total_volume: enriched?.total_volume ?? 0,
        market_cap: enriched?.market_cap ?? 0,
        circulating_supply: enriched?.circulating_supply ?? 0,
        ath: enriched?.ath ?? 0,
      };
    } catch (error) {
      console.warn(`CoinGecko failed for ${coinId}:`, error);
    }
  }
  return null;
}

async function tryCoinGeckoMarkets(coinId: string): Promise<Partial<PriceSnapshot> | null> {
  const response = await fetch(
    `${COINGECKO_API}/coins/markets?vs_currency=usd&ids=${coinId}&sparkline=false`,
    JSON_HEADERS,
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as Array<{
    high_24h?: number;
    low_24h?: number;
    total_volume?: number;
    market_cap?: number;
    circulating_supply?: number;
    ath?: number;
  }>;
  const row = rows[0];
  if (!row) return null;
  return {
    high_24h: row.high_24h,
    low_24h: row.low_24h,
    total_volume: row.total_volume,
    market_cap: row.market_cap,
    circulating_supply: row.circulating_supply,
    ath: row.ath,
  };
}

/** Ported from conceal-website CryptoWidgetSection.fetchFromCoinPaprika */
async function fetchFromCoinPaprika(): Promise<PriceSnapshot | null> {
  try {
    const response = await fetch(COINPAPRIKA_TICKER, JSON_HEADERS);
    if (!response.ok) return null;

    const data = (await response.json()) as {
      total_supply?: number;
      quotes?: {
        USD?: {
          price?: number;
          percent_change_24h?: number;
          volume_24h?: number;
          market_cap?: number;
          ath_price?: number;
        };
      };
    };

    const usd = data.quotes?.USD;
    if (!usd?.price) return null;

    return {
      source: "coinpaprika",
      current_price: usd.price,
      price_change_percentage_24h: usd.percent_change_24h ?? 0,
      high_24h: usd.price,
      low_24h: usd.price,
      total_volume: usd.volume_24h ?? 0,
      market_cap: usd.market_cap ?? 0,
      circulating_supply: data.total_supply ?? 0,
      ath: usd.ath_price ?? 0,
    };
  } catch (error) {
    console.error("CoinPaprika API failed:", error);
    return null;
  }
}

/** conceal-website fetchCCXPrice: CoinGecko first, then CoinPaprika. */
async function fetchLiveSnapshot(): Promise<PriceSnapshot> {
  const snapshot = (await fetchFromCoinGecko()) ?? (await fetchFromCoinPaprika());
  if (!snapshot) {
    throw new Error("CCX price unavailable from CoinGecko and CoinPaprika");
  }
  return snapshot;
}

async function loadSnapshot(): Promise<PriceSnapshot> {
  if (memorySnapshot.current && isFresh(memorySnapshot.current, MARKET_SNAPSHOT_TTL_MS)) {
    return memorySnapshot.current.data;
  }
  const fromLocal = readLocal<PriceSnapshot>(SNAPSHOT_CACHE_KEY);
  if (fromLocal && isFresh(fromLocal, MARKET_SNAPSHOT_TTL_MS)) {
    memorySnapshot.current = fromLocal;
    return fromLocal.data;
  }

  try {
    const snapshot = await fetchLiveSnapshot();
    const envelope: CacheEnvelope<PriceSnapshot> = { fetchedAt: Date.now(), data: snapshot };
    memorySnapshot.current = envelope;
    writeLocal(SNAPSHOT_CACHE_KEY, envelope);
    return snapshot;
  } catch (error) {
    if (memorySnapshot.current) return memorySnapshot.current.data;
    if (fromLocal) return fromLocal.data;
    throw error;
  }
}

function formatChartLabel(timestampMs: number, range: MarketTimeframe): string {
  const date = new Date(timestampMs);
  if (range === "24H") {
    return date.toLocaleTimeString("en-US", { hour: "numeric", hour12: false, timeZone: "UTC" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
}

function downsampleChart(points: MarketHistoryPoint[], maxPoints: number): MarketHistoryPoint[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const sampled: MarketHistoryPoint[] = [];
  for (let i = 0; i < points.length; i += step) {
    sampled.push(points[i]);
  }
  const last = points[points.length - 1];
  if (sampled[sampled.length - 1]?.date !== last.date) {
    sampled.push(last);
  }
  return sampled;
}

async function loadChart(range: MarketTimeframe): Promise<MarketHistoryPoint[]> {
  const localKey = `ccx-coingecko-chart-${range}-v1`;
  const cached = memoryCharts.get(range);
  if (cached && isFresh(cached, CHART_TTL_MS)) {
    return cached.data;
  }
  const fromLocal = readLocal<MarketHistoryPoint[]>(localKey);
  if (fromLocal && isFresh(fromLocal, CHART_TTL_MS)) {
    memoryCharts.set(range, fromLocal);
    return fromLocal.data;
  }

  const days = TIMEFRAME_DAYS[range];
  const maxPoints = range === "24H" ? 25 : range === "7D" ? 8 : range === "30D" ? 31 : 91;

  try {
    const response = await fetch(
      `${COINGECKO_API}/coins/conceal/market_chart?vs_currency=usd&days=${days}`,
      JSON_HEADERS,
    );
    if (!response.ok) {
      throw new Error(`CoinGecko chart HTTP ${response.status}`);
    }
    const chart = (await response.json()) as { prices: [number, number][] };
    const points = downsampleChart(
      (chart.prices ?? []).map(([ts, price]) => ({
        date: formatChartLabel(ts, range),
        price: Number(price),
      })),
      maxPoints,
    );
    const envelope: CacheEnvelope<MarketHistoryPoint[]> = { fetchedAt: Date.now(), data: points };
    memoryCharts.set(range, envelope);
    writeLocal(localKey, envelope);
    return points;
  } catch (error) {
    if (cached) return cached.data;
    if (fromLocal) return fromLocal.data;
    throw error;
  }
}

function snapshotToMarketData(
  snapshot: PriceSnapshot,
  historyByTimeframe: Record<MarketTimeframe, MarketHistoryPoint[]>,
): MarketData {
  return {
    price: usdAmount(snapshot.current_price),
    change24hPct: snapshot.price_change_percentage_24h,
    high24h: usdAmount(snapshot.high_24h),
    low24h: usdAmount(snapshot.low_24h),
    volume24h: usdAmount(snapshot.total_volume),
    marketCap: usdAmount(snapshot.market_cap),
    circulatingSupply: ccxAmount(snapshot.circulating_supply),
    ath: snapshot.ath > 0 ? usdAmount(snapshot.ath) : undefined,
    portfolioValueUsd: usdAmount(0),
    history: historyByTimeframe["30D"],
    historyByTimeframe,
    priceSource: snapshot.source,
  };
}

let marketDataPromise: Promise<MarketData> | null = null;

export async function fetchCcxMarketData(): Promise<MarketData> {
  if (marketDataPromise) {
    return marketDataPromise;
  }

  marketDataPromise = (async () => {
    const snapshot = await loadSnapshot();
    let history30d: MarketHistoryPoint[] = [];
    try {
      history30d = await loadChart("30D");
    } catch {
      // Chart is optional when price came from CoinPaprika or CoinGecko is rate-limited.
      history30d =
        memoryCharts.get("30D")?.data ??
        readLocal<MarketHistoryPoint[]>("ccx-coingecko-chart-30D-v1")?.data ??
        [];
    }
    const historyByTimeframe: Record<MarketTimeframe, MarketHistoryPoint[]> = {
      "24H": [],
      "7D": [],
      "30D": history30d,
      "90D": [],
    };
    return snapshotToMarketData(snapshot, historyByTimeframe);
  })().finally(() => {
    marketDataPromise = null;
  });

  return marketDataPromise;
}

/** @deprecated Use fetchCcxMarketData */
export const fetchCoinGeckoMarketData = fetchCcxMarketData;

export async function fetchCcxPriceHistory(range: MarketTimeframe): Promise<MarketHistoryPoint[]> {
  return loadChart(range);
}

/** @deprecated Use fetchCcxPriceHistory */
export const fetchCoinGeckoPriceHistory = fetchCcxPriceHistory;

export async function hydrateMarketHistory(
  data: MarketData,
  range: MarketTimeframe,
): Promise<MarketData> {
  if (data.historyByTimeframe[range]?.length) {
    return { ...data, history: data.historyByTimeframe[range] };
  }
  const points = await loadChart(range);
  return {
    ...data,
    history: points,
    historyByTimeframe: { ...data.historyByTimeframe, [range]: points },
  };
}
