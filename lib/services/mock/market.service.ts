import { mockMarketData, mockMarketHistoryByTimeframe } from "@/lib/mock-data/wallet";
import type { MarketService } from "@/lib/services/market.service";
import { clone, mockDelay } from "@/lib/services/mock/helpers";

export const mockMarketService: MarketService = {
  async getMarketData() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay();
    return clone(mockMarketData);
  },
  async getPriceHistory(range) {
    // TODO(backend): replace with exchange/market API history for the requested timeframe
    await mockDelay();
    return clone(mockMarketHistoryByTimeframe[range]);
  },
};
