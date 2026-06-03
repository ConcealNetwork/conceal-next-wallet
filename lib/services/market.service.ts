import type { MarketData, MarketHistoryPoint, MarketTimeframe } from "@/lib/types";

export interface MarketService {
  getMarketData(): Promise<MarketData>;
  getPriceHistory(range: MarketTimeframe): Promise<MarketHistoryPoint[]>;
}
