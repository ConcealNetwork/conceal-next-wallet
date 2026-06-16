import { MOCK_ADDRESS, mockDeposits } from "@/lib/mock-data/wallet";
import { ccxAmount } from "@/lib/utils";
import { clone, mockDelay } from "@/lib/services/mock/helpers";
import { isMockViewOnly } from "@/lib/services/mock/wallet.service";
import {
  estimateDepositInterest,
  estimateDepositUnlockDays,
  getDepositApr,
  type DepositService,
} from "@/lib/services/deposit.service";
import { assertCanSpend } from "@/lib/services/view-only";
import { walletCopy } from "@/lib/ui/wallet-copy";

export const mockDepositService: DepositService = {
  async listDeposits() {
    await mockDelay();
    return clone(mockDeposits);
  },
  async getDepositConstraints() {
    await mockDelay();
    return {
      maxDepositAmount: 10_000,
      isDepositDisabled: false,
      isWalletSyncing: false,
      hasPendingDeposit: false,
    };
  },
  async previewCreateDeposit(input) {
    await mockDelay();
    const interestCcx = estimateDepositInterest(input.amount, input.durationMonths);
    return {
      interestCcx,
      indicativeApr: getDepositApr(input.durationMonths),
    };
  },
  async createDeposit(input) {
    await mockDelay();
    assertCanSpend(isMockViewOnly(), walletCopy.viewOnlyDepositDisabled);
    return {
      id: "dep-mock-submit",
      txHash: "mock-deposit-tx-hash",
      globalOutputIndex: 0,
      amount: ccxAmount(input.amount),
      status: "active",
      durationMonths: input.durationMonths,
      apr: getDepositApr(input.durationMonths),
      interest: ccxAmount(estimateDepositInterest(input.amount, input.durationMonths)),
      unlocksInDays: estimateDepositUnlockDays(input.durationMonths),
      progressPct: 0,
      address: MOCK_ADDRESS,
    };
  },
  async withdrawDeposit() {
    await mockDelay();
    assertCanSpend(isMockViewOnly(), walletCopy.viewOnlyDepositDisabled);
    return {
      id: "mock-withdrawal-tx",
      hash: "mock-withdrawal-tx-hash",
      type: "withdrawal",
      amount: ccxAmount(0),
      address: MOCK_ADDRESS,
      timestamp: new Date().toISOString(),
      blockHeight: 0,
      confirmations: 0,
    };
  },
};
