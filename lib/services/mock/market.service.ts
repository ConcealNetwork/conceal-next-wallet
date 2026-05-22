import { mockMarketData } from "@/lib/mock-data/wallet"
import { clone, mockDelay } from "@/lib/services/mock/helpers"
import type { MarketService } from "@/lib/services/market.service"

export const mockMarketService: MarketService = {
  async getMarketData() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return clone(mockMarketData)
  },
}
