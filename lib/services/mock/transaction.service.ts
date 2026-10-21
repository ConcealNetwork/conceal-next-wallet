import { mockTransactions, mockWalletInfo } from "@/lib/mock-data/wallet";
import { clone, mockDelay } from "@/lib/services/mock/helpers";
import { isMockViewOnly } from "@/lib/services/mock/wallet.service";
import type { SdkRuntime } from "@/lib/services/real-sdk/runtime-registry";
import {
  cancelIntent,
  clearIntents,
  enqueueAuto,
  enqueueHung,
  type FailCause,
  type FailNote,
  listIntents,
  mapIntent,
  markHungSent,
  noteDecoyFail,
  noteSubmitFail,
  type SendIntent,
} from "@/lib/services/real-sdk/send-intent";
import type { SendTransactionInput, TransactionService } from "@/lib/services/transaction.service";
import { assertCanSpend } from "@/lib/services/view-only";
import type { Transaction } from "@/lib/types";
import { walletCopy } from "@/lib/ui/wallet-copy";
import { ccxAmount, ccxToNumber } from "@/lib/utils";

const mockRt = {} as SdkRuntime;

type MockSendKind = "decoy" | "submit" | "hung" | "unfunded" | "ok";

let armedKind: MockSendKind | undefined;
let hungSeq = 0;
const seenHashes = new Set<string>();

function nextHung(): string {
  hungSeq += 1;
  return `hung-${hungSeq}`;
}

function mockSent(input: SendTransactionInput, hash?: string): Transaction {
  return {
    id: "tx-mock-submit",
    hash: hash ?? "0b7f26f4c5b748c28e91f67627c5f85bb295dd2bf2638d7ef8b2f035e7c71155",
    type: "send",
    amount: ccxAmount(input.amount),
    address: input.address,
    timestamp: "2026-05-22T03:00:00.000Z",
    blockHeight: 0,
    confirmations: 0,
    paymentId: input.paymentId,
    message: input.message,
  };
}

/** Test-only reset so armed fails and session intents do not leak across suites. */
export function _resetMockIntents(): void {
  clearIntents(mockRt);
  armedKind = undefined;
  seenHashes.clear();
}

/** Test-only: treat `hash` as already in scanned or mempool history. */
export function _seeMockHash(hash: string): void {
  seenHashes.add(hash);
}

/** Test-only: next `sendTransaction` only. Default / `"ok"` is today's success. */
export function _armMockSend(kind: MockSendKind = "ok"): void {
  armedKind = kind;
}

/** Test-only stand-in for a failed rebuild so mock caps are not library-only. */
export function _failMockRebuild(id: string, cause: FailCause): FailNote {
  return cause === "decoy" ? noteDecoyFail(mockRt, id) : noteSubmitFail(mockRt, id);
}

/** Test-only raw store rows for the dummy mock runtime. */
export function _listMockIntents(): SendIntent[] {
  return listIntents(mockRt);
}

export const mockTransactionService: TransactionService = {
  async listTransactions() {
    await mockDelay();
    return clone(mockTransactions);
  },
  async sendTransaction(input) {
    await mockDelay();
    const kind = armedKind ?? "ok";
    armedKind = undefined;
    assertCanSpend(isMockViewOnly(), walletCopy.viewOnlySendDisabled);

    const available = ccxToNumber(mockWalletInfo.available);
    if (kind === "unfunded" || input.amount > available) {
      throw new Error("Amount exceeds available balance.");
    }

    if (kind === "decoy") {
      enqueueAuto(mockRt, input, "decoy");
      return { ...mockSent(input), queued: "auto" };
    }
    if (kind === "submit") {
      enqueueAuto(mockRt, input, "submit");
      return { ...mockSent(input), queued: "auto" };
    }
    if (kind === "hung") {
      const localHash = nextHung();
      enqueueHung(mockRt, input, localHash);
      return { ...mockSent(input, localHash), queued: "hung" };
    }
    return mockSent(input);
  },
  async listQueuedTransactions() {
    await mockDelay();
    return listIntents(mockRt).map((row) => mapIntent(row));
  },
  async cancelQueuedTransaction(id: string) {
    await mockDelay();
    return cancelIntent(mockRt, id);
  },
  async submitHungIntent(id: string) {
    await mockDelay();
    const row = listIntents(mockRt).find((intent) => intent.id === id);
    if (row?.kind !== "hung") return false;
    if (row.sent) return true;
    if (row.watchedHash && seenHashes.has(row.watchedHash)) {
      markHungSent(mockRt, id);
      return true;
    }
    const kind = armedKind ?? "ok";
    armedKind = undefined;
    if (kind === "hung") {
      row.watchedHash = nextHung();
      return true;
    }
    if (kind === "decoy" || kind === "submit") {
      if (kind === "decoy") noteDecoyFail(mockRt, id);
      else noteSubmitFail(mockRt, id);
      return true;
    }
    cancelIntent(mockRt, id);
    return true;
  },
};
