import {
  ArrowDownLeft,
  ArrowUpRight,
  Combine,
  Lock,
  type LucideIcon,
  Mail,
  Pickaxe,
  Unlock,
} from "lucide-react";
import { TX_CONFIRMED_THRESHOLD } from "@/lib/config/config";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { Formatters } from "@/lib/i18n/use-formatters";
import type { Transaction, TransactionType } from "@/lib/types";
import { isUiMessageOut, resolveUiTransactionType } from "@/lib/ui/transaction-kind";
import { cn } from "@/lib/utils";

// `t` resolves an i18n key against the active locale; matches useI18n().t.
type Translate = (key: string, vars?: Record<string, string | number>) => string;

// Shared transaction presentation helpers, used by both the Transactions page
// (list rows + detail dialog) and the contextual Transactions rail (#122 stage 3).
// Extracted so the two views render identical labels/icons/colours/status without
// duplicating the config (and to keep the page file under the size budget).

export type TransactionStatus = "Confirmed" | "Pending";

export const TIMESTAMP_FORMAT: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

// `transactionMeta` is a module-level const, so it cannot call hooks. Each entry
// carries an i18n `labelKey` instead of a literal label; resolve the display
// string at render time with `transactionLabel(meta, t)` (or `t(meta.labelKey)`).
export const transactionMeta: Record<
  TransactionType,
  {
    labelKey: string;
    icon: LucideIcon;
    sign: "+" | "−";
    amountClassName: string;
    chipClassName: string;
  }
> = {
  receive: {
    labelKey: "account.txReceive",
    icon: ArrowDownLeft,
    sign: "+",
    amountClassName: "text-wallet-incoming",
    chipClassName: "bg-wallet-incoming/10 text-wallet-incoming",
  },
  send: {
    labelKey: "account.txSend",
    icon: ArrowUpRight,
    sign: "−",
    amountClassName: "text-wallet-outgoing",
    chipClassName: "bg-wallet-outgoing/10 text-wallet-outgoing",
  },
  deposit: {
    labelKey: "account.txDeposit",
    icon: Lock,
    sign: "+",
    amountClassName: "text-wallet-deposit",
    chipClassName: "bg-wallet-deposit/10 text-wallet-deposit",
  },
  withdrawal: {
    labelKey: "txn.typeWithdrawal",
    icon: Unlock,
    sign: "+",
    amountClassName: "text-wallet-incoming",
    chipClassName: "bg-wallet-incoming/10 text-wallet-incoming",
  },
  fusion: {
    labelKey: "account.txFusion",
    icon: Combine,
    sign: "−",
    amountClassName: "text-muted-foreground",
    chipClassName: "bg-secondary text-muted-foreground",
  },
  miner: {
    labelKey: "account.txMiner",
    icon: Pickaxe,
    sign: "+",
    amountClassName: "text-wallet-incoming",
    chipClassName: "bg-wallet-incoming/10 text-wallet-incoming",
  },
  message: {
    labelKey: "account.txMessage",
    icon: Mail,
    sign: "+",
    amountClassName: "text-primary",
    chipClassName: "bg-primary/10 text-primary",
  },
};

// Resolve a transaction type's localized display label from its meta entry.
export function transactionLabel(meta: { labelKey: string }, t: Translate): string {
  return t(meta.labelKey);
}

// Logical status used for branching/styling; keep returning the canonical
// "Confirmed"/"Pending" tokens. Use `statusLabelKey` + `t()` for display text.
export function getTransactionStatus(confirmations: number): TransactionStatus {
  return confirmations >= TX_CONFIRMED_THRESHOLD ? "Confirmed" : "Pending";
}

// Map a logical status to its i18n key, resolved with `t()` at render time.
export function statusLabelKey(status: TransactionStatus): string {
  return status === "Confirmed" ? "txn.statusConfirmed" : "txn.statusPending";
}

export function formatSignedAmount(transaction: Transaction, fmt: Formatters, decimals?: number) {
  const effectiveType = resolveUiTransactionType(transaction);
  const meta = transactionMeta[effectiveType];
  const sign = effectiveType === "message" && isUiMessageOut(transaction) ? "−" : meta.sign;
  return `${sign}${fmt.formatCcx(transaction.amount, decimals)}`;
}

export function formatTimestamp(timestamp: string, fmt: Formatters) {
  return fmt.formatDate(new Date(timestamp), TIMESTAMP_FORMAT);
}

export function formatHeightWithConfirmations(
  blockHeight: number,
  confirmations: number,
  fmt: Formatters,
  t: Translate,
): string {
  const height = blockHeight > 0 ? fmt.formatNumber(blockHeight) : t("txn.statusPending");
  // Simple singular/plural split; full ICU pluralization is out of scope (future).
  const key = confirmations === 1 ? "txn.heightConfirmationsOne" : "txn.heightConfirmations";
  return t(key, { height, count: fmt.formatNumber(confirmations) });
}

export function StatusPill({ status }: { status: TransactionStatus }) {
  const { t } = useI18n();
  const confirmed = status === "Confirmed";

  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        confirmed ? "bg-wallet-incoming/10 text-wallet-incoming" : "bg-primary/10 text-primary",
      )}
    >
      {t(statusLabelKey(status))}
    </span>
  );
}
