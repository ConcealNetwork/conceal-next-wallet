import { MOCK_ADDRESS, mockDeposits, mockWalletInfo } from "@/lib/mock-data/wallet";
import {
  type DepositService,
  estimateDepositInterest,
  estimateDepositUnlockDays,
  getDepositApr,
} from "@/lib/services/deposit.service";
import { clone, mockDelay } from "@/lib/services/mock/helpers";
import { mockIntentRuntime } from "@/lib/services/mock/transaction.service";
import { isMockViewOnly } from "@/lib/services/mock/wallet.service";
import {
  clearIntents,
  enqueueAuto,
  enqueueHung,
  type IntentDraft,
  savedWithdrawKeys,
} from "@/lib/services/real-sdk/send-intent";
import { assertCanSpend } from "@/lib/services/view-only";
import { walletCopy } from "@/lib/ui/wallet-copy";
import { ccxAmount, ccxToNumber } from "@/lib/utils";

type MockDepositKind = "ok" | "decoy" | "hung";

let armedDeposit: MockDepositKind | undefined;
let depositParkSeq = 0;

/** Test-only: next createDeposit parks an intent instead of succeeding. */
export function _armMockDeposit(kind: MockDepositKind = "ok"): void {
  armedDeposit = kind === "ok" ? undefined : kind;
}

/** Test-only disarm (parked rows live on the shared mock runtime store). */
export function _disarmMockDeposit(): void {
  armedDeposit = undefined;
  clearIntents(mockIntentRuntime);
}

function mockDepositView(input: { amount: number; durationMonths: number }) {
  return {
    txHash: "mock-deposit-tx-hash",
    globalOutputIndex: 0,
    amount: ccxAmount(input.amount),
    status: "active" as const,
    durationMonths: input.durationMonths,
    apr: getDepositApr(input.durationMonths),
    interest: ccxAmount(estimateDepositInterest(input.amount, input.durationMonths)),
    unlocksInDays: estimateDepositUnlockDays(input.durationMonths),
    progressPct: 0,
    address: MOCK_ADDRESS,
  };
}

export const mockDepositService: DepositService = {
  async listDeposits() {
    await mockDelay();
    const saved = savedWithdrawKeys(mockIntentRuntime);
    return clone(mockDeposits).map((deposit) =>
      saved.has(`${deposit.txHash}:${deposit.globalOutputIndex}`)
        ? { ...deposit, withdrawPending: true }
        : deposit,
    );
  },
  async getDepositConstraints() {
    await mockDelay();
    return {
      maxDepositAmount: 10_000,
      isWalletSyncing: false,
      isDepositDisabled: isMockViewOnly(),
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
    // Mirror the real service: an unfunded interactive deposit throws, never parks.
    if (input.amount > ccxToNumber(mockWalletInfo.available)) {
      throw new Error("Not enough unlocked balance for deposit and network fee.");
    }
    const months = Math.floor(input.durationMonths);
    const kind = armedDeposit ?? "ok";
    armedDeposit = undefined;
    const view = mockDepositView({ amount: Math.floor(input.amount), durationMonths: months });
    if (kind !== "ok") {
      const draft: IntentDraft = {
        kind: "deposit",
        amount: Math.floor(input.amount),
        durationMonths: months,
      };
      if (kind === "hung") {
        depositParkSeq += 1;
        const hash = `mock-hung-deposit-${depositParkSeq}`;
        enqueueHung(mockIntentRuntime, draft, hash);
        return { ...view, id: `${hash}:0`, txHash: hash, queued: "hung" as const };
      }
      const row = enqueueAuto(mockIntentRuntime, draft, kind);
      return { ...view, id: `${row.id}:0`, txHash: row.id, queued: "auto" as const };
    }
    return {
      ...view,
      id: "dep-mock-submit",
      txHash: "mock-deposit-tx-hash",
    };
  },
  async withdrawDeposit(input) {
    await mockDelay();
    assertCanSpend(isMockViewOnly(), walletCopy.viewOnlyDepositDisabled);
    if (savedWithdrawKeys(mockIntentRuntime).has(`${input.txHash}:${input.globalOutputIndex}`)) {
      throw new Error(walletCopy.withdrawAlreadyPending);
    }
    const kind = armedDeposit ?? "ok";
    armedDeposit = undefined;
    if (kind !== "ok") {
      const draft: IntentDraft = {
        kind: "withdraw",
        txHash: input.txHash,
        globalOutputIndex: input.globalOutputIndex,
      };
      if (kind === "hung") {
        depositParkSeq += 1;
        const hash = `mock-hung-withdraw-${depositParkSeq}`;
        enqueueHung(mockIntentRuntime, draft, hash);
        return { ...mockWithdrawView, id: hash, hash, queued: "hung" as const };
      }
      const row = enqueueAuto(mockIntentRuntime, draft, kind);
      return { ...mockWithdrawView, id: row.id, hash: row.id, queued: "auto" as const };
    }
    return mockWithdrawView;
  },
};

const mockWithdrawView = {
  id: "mock-withdrawal-tx",
  hash: "mock-withdrawal-tx-hash",
  type: "withdrawal" as const,
  amount: ccxAmount(0),
  address: MOCK_ADDRESS,
  timestamp: new Date().toISOString(),
  blockHeight: 0,
  confirmations: 0,
};
