import { MOCK_ADDRESS, mockDeposits } from "@/lib/mock-data/wallet"
import { ccxAmount } from "@/lib/utils"
import { clone, mockDelay } from "@/lib/services/mock/helpers"
import { estimateDepositInterest, estimateDepositUnlockDays, getDepositApr, type DepositService } from "@/lib/services/deposit.service"

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
      status: "active",
      durationMonths: input.durationMonths,
      apr: getDepositApr(input.durationMonths),
      interest: ccxAmount(estimateDepositInterest(input.amount, input.durationMonths)),
      unlocksInDays: estimateDepositUnlockDays(input.durationMonths),
      progressPct: 0,
      address: MOCK_ADDRESS,
    }
  },
}
