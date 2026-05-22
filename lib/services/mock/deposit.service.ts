import { MOCK_ADDRESS, mockDeposits } from "@/lib/mock-data/wallet"
import { ccxAmount } from "@/lib/utils"
import { clone, mockDelay } from "@/lib/services/mock/helpers"
import type { DepositService } from "@/lib/services/deposit.service"

export const mockDepositService: DepositService = {
  async listDeposits() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return clone(mockDeposits)
  },
  async createDeposit(input) {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return {
      id: "dep-mock-submit",
      amount: ccxAmount(input.amount),
      durationMonths: input.durationMonths,
      apr: 4.2,
      interest: ccxAmount(input.amount * 0.0042),
      unlocksInDays: input.durationMonths * 30,
      progressPct: 0,
      address: MOCK_ADDRESS,
    }
  },
}
