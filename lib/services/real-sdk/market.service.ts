/**
 * Market data is external (CoinGecko/CoinPaprika via `lib/market/*`) and has NO
 * wallet-engine dependency — plain client-side fetching, identical in any engine.
 */
import { fetchCcxMarketData, fetchCcxPriceHistory } from "@/lib/market/coingecko";
import type { MarketService } from "@/lib/services/market.service";
import type { MarketData, MarketHistoryPoint, MarketTimeframe } from "@/lib/types";

let cachedMarketData: MarketData | null = null;

export const realSdkMarketService: MarketService = {
  async getMarketData() {
    const data = await fetchCcxMarketData();
    cachedMarketData = data;
    return data;
  },
  async getPriceHistory(range: MarketTimeframe): Promise<MarketHistoryPoint[]> {
    if (cachedMarketData?.historyByTimeframe[range]?.length) {
      return cachedMarketData.historyByTimeframe[range];
    }
    const points = await fetchCcxPriceHistory(range);
    if (cachedMarketData) {
      cachedMarketData = {
        ...cachedMarketData,
        historyByTimeframe: { ...cachedMarketData.historyByTimeframe, [range]: points },
      };
    }
    return points;
  },
};
