/**
 * Wallet-core deposit status parity (`Deposit.getStatus`, `Wallet.addWithdrawal`,
 * `Wallet.lockedDeposits` / `Wallet.unlockedDeposits`). Engine-free — reads SDK
 * {@link WalletState} plus optional legacy blob fields (`deposits[].spentTx`,
 * `withdrawals[]`).
 */
import {
  getTransactions,
  type OwnedDeposit,
  type RawWalletV1,
  depRef as sdkDepRef,
  type WalletState,
} from "conceal-wallet-sdk";
import type { DepositStatus } from "@/lib/types";

export const depRef = sdkDepRef;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Creation block height — falls back to the mined deposit tx when scan stored 0. */
export function resolveDepHeight(deposit: OwnedDeposit, state: WalletState): number {
  if (deposit.blockHeight > 0) return deposit.blockHeight;
  const tx = getTransactions(state).find(
    (entry) => entry.hash === deposit.txHash && entry.kind === "deposit",
  );
  return tx?.height ?? deposit.blockHeight;
}

interface WithdrawMeta {
  txHash: string;
  amount: number;
  globalOutputIndex: number;
  withdrawPending: boolean;
}

function readWithdrawMeta(raw?: RawWalletV1): WithdrawMeta[] {
  if (!raw || !Array.isArray(raw.withdrawals)) return [];
  const list: WithdrawMeta[] = [];
  for (const entry of raw.withdrawals) {
    if (!isRecord(entry)) continue;
    list.push({
      txHash: str(entry.txHash),
      amount: num(entry.amount),
      globalOutputIndex: num(entry.globalOutputIndex),
      withdrawPending: entry.withdrawPending === true,
    });
  }
  return list;
}

/**
 * Per-deposit spend tx hash (wallet-core `spentTx`). Key = {@link depRef}.
 * Matches `Wallet.addWithdrawal`: pending flag, then principal + global index.
 */
export function buildSpendTxMap(
  state: WalletState,
  raw?: RawWalletV1,
  pendingRefs?: ReadonlySet<string>,
): Map<string, string> {
  const map = new Map<string, string>();

  if (raw && Array.isArray(raw.deposits)) {
    for (const entry of raw.deposits) {
      if (!isRecord(entry)) continue;
      const spentTx = str(entry.spentTx);
      const txHash = str(entry.txHash);
      if (spentTx && txHash) {
        map.set(`${txHash}:${num(entry.globalOutputIndex)}`, spentTx);
      }
    }
  }

  const pending = pendingRefs ?? new Set<string>();

  const tryAssign = (
    principal: number,
    globalIdx: number,
    wtxHash: string,
    onlyPending: boolean,
  ) => {
    if (!wtxHash) return;
    const dep = state.deposits.find((d) => {
      if (map.has(depRef(d))) return false;
      if (d.amount !== principal || d.globalIndex !== globalIdx) return false;
      return onlyPending ? pending.has(depRef(d)) : true;
    });
    if (dep) map.set(depRef(dep), wtxHash);
  };

  for (const meta of readWithdrawMeta(raw)) {
    if (meta.withdrawPending) {
      tryAssign(meta.amount, meta.globalOutputIndex, meta.txHash, true);
    }
  }
  for (const meta of readWithdrawMeta(raw)) {
    tryAssign(meta.amount, meta.globalOutputIndex, meta.txHash, false);
  }

  const withdrawalTxs = getTransactions(state)
    .filter((t) => t.kind === "withdrawal")
    .sort((a, b) => a.height - b.height || a.hash.localeCompare(b.hash));

  for (const wtx of withdrawalTxs) {
    if ([...map.values()].includes(wtx.hash)) continue;

    const unmapped = state.deposits.filter((d) => !map.has(depRef(d)));
    const spentCandidates = unmapped.filter((d) => state.spentDepositRefs.includes(depRef(d)));

    let dep: OwnedDeposit | undefined;
    if (spentCandidates.length === 1) {
      dep = spentCandidates[0];
    } else if (spentCandidates.length > 1) {
      const matured = spentCandidates.filter(
        (d) => resolveDepHeight(d, state) + d.term <= wtx.height,
      );
      dep =
        matured.length === 1
          ? matured[0]
          : matured.sort((a, b) => resolveDepHeight(a, state) - resolveDepHeight(b, state))[0];
    }

    if (dep) map.set(depRef(dep), wtx.hash);
  }

  return map;
}

export function isDepSpent(
  deposit: OwnedDeposit,
  state: WalletState,
  spendMap: ReadonlyMap<string, string>,
): boolean {
  const ref = depRef(deposit);
  if (state.spentDepositRefs.includes(ref)) return true;
  const spentTx = spendMap.get(ref);
  return typeof spentTx === "string" && spentTx.length > 0;
}

/** Mirrors wallet-core `Deposit.getStatus` → UI {@link DepositStatus}. */
export function uiDepStatus(
  deposit: OwnedDeposit,
  networkHeight: number,
  state: WalletState,
  spendMap: ReadonlyMap<string, string>,
): DepositStatus {
  if (isDepSpent(deposit, state, spendMap)) return "spent";
  const unlockHeight = resolveDepHeight(deposit, state) + deposit.term;
  if (networkHeight >= unlockHeight) return "unlocked";
  return "active";
}
