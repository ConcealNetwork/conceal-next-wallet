import type { MarketData } from "@/lib/types"

export interface MarketService {
  getMarketData(): Promise<MarketData>
}
