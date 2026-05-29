import { ensureAllWalletLegacyLibs } from "@/lib/conceal/init"
import type { NetworkService } from "@/lib/services/network.service"

async function walletOps() {
  await ensureAllWalletLegacyLibs()
  return import("@/lib/wallet-core/wallet-operations")
}

export const realNetworkService: NetworkService = {
  async getNodeStatus() {
    return (await walletOps()).getNodeStatusOperation()
  },
}
