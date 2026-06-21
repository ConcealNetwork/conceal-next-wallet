import { mockTransactions } from "@/lib/mock-data/wallet";
import { clone, mockDelay } from "@/lib/services/mock/helpers";
import { isMockViewOnly } from "@/lib/services/mock/wallet.service";
import type { TransactionService } from "@/lib/services/transaction.service";
import { assertCanSpend } from "@/lib/services/view-only";
import type { QueuedTransaction } from "@/lib/types";
import { walletCopy } from "@/lib/ui/wallet-copy";
import { ccxAmount } from "@/lib/utils";

// One demo entry (#92) so the outbound-queue UI is visible + dismissable in mock mode.
let mockQueued: QueuedTransaction[] = [
  {
    id: "f1e2d3c4b5a6978869504132231415060718293a4b5c6d7e8f90a1b2c3d4e5f60",
    hash: "f1e2d3c4b5a6978869504132231415060718293a4b5c6d7e8f90a1b2c3d4e5f60",
    state: "failed",
    attempts: 3,
    enqueuedAt: Date.parse("2026-05-22T02:55:00.000Z"),
    label: "Send 12.5 CCX",
    lastError: "Connection lost during broadcast",
    failedReason: "expired",
  },
];

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
  async listQueuedTransactions() {
    await mockDelay();
    return clone(mockQueued);
  },
  async cancelQueuedTransaction(id: string) {
    await mockDelay();
    const before = mockQueued.length;
    mockQueued = mockQueued.filter((entry) => entry.id !== id);
    return mockQueued.length !== before;
  },
};
