import type { Deposit, Transaction, TransactionType } from "@/lib/types";

/**
 * Pure, on-device analytics derived from the wallet's own transaction + deposit
 * history. No network, no analytics SaaS — everything is computed client-side
 * from data the app already holds, so it works identically in mock + real modes.
 */

export interface MonthlyFlow {
  /** "YYYY-MM". */
  month: string;
  inAtomic: number;
  outAtomic: number;
}

export interface WalletInsights {
  totalReceivedAtomic: number;
  totalSentAtomic: number;
  /** Received − sent (a spending lens; ignores deposit churn and dust/message txs). */
  netFlowAtomic: number;
  depositedPrincipalAtomic: number;
  interestEarnedAtomic: number;
  txCount: number;
  countByType: Record<TransactionType, number>;
  /** Contiguous months from first to last activity (chronological). */
  monthly: MonthlyFlow[];
  /** Cumulative signed spendable-flow over time, oldest → newest (atomic). */
  balanceSeries: number[];
}

const IN_TYPES: ReadonlySet<TransactionType> = new Set(["receive", "miner", "withdrawal"]);
const OUT_TYPES: ReadonlySet<TransactionType> = new Set(["send", "deposit"]);

/** Signed effect of a tx on spendable balance (dust/self churn counts as 0). */
function signedFlow(tx: Transaction): number {
  if (IN_TYPES.has(tx.type)) return tx.amount.atomic;
  if (OUT_TYPES.has(tx.type)) return -tx.amount.atomic;
  return 0; // fusion, message
}

function monthKey(timestamp: string): string {
  // ISO timestamps → "YYYY-MM" (UTC; bucketing is coarse so DST/locale don't matter).
  return timestamp.slice(0, 7);
}

/** Every "YYYY-MM" from `first` to `last` inclusive (contiguous, no gaps). */
function monthRange(first: string, last: string): string[] {
  const out: string[] = [];
  let [year, month] = first.split("-").map(Number);
  const [endYear, endMonth] = last.split("-").map(Number);
  while (year < endYear || (year === endYear && month <= endMonth)) {
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

const EMPTY_COUNTS: Record<TransactionType, number> = {
  receive: 0,
  send: 0,
  deposit: 0,
  withdrawal: 0,
  fusion: 0,
  miner: 0,
  message: 0,
};

export function deriveInsights(
  transactions: readonly Transaction[],
  deposits: readonly Deposit[],
): WalletInsights {
  const countByType: Record<TransactionType, number> = { ...EMPTY_COUNTS };
  let totalReceivedAtomic = 0;
  let totalSentAtomic = 0;
  let depositedPrincipalAtomic = 0;

  const byMonth = new Map<string, MonthlyFlow>();
  for (const tx of transactions) {
    countByType[tx.type] = (countByType[tx.type] ?? 0) + 1;
    if (tx.type === "receive" || tx.type === "miner") totalReceivedAtomic += tx.amount.atomic;
    if (tx.type === "send") totalSentAtomic += tx.amount.atomic;
    if (tx.type === "deposit") depositedPrincipalAtomic += tx.amount.atomic;

    if (tx.timestamp) {
      const key = monthKey(tx.timestamp);
      const bucket = byMonth.get(key) ?? { month: key, inAtomic: 0, outAtomic: 0 };
      if (tx.type === "receive" || tx.type === "miner") bucket.inAtomic += tx.amount.atomic;
      if (tx.type === "send") bucket.outAtomic += tx.amount.atomic;
      byMonth.set(key, bucket);
    }
  }

  // Contiguous month series (fill gaps with zero) for a clean chart.
  const keys = [...byMonth.keys()].sort();
  const monthly: MonthlyFlow[] =
    keys.length === 0
      ? []
      : monthRange(keys[0], keys[keys.length - 1]).map(
          (month) => byMonth.get(month) ?? { month, inAtomic: 0, outAtomic: 0 },
        );

  // Cumulative spendable-flow series in chronological order.
  const chronological = [...transactions]
    .filter((tx) => tx.timestamp)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let running = 0;
  const balanceSeries = chronological.map((tx) => {
    running += signedFlow(tx);
    return running;
  });

  const interestEarnedAtomic = deposits.reduce((sum, d) => sum + d.interest.atomic, 0);

  return {
    totalReceivedAtomic,
    totalSentAtomic,
    netFlowAtomic: totalReceivedAtomic - totalSentAtomic,
    depositedPrincipalAtomic,
    interestEarnedAtomic,
    txCount: transactions.length,
    countByType,
    monthly,
    balanceSeries,
  };
}
