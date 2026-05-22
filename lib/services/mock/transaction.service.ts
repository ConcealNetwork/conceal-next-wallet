import { mockTransactions } from "@/lib/mock-data/wallet"
import { ccxAmount } from "@/lib/utils"
import { clone, mockDelay } from "@/lib/services/mock/helpers"
import type { TransactionService } from "@/lib/services/transaction.service"

export const mockTransactionService: TransactionService = {
  async listTransactions() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return clone(mockTransactions)
  },
  async sendTransaction(input) {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return {
      id: "tx-mock-submit",
      type: "send",
      amount: ccxAmount(input.amount),
      address: input.address,
      timestamp: "2026-05-22T03:00:00.000Z",
      confirmations: 0,
      paymentId: input.paymentId,
      message: input.message,
    }
  },
}
