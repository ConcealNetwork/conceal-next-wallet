import { mockNodeStatus } from "@/lib/mock-data/wallet"
import { clone, mockDelay } from "@/lib/services/mock/helpers"
import type { NetworkService } from "@/lib/services/network.service"

export const mockNetworkService: NetworkService = {
  async getNodeStatus() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return clone(mockNodeStatus)
  },
}
