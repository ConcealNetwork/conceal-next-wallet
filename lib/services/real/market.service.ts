import type { MarketService } from "@/lib/services/market.service"
import type { MarketData, MarketHistoryPoint, MarketTimeframe } from "@/lib/types"
import {
  fetchCcxMarketData,
  fetchCcxPriceHistory,
  hydrateMarketHistory,
  MARKET_SNAPSHOT_TTL_MS,
} from "@/lib/market/coingecko"

let cachedMarketData: MarketData | null = null

export const realMarketService: MarketService = {
  async getMarketData() {
    const data = await fetchCcxMarketData()
    cachedMarketData = data
    return data
  },
  async getPriceHistory(range: MarketTimeframe): Promise<MarketHistoryPoint[]> {
    if (cachedMarketData?.historyByTimeframe[range]?.length) {
      return cachedMarketData.historyByTimeframe[range]
    }
    const points = await fetchCcxPriceHistory(range)
    if (cachedMarketData) {
      cachedMarketData = {
        ...cachedMarketData,
        historyByTimeframe: { ...cachedMarketData.historyByTimeframe, [range]: points },
      }
    }
    return points
  },
}

export async function hydrateMarketDataForRange(data: MarketData, range: MarketTimeframe): Promise<MarketData> {
  return hydrateMarketHistory(data, range)
}
