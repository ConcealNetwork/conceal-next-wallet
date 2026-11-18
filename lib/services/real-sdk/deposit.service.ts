import {
  COIN_UNIT_PLACES,
  calculateDepositInterest,
  DEPOSIT_MAX_TERM_MONTH,
  DEPOSIT_MIN_AMOUNT_COIN,
  DEPOSIT_MIN_TERM_BLOCK,
  DEPOSIT_MIN_TERM_MONTH,
  DEPOSIT_TX_FEE,
  REMOTE_NODE_FEE_ATOMIC,
} from "conceal-wallet-sdk";
import { buildSpendTxMap } from "@/lib/deposits/deposit-status";
import type {
  CreateDepositInput,
  DepositConstraints,
  DepositService,
  PreviewCreateDepositInput,
  WithdrawDepositInput,
} from "@/lib/services/deposit.service";
import {
  estimateDepositInterest,
  estimateDepositUnlockDays,
  getDepositApr,
} from "@/lib/services/deposit.service";
import { enqueueAuto, enqueueHung, type IntentDraft } from "@/lib/services/real-sdk/send-intent";
import { deriveApr, mapDeposit, mapDeposits } from "@/lib/services/real-sdk/mappers";
import { unminedPendingRecords } from "@/lib/services/real-sdk/pending-store";
import { ensureSdkReady } from "@/lib/services/real-sdk/ready";
import { requireRuntime } from "@/lib/services/real-sdk/runtime";
import {
  resolveWithdrawableDeposit,
  runDepositPipeline,
  runWithdrawPipeline,
  safeNodeFeeAddress,
  selectableOutputs,
  selectableSpendTotal,
} from "@/lib/services/real-sdk/spend";
import { assertCanSpend } from "@/lib/services/view-only";
import type { Deposit, Transaction } from "@/lib/types";
import { walletCopy } from "@/lib/ui/wallet-copy";
import { ccxAmount } from "@/lib/utils";
import { isWalletHeightSyncing } from "@/lib/ui/wallet-sync";

const ATOMIC_PER_CCX = 10 ** COIN_UNIT_PLACES;

export const realSdkDepositService: DepositService = {
  async listDeposits(): Promise<Deposit[]> {
    await ensureSdkReady();
    const rt = requireRuntime();
    const networkHeight = await rt.daemon.getHeight();
    return mapDeposits(rt.state, networkHeight, rt.raw);
  },

  async getDepositConstraints(): Promise<DepositConstraints> {
    await ensureSdkReady();
    const rt = requireRuntime();
    const networkHeight = await rt.daemon.getHeight();
    // Budget the remote-node fee too, so the advertised max stays creatable
    // (createDeposit checks amount + DEPOSIT_TX_FEE + node fee against spendable).
    const feeAddress = await safeNodeFeeAddress(rt.daemon);
    const nodeFeeAtomic =
      feeAddress && feeAddress !== rt.account.address ? REMOTE_NODE_FEE_ATOMIC : 0;
    // Gate on the SAME selectable pool a real createDeposit would draw from (dry-run of
    // input selection: pretty, non-dust, unreserved outputs) — not the raw balance,
    // which counts dust and unmixable outputs a deposit tx can never spend.
    const selectableTotal = selectableSpendTotal(await selectableOutputs(rt));
    const maxDepositAmount = Math.max(
      0,
      Math.floor((selectableTotal - DEPOSIT_TX_FEE - nodeFeeAtomic) / ATOMIC_PER_CCX),
    );
    // Optimistic pending entry (#110): a deposit waits ~1 block for its first scan,
    // so state.deposits (mined blocks only) never sees it — read the pending store.
    const hasPendingDeposit = unminedPendingRecords(rt.raw, rt.state).some(
      (record) => record.type === "deposit",
    );
    // Sync check (±2 blocks, same helper as withdraw): creating a deposit while
    // the scan is behind the tip means we don't yet know the true selectable pool —
    // block it so the user never acts on stale fund information. Exposed on the
    // payload so UI reason copy uses this snapshot (not polled isSyncing, and not
    // inferred from maxDepositAmount — which is 0 before outputs are scanned).
    const isWalletSyncing = isWalletHeightSyncing(rt.state.scannedHeight, networkHeight);
    return {
      maxDepositAmount,
      isWalletSyncing,
      isDepositDisabled:
        rt.viewOnly || isWalletSyncing || maxDepositAmount < DEPOSIT_MIN_AMOUNT_COIN,
      hasPendingDeposit,
    };
  },

  async previewCreateDeposit(input: PreviewCreateDepositInput) {
    await ensureSdkReady();
    const rt = requireRuntime();
    const lockHeight = await rt.daemon.getHeight();
    const months = clampMonths(input.durationMonths);
    const termBlocks = months * DEPOSIT_MIN_TERM_BLOCK;
    const amountAtomic = Math.floor(input.amount) * ATOMIC_PER_CCX;
    const interestAtomic = calculateDepositInterest({
      amount: amountAtomic,
      term: termBlocks,
      lockHeight,
    });
    return {
      interestCcx: interestAtomic / ATOMIC_PER_CCX,
      indicativeApr: deriveApr(amountAtomic, interestAtomic, termBlocks),
    };
  },

  async createDeposit(input: CreateDepositInput): Promise<Deposit> {
    await ensureSdkReady();
    const rt = requireRuntime();
    assertCanSpend(rt.viewOnly, walletCopy.viewOnlyDepositDisabled);

    const amountCoins = Math.floor(input.amount);
    if (!Number.isFinite(amountCoins) || amountCoins < DEPOSIT_MIN_AMOUNT_COIN) {
      throw new Error(`Deposit amount must be at least ${DEPOSIT_MIN_AMOUNT_COIN} CCX.`);
    }
    const months = Math.floor(input.durationMonths);
    if (months < DEPOSIT_MIN_TERM_MONTH || months > DEPOSIT_MAX_TERM_MONTH) {
      throw new Error(
        `Deposit term must be between ${DEPOSIT_MIN_TERM_MONTH} and ${DEPOSIT_MAX_TERM_MONTH} months.`,
      );
    }

    const amountAtomic = amountCoins * ATOMIC_PER_CCX;
    const termBlocks = months * DEPOSIT_MIN_TERM_BLOCK;

    // Build + submit through the SAME classified pipeline the intent drain uses,
    // so a transient failure parks a session intent (queuedDepositView below)
    // instead of erroring, and the retry path cannot drift. Validation failures
    // above and a short balance still throw visibly.
    const result = await runDepositPipeline(
      rt,
      { amountAtomic, termBlocks },
      { gate: () => true },
    );
    if (!result.ok) {
      const failure = result.failure;
      if (failure.reason === "unfunded") {
        throw new Error("Not enough unlocked balance for deposit and network fee.");
      }
      if (failure.reason === "select") {
        throw failure.error;
      }
      const draft: IntentDraft = { kind: "deposit", amount: amountCoins, durationMonths: months };
      if (failure.reason === "submit" && failure.timedOut) {
        enqueueHung(rt, draft, failure.hash);
        return queuedDepositView(input, months, "hung", failure.hash);
      }
      // A decoy/connect failure (and an unreachable skip — the gate is always live
      // interactively) parks an auto intent.
      const row = enqueueAuto(rt, draft, failure.reason === "decoy" ? "decoy" : "submit");
      return queuedDepositView(input, months, "auto", row.id);
    }
    const builtHash = result.sent.hash;

    const networkHeight = await rt.daemon.getHeight();
    const matched = mapDeposits(rt.state, networkHeight, rt.raw).find(
      (deposit) => deposit.txHash === builtHash,
    );
    if (matched) return matched;

    // Optimistic pending entry until the deposit confirms and scans in.
    const interestAtomic = calculateDepositInterest({
      amount: amountAtomic,
      term: termBlocks,
      lockHeight: networkHeight,
    });
    return mapDeposit(
      {
        amount: amountAtomic,
        globalIndex: 0,
        outputIndex: 0,
        txPublicKey: "",
        publicKey: "",
        keys: [],
        term: termBlocks,
        blockHeight: 0,
        txHash: builtHash,
        interest: interestAtomic,
        unlockHeight: termBlocks,
      },
      networkHeight,
      rt.account.address,
      rt.state,
      buildSpendTxMap(rt.state, rt.raw),
    );
  },

  async withdrawDeposit(input: WithdrawDepositInput): Promise<Transaction> {
    await ensureSdkReady();
    const rt = requireRuntime();
    assertCanSpend(rt.viewOnly, walletCopy.viewOnlyDepositDisabled);

    const networkHeight = await rt.daemon.getHeight();
    const check = resolveWithdrawableDeposit(rt, input, networkHeight);
    if (!check.ok) {
      // Visible interactive errors — the drain maps these to silent unfunded drops.
      if (check.reason === "pending") {
        throw new Error("A withdrawal for this deposit is already pending confirmation.");
      }
      if (check.reason === "locked") {
        throw new Error("Deposit is still locked.");
      }
      throw new Error("Deposit not found or already withdrawn.");
    }

    const draft: IntentDraft = {
      kind: "withdraw",
      txHash: input.txHash,
      globalOutputIndex: input.globalOutputIndex,
    };
    const result = await runWithdrawPipeline(
      rt,
      { deposit: check.deposit, txHash: input.txHash, globalOutputIndex: input.globalOutputIndex },
      { gate: () => true },
    );
    if (!result.ok) {
      const failure = result.failure;
      if (failure.reason === "skip") {
        throw new Error("Deposit not found or already withdrawn.");
      }
      if (failure.reason === "submit" && failure.timedOut) {
        enqueueHung(rt, draft, failure.hash);
        return queuedWithdrawView("hung", failure.hash);
      }
      const row = enqueueAuto(rt, draft, failure.reason === "decoy" ? "decoy" : "submit");
      return queuedWithdrawView("auto", row.id);
    }
    const builtHash = result.sent.hash;

    return {
      id: builtHash,
      hash: builtHash,
      type: "withdrawal",
      amount: { atomic: result.sent.sentAmount },
      address: rt.account.address,
      timestamp: new Date().toISOString(),
      blockHeight: 0,
      confirmations: 0,
    };
  },
};

/**
 * Transient view for a merely-parked deposit: display-only (the page toasts and
 * invalidates), so the interest figures reuse the pure estimate helpers instead
 * of a live getHeight that could hang on the same broken link that parked it.
 */
function queuedDepositView(
  input: CreateDepositInput,
  months: number,
  queued: "auto" | "hung",
  txHash: string,
): Deposit {
  const interest = estimateDepositInterest(input.amount, months);
  return {
    id: `${txHash}:0`,
    txHash,
    globalOutputIndex: 0,
    amount: ccxAmount(Math.floor(input.amount)),
    status: "active",
    durationMonths: months,
    apr: getDepositApr(months),
    interest: ccxAmount(interest),
    unlocksInDays: estimateDepositUnlockDays(months),
    progressPct: 0,
    address: requireRuntime().account.address,
    queued,
  };
}

function queuedWithdrawView(queued: "auto" | "hung", txHash: string): Transaction {
  return {
    id: txHash,
    hash: txHash,
    type: "withdrawal",
    amount: ccxAmount(0),
    address: requireRuntime().account.address,
    timestamp: new Date().toISOString(),
    blockHeight: 0,
    confirmations: 0,
    queued,
  };
}

/** Clamp a requested deposit term to the supported month range. */
function clampMonths(durationMonths: number): number {
  const months = Math.floor(durationMonths);
  if (months < DEPOSIT_MIN_TERM_MONTH) return DEPOSIT_MIN_TERM_MONTH;
  if (months > DEPOSIT_MAX_TERM_MONTH) return DEPOSIT_MAX_TERM_MONTH;
  return months;
}
