import { mockTransactions } from "@/lib/mock-data/wallet";
import { ccxAmount } from "@/lib/utils";
import { clone, mockDelay } from "@/lib/services/mock/helpers";
import { isMockViewOnly } from "@/lib/services/mock/wallet.service";
import type { TransactionService } from "@/lib/services/transaction.service";
import { assertCanSpend } from "@/lib/services/view-only";
import { walletCopy } from "@/lib/ui/wallet-copy";

export const mockTransactionService: TransactionService = {
  async listTransactions() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay();
    return clone(mockTransactions);
  },
  async sendTransaction(input) {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay();
    assertCanSpend(isMockViewOnly(), walletCopy.viewOnlySendDisabled);
    return {
      id: "tx-mock-submit",
      // TODO(backend): replace mock hash with the walletd transaction hash.
      hash: "0b7f26f4c5b748c28e91f67627c5f85bb295dd2bf2638d7ef8b2f035e7c71155",
      type: "send",
      amount: ccxAmount(input.amount),
      address: input.address,
      timestamp: "2026-05-22T03:00:00.000Z",
      blockHeight: 0,
      confirmations: 0,
      paymentId: input.paymentId,
      message: input.message,
    };
  },
};
