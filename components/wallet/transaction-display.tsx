import {
  ArrowDownLeft,
  ArrowUpFromLine,
  ArrowUpRight,
  Combine,
  Lock,
  type LucideIcon,
  Mail,
  Pickaxe,
} from "lucide-react";
import { TX_CONFIRMED_THRESHOLD } from "@/lib/config/config";
import type { Formatters } from "@/lib/i18n/use-formatters";
import type { Transaction, TransactionType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isUiMessageOut, resolveUiTransactionType } from "@/lib/ui/transaction-kind";

// Shared transaction presentation helpers, used by both the Transactions page
// (list rows + detail dialog) and the contextual Transactions rail (#122 stage 3).
// Extracted so the two views render identical labels/icons/colours/status without
// duplicating the config (and to keep the page file under the size budget).

export type TransactionStatus = "Confirmed" | "Pending";

export const TIMESTAMP_FORMAT: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

export const transactionMeta: Record<
  TransactionType,
  {
    label: string;
    icon: LucideIcon;
    sign: "+" | "−";
    amountClassName: string;
    chipClassName: string;
  }
> = {
  receive: {
    label: "Receive",
    icon: ArrowDownLeft,
    sign: "+",
    amountClassName: "text-wallet-incoming",
    chipClassName: "bg-wallet-incoming/10 text-wallet-incoming",
  },
  send: {
    label: "Send",
    icon: ArrowUpRight,
    sign: "−",
    amountClassName: "text-wallet-outgoing",
    chipClassName: "bg-wallet-outgoing/10 text-wallet-outgoing",
  },
  deposit: {
    label: "Deposit",
    icon: Lock,
    sign: "+",
    amountClassName: "text-wallet-deposit",
    chipClassName: "bg-wallet-deposit/10 text-wallet-deposit",
  },
  withdrawal: {
    label: "Withdrawal",
    icon: ArrowUpFromLine,
    sign: "+",
    amountClassName: "text-wallet-incoming",
    chipClassName: "bg-wallet-incoming/10 text-wallet-incoming",
  },
  fusion: {
    label: "Fusion",
    icon: Combine,
    sign: "−",
    amountClassName: "text-muted-foreground",
    chipClassName: "bg-secondary text-muted-foreground",
  },
  miner: {
    label: "Miner",
    icon: Pickaxe,
    sign: "+",
    amountClassName: "text-wallet-incoming",
    chipClassName: "bg-wallet-incoming/10 text-wallet-incoming",
  },
  message: {
    label: "Message",
    icon: Mail,
    sign: "+",
    amountClassName: "text-primary",
    chipClassName: "bg-primary/10 text-primary",
  },
};

export function getTransactionStatus(confirmations: number): TransactionStatus {
  return confirmations >= TX_CONFIRMED_THRESHOLD ? "Confirmed" : "Pending";
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
): string {
  const height = blockHeight > 0 ? fmt.formatNumber(blockHeight) : "Pending";
  // English plural wording only; full ICU pluralization is out of scope (future).
  const confLabel = confirmations === 1 ? "confirmation" : "confirmations";
  return `${height} (${fmt.formatNumber(confirmations)} ${confLabel})`;
}

export function StatusPill({ status }: { status: TransactionStatus }) {
  const confirmed = status === "Confirmed";

  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        confirmed ? "bg-wallet-incoming/10 text-wallet-incoming" : "bg-primary/10 text-primary",
      )}
    >
      {status}
    </span>
  );
}
