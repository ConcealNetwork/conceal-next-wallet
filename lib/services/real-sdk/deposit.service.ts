import {
  COIN_UNIT_PLACES,
  calculateDepositInterest,
  DEPOSIT_MAX_TERM_MONTH,
  DEPOSIT_MIN_AMOUNT_COIN,
  DEPOSIT_MIN_TERM_BLOCK,
  DEPOSIT_MIN_TERM_MONTH,
  DEPOSIT_SMALL_WITHDRAW_FEE,
  DEPOSIT_TX_FEE,
  getBalance,
  REMOTE_NODE_FEE_ATOMIC,
  transactions as txns,
} from "conceal-wallet-sdk";
import { buildSpendTxMap, isDepSpent, uiDepStatus } from "@/lib/deposits/deposit-status";
import type {
  CreateDepositInput,
  DepositConstraints,
  DepositService,
  PreviewCreateDepositInput,
  WithdrawDepositInput,
} from "@/lib/services/deposit.service";
import { deriveApr, mapDeposit, mapDeposits } from "@/lib/services/real-sdk/mappers";
import {
  addPendingRecord,
  pendingWithdrawnDepositKeys,
} from "@/lib/services/real-sdk/pending-store";
import { ensureSdkReady } from "@/lib/services/real-sdk/ready";
import { persist, requireRuntime } from "@/lib/services/real-sdk/runtime";
import {
  broadcast,
  decodeFeeRecipient,
  fetchDecoys,
  MIXIN,
  ownKeys,
  safeNodeFeeAddress,
  selectableOutputs,
} from "@/lib/services/real-sdk/spend";
import { assertCanSpend } from "@/lib/services/view-only";
import type { Deposit, Transaction } from "@/lib/types";
import { walletCopy } from "@/lib/ui/wallet-copy";

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
    const balance = getBalance(rt.state);
    // Budget the remote-node fee too, so the advertised max stays creatable
    // (createDeposit checks amount + DEPOSIT_TX_FEE + node fee against spendable).
    const feeAddress = await safeNodeFeeAddress(rt.daemon);
    const nodeFeeAtomic =
      feeAddress && feeAddress !== rt.account.address ? REMOTE_NODE_FEE_ATOMIC : 0;
    const maxDepositAmount = Math.max(
      0,
      Math.floor((balance.spendable - DEPOSIT_TX_FEE - nodeFeeAtomic) / ATOMIC_PER_CCX),
    );
    const isWalletSyncing = rt.state.scannedHeight < networkHeight;
    const hasPendingDeposit = rt.state.deposits.some(
      (deposit) =>
        deposit.blockHeight === 0 &&
        !isDepSpent(deposit, rt.state, buildSpendTxMap(rt.state, rt.raw)),
    );
    return {
      maxDepositAmount,
      isDepositDisabled: rt.viewOnly || maxDepositAmount < DEPOSIT_MIN_AMOUNT_COIN,
      isWalletSyncing,
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

    // Resolve the remote-node fee BEFORE the balance check so its destination is
    // counted — same guard as sendTransaction/sendMessage (fee address from the
    // untrusted node; bounded to the donation address when undecodable).
    const feeAddress = await safeNodeFeeAddress(rt.daemon);
    let nodeFee: { spendPublicKey: string; viewPublicKey: string } | null = null;
    if (feeAddress && feeAddress !== rt.account.address) {
      const decoded = decodeFeeRecipient(feeAddress);
      nodeFee = {
        spendPublicKey: decoded.spendPublicKey,
        viewPublicKey: decoded.viewPublicKey,
        // amount omitted — the SDK defaults to REMOTE_NODE_FEE_ATOMIC
      };
    }
    const nodeFeeAtomic = nodeFee ? REMOTE_NODE_FEE_ATOMIC : 0;

    const balance = getBalance(rt.state);
    if (amountAtomic + DEPOSIT_TX_FEE + nodeFeeAtomic > balance.spendable) {
      throw new Error("Not enough unlocked balance for deposit and network fee.");
    }

    const outputs = await selectableOutputs(rt);
    const target = amountAtomic + DEPOSIT_TX_FEE + nodeFeeAtomic;
    const { selected } = txns.selectInputs(outputs, target);
    const decoys = await fetchDecoys(rt, selected);
    const built = txns.buildDepositTransaction({
      keys: rt.account.keys,
      amount: amountAtomic,
      termBlocks,
      ownKeys: ownKeys(rt),
      unspentOutputs: selected,
      decoys,
      fee: DEPOSIT_TX_FEE,
      mixin: MIXIN,
      nodeFee,
    });

    await broadcast(rt, built);

    // Optimistic pending entry (#110): mirror the send path so the deposit's inputs are
    // locked against re-selection until it mines (otherwise a second spend in the
    // mempool window builds on already-spent inputs and is rejected at relay), the
    // balance reflects the outflow immediately, and the outgoing tx shows in history
    // (typed "deposit"). Reconciles/expires via prunePendingRecords like a send.
    rt.raw = addPendingRecord(rt.raw, {
      hash: built.hash,
      type: "deposit",
      amountAtomic: amountAtomic + DEPOSIT_TX_FEE + nodeFeeAtomic,
      timestampIso: new Date().toISOString(),
      address: rt.account.address,
      spentKeyImages: built.inputs.map((vin) => vin.keyImage),
    });
    try {
      await persist();
    } catch {
      // Non-fatal: the tx is already relayed (broadcast persisted state), so failing the
      // create here would invite a retry → double-spend. Losing only the optimistic
      // pending record is acceptable; the next sync reconciles it.
    }

    const networkHeight = await rt.daemon.getHeight();
    const matched = mapDeposits(rt.state, networkHeight, rt.raw).find(
      (deposit) => deposit.txHash === built.hash,
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
        txPublicKey: built.txPublicKey,
        publicKey: built.outputs[0]?.publicKey ?? "",
        keys: [built.outputs[0]?.publicKey ?? ""],
        term: termBlocks,
        blockHeight: 0,
        txHash: built.hash,
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

    // A withdraw spends a DEPOSIT output (selected by txHash + globalIndex), which sits
    // outside the pending-key-image lock on regular unspent outputs — so without this
    // gate, a second withdraw of the same deposit in the mempool window would re-select
    // it and be rejected at relay (#110, withdraw half). Lifts once the prior tx mines
    // and its pending record prunes.
    if (pendingWithdrawnDepositKeys(rt.raw).has(`${input.txHash}:${input.globalOutputIndex}`)) {
      throw new Error("A withdrawal for this deposit is already pending confirmation.");
    }

    const networkHeight = await rt.daemon.getHeight();
    const spendMap = buildSpendTxMap(rt.state, rt.raw, pendingWithdrawnDepositKeys(rt.raw));
    const owned = rt.state.deposits.find(
      (entry) => entry.txHash === input.txHash && entry.globalIndex === input.globalOutputIndex,
    );
    if (!owned) {
      throw new Error("Deposit not found or already withdrawn.");
    }
    if (isDepSpent(owned, rt.state, spendMap)) {
      throw new Error("Deposit not found or already withdrawn.");
    }
    const status = uiDepStatus(owned, networkHeight, rt.state, spendMap);
    if (status === "active") {
      throw new Error("Deposit is still locked.");
    }
    const deposit = owned;

    const built = txns.buildWithdrawTransaction({
      keys: rt.account.keys,
      deposit,
      ownKeys: ownKeys(rt),
      // The SDK defaults this to DEPOSIT_SMALL_WITHDRAW_FEE; pass it explicitly so
      // the withdraw fee stays correct even if the SDK default ever changes.
      withdrawFee: DEPOSIT_SMALL_WITHDRAW_FEE,
    });

    await broadcast(rt, built);

    // Optimistic pending entry (#110, withdraw half): mirror createDeposit so the
    // outgoing tx shows in history immediately (typed "withdrawal", an incoming tx),
    // and — crucially — record the deposit identity so the guard above blocks a repeat
    // withdraw of the same deposit until this tx mines and prunes. Excluded from
    // pendingOut (it's not an outbound balance hold) via the type filter.
    rt.raw = addPendingRecord(rt.raw, {
      hash: built.hash,
      type: "withdrawal",
      amountAtomic: built.sentAmount,
      timestampIso: new Date().toISOString(),
      address: rt.account.address,
      spentKeyImages: built.inputs.map((vin) => vin.keyImage),
      depositRef: { txHash: input.txHash, globalIndex: input.globalOutputIndex },
    });
    try {
      await persist();
    } catch {
      // Non-fatal: the tx is already relayed (broadcast persisted state), so failing the
      // withdraw here would invite a retry → double-spend. Losing only the optimistic
      // pending record is acceptable; the next sync reconciles it.
    }

    return {
      id: built.hash,
      hash: built.hash,
      type: "withdrawal",
      amount: { atomic: built.sentAmount },
      address: rt.account.address,
      timestamp: new Date().toISOString(),
      blockHeight: 0,
      confirmations: 0,
    };
  },
};

/** Clamp a requested deposit term to the supported month range. */
function clampMonths(durationMonths: number): number {
  const months = Math.floor(durationMonths);
  if (months < DEPOSIT_MIN_TERM_MONTH) return DEPOSIT_MIN_TERM_MONTH;
  if (months > DEPOSIT_MAX_TERM_MONTH) return DEPOSIT_MAX_TERM_MONTH;
  return months;
}
