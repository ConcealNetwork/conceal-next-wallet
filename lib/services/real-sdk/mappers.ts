/**
 * Pure mappers from the SDK's wallet model ({@link WalletState}, {@link OwnedDeposit},
 * built/scanned transactions) to the app's UI types (`WalletInfo`, `Transaction`,
 * `Deposit`, `Message`). No network, no runtime, no `lib/wallet-core` — these are
 * the SDK-engine analogue of `lib/wallet-core/mappers.ts`.
 */
import {
  DEPOSIT_MIN_TERM_BLOCK,
  getBalance,
  getLockedDeposits,
  getTransactions,
  getUnlockedDeposits,
  getUnspentOutputs,
  type OwnedDeposit,
  type WalletState,
  type WalletTransaction,
} from "conceal-wallet-sdk";
import { AVG_BLOCK_TIME_SECONDS } from "@/lib/config/config";
import { type PendingTxRecord, readPendingRecords } from "@/lib/services/real-sdk/pending-store";
import {
  type IncomingPendingRecord,
  incomingPendingAtomic,
} from "@/lib/services/real-sdk/incoming-pending-store";
import type { SdkRuntime } from "@/lib/services/real-sdk/runtime";
import { buildMessageThreadKey } from "@/lib/messages/thread-key";
import type { CcxAmount, Deposit, Transaction, TransactionType, WalletInfo } from "@/lib/types";

const SECONDS_PER_DAY = 86_400;

/** Wrap an atomic integer in the {@link CcxAmount} shape. */
export function atomic(value: number): CcxAmount {
  return { atomic: Math.max(0, Math.round(value)) };
}

/** Confirmations for a transaction at `txHeight` given the current `networkHeight`. */
function confirmationsFor(txHeight: number, networkHeight: number): number {
  if (txHeight <= 0) return 0;
  return Math.max(0, networkHeight - txHeight + 1);
}

/** ISO timestamp from a unix-seconds value, or `now` when absent. */
function isoFromUnix(seconds?: number): string {
  const ms = typeof seconds === "number" && seconds > 0 ? seconds * 1000 : Date.now();
  return new Date(ms).toISOString();
}

/** Map one SDK history entry to the UI {@link Transaction}. */
export function mapTransaction(tx: WalletTransaction, networkHeight: number): Transaction {
  const type: TransactionType = tx.direction === "out" ? "send" : "receive";
  return {
    id: tx.hash,
    hash: tx.hash,
    type,
    amount: atomic(tx.amount),
    address: "",
    timestamp: isoFromUnix(tx.timestamp),
    blockHeight: tx.height,
    confirmations: confirmationsFor(tx.height, networkHeight),
  };
}

/** Map an optimistic pending (broadcast, not-yet-mined) outbound tx to the UI shape. */
export function mapPendingTransaction(record: PendingTxRecord): Transaction {
  return {
    id: record.hash,
    hash: record.hash,
    type: record.type ?? "send",
    amount: atomic(record.amountAtomic),
    address: record.address,
    timestamp: record.timestampIso,
    blockHeight: 0,
    confirmations: 0,
    ...(record.paymentId ? { paymentId: record.paymentId } : {}),
  };
}

/** Map an incoming-pending (mempool) record to a 0-conf RECEIVE row (#109). */
export function mapIncomingPendingTransaction(record: IncomingPendingRecord): Transaction {
  return {
    id: record.hash,
    hash: record.hash,
    type: "receive",
    amount: atomic(record.amountAtomic),
    address: "",
    timestamp: record.timestampIso,
    blockHeight: 0,
    confirmations: 0,
    ...(record.paymentId ? { paymentId: record.paymentId } : {}),
  };
}

/**
 * Map the wallet's transaction history (newest first) to UI transactions, with any
 * optimistic pending sends AND owned incoming-pending (mempool) txs shown FIRST
 * (0 confirmations) until the scanned tx of the same hash supersedes them (#96/#109).
 */
export function mapTransactions(
  state: WalletState,
  networkHeight: number,
  pending: readonly PendingTxRecord[] = [],
  incoming: readonly IncomingPendingRecord[] = [],
): Transaction[] {
  const scanned = getTransactions(state).map((tx) => mapTransaction(tx, networkHeight));
  if (pending.length === 0 && incoming.length === 0) return scanned;
  const scannedHashes = new Set(scanned.map((tx) => tx.hash));
  const pendingTxs = pending
    .filter((record) => !scannedHashes.has(record.hash))
    .map(mapPendingTransaction);
  // Don't double-list a tx already shown as an optimistic outbound pending (self-send).
  const pendingHashes = new Set(pendingTxs.map((tx) => tx.hash));
  const incomingTxs = incoming
    .filter((record) => !scannedHashes.has(record.hash) && !pendingHashes.has(record.hash))
    .map(mapIncomingPendingTransaction);
  return [...incomingTxs, ...pendingTxs, ...scanned];
}

/** Map one owned deposit to the UI {@link Deposit}. */
export function mapDeposit(
  deposit: OwnedDeposit,
  networkHeight: number,
  address: string,
  spentIndexes: ReadonlySet<number>,
): Deposit {
  const unlockHeight = deposit.blockHeight + deposit.term;
  const isSpent = spentIndexes.has(deposit.globalIndex);
  const isUnlocked = networkHeight >= unlockHeight;
  const status = isSpent ? "spent" : isUnlocked ? "unlocked" : "active";

  const blocksRemaining = Math.max(0, unlockHeight - networkHeight);
  const unlocksInDays = Math.ceil((blocksRemaining * AVG_BLOCK_TIME_SECONDS) / SECONDS_PER_DAY);
  const elapsed = deposit.term > 0 ? (networkHeight - deposit.blockHeight) / deposit.term : 1;
  const progressPct = Math.min(100, Math.max(0, Math.round(elapsed * 100)));

  const months = Math.max(1, Math.round(deposit.term / DEPOSIT_MIN_TERM_BLOCK));
  const apr = deriveApr(deposit.amount, deposit.interest, deposit.term);

  return {
    id: `${deposit.txHash}:${deposit.globalIndex}`,
    txHash: deposit.txHash,
    globalOutputIndex: deposit.globalIndex,
    amount: atomic(deposit.amount),
    status,
    durationMonths: months,
    apr,
    interest: atomic(deposit.interest),
    unlocksInDays,
    progressPct,
    address,
  };
}

/** Map all owned deposits (locked + unlocked + spent) to UI deposits. */
export function mapDeposits(state: WalletState, networkHeight: number): Deposit[] {
  const spent = new Set(state.spentDepositIndexes);
  return state.deposits.map((deposit) => mapDeposit(deposit, networkHeight, state.address, spent));
}

/** Indicative annualized rate from principal / earned interest / term (blocks). */
export function deriveApr(amount: number, interest: number, term: number): number {
  if (amount <= 0 || term <= 0) return 0;
  const months = term / DEPOSIT_MIN_TERM_BLOCK;
  if (months <= 0) return 0;
  const periodRate = interest / amount;
  const annualRate = (periodRate / months) * 12;
  return Math.round(annualRate * 1000) / 10;
}

/** Build the UI {@link WalletInfo} from the runtime state + heights. */
export function mapWalletInfo(runtime: SdkRuntime, networkHeight: number): WalletInfo {
  const { state } = runtime;
  const balance = getBalance(state);
  const locked = getLockedDeposits(state, networkHeight);
  const unlocked = getUnlockedDeposits(state, networkHeight);
  const lockedTotal = locked.reduce((sum, d) => sum + d.amount, 0);
  const withdrawable = unlocked.reduce((sum, d) => sum + d.amount + d.interest, 0);

  // Hold the balance for broadcast-but-not-yet-mined outbound txs (#96). Count ONLY
  // pending records not yet scanned into state — a record mined just before its
  // (synchronous) prune must not be double-counted against the on-chain balance.
  // `available` is the unspent set minus the inputs every live-pending tx locked (so it
  // matches what a new send can actually select); `balanceTotal` stays the on-chain
  // total. A pending DEPOSIT (#110) is not an outflow — its principal is becoming
  // locked, not leaving — so it counts toward `lockedDeposits`, not `pending`; showing
  // it as a pending outflow would alarmingly read as money leaving the wallet. (The
  // record's amount includes the tx fee, a negligible over-count that self-corrects to
  // the exact locked principal once the deposit mines and the record prunes.) A pending
  // WITHDRAWAL (#110, withdraw half) is likewise not an outflow — it's an incoming tx
  // that unlocks a deposit — so it's excluded from `pending` too.
  const minedHashes = new Set(state.transactions.map((tx) => tx.hash));
  const livePending = readPendingRecords(runtime.raw).filter(
    (record) => !minedHashes.has(record.hash),
  );
  const pendingOut = livePending.reduce(
    (sum, record) =>
      record.type === "deposit" || record.type === "withdrawal"
        ? sum
        : sum + Math.max(0, record.amountAtomic),
    0,
  );
  const pendingLocked = livePending.reduce(
    (sum, record) => (record.type === "deposit" ? sum + Math.max(0, record.amountAtomic) : sum),
    0,
  );
  const pendingSpent = new Set(livePending.flatMap((record) => record.spentKeyImages));
  const availableAtomic = getUnspentOutputs(state).reduce(
    (sum, out) => sum + (pendingSpent.has(out.keyImage) ? 0 : out.amount),
    0,
  );

  return {
    address: state.address,
    viewOnly: runtime.viewOnly,
    balanceTotal: atomic(balance.total),
    available: atomic(availableAtomic),
    dust: atomic(0),
    pending: atomic(pendingOut),
    incomingPending: atomic(incomingPendingAtomic(runtime.raw)),
    lockedDeposits: atomic(lockedTotal + pendingLocked),
    withdrawable: atomic(withdrawable),
    creationHeight: Math.max(0, Number(runtime.raw.creationHeight ?? 0) || 0),
    currentHeight: state.scannedHeight,
    networkHeight,
  };
}

/** Stable thread key for a recipient + payment id (shared with the mock/UI). */
export function threadKeyFor(address: string, paymentId?: string): string {
  return buildMessageThreadKey(address, paymentId);
}
