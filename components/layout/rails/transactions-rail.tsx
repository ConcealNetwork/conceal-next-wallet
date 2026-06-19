"use client";

import { ArrowLeft, CalendarClock, Hash, Receipt } from "lucide-react";
import { RightRailHeader } from "@/components/layout/right-rail";
import { CcxAmount } from "@/components/wallet/ccx";
import { CopyButton } from "@/components/wallet/common";
import { TransactionNote } from "@/components/wallet/transaction-note";
import {
  type TransactionStatus,
  formatHeightWithConfirmations,
  formatSignedAmount,
  formatTimestamp,
  getTransactionStatus,
  StatusPill,
  transactionMeta,
} from "@/components/wallet/transaction-display";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useFormatters } from "@/lib/i18n/use-formatters";
import type { Transaction } from "@/lib/types";
import { cn, truncateAddress } from "@/lib/utils";
import { resolveUiTransactionType } from "@/lib/wallet-core/mappers";

// Issue #122, stage 3 — the Transactions-page contextual rail. With no row
// selected it shows a hint; selecting a row (>=1200px, where the rail is visible)
// renders the transaction's detail here instead of the dialog (the page keeps the
// dialog for narrow viewports). Fields mirror the detail dialog via the shared
// transaction-display helpers; `Fee` from the mockup is omitted — the Transaction
// type carries no fee, and a fabricated value would be worse than none.

export function TransactionsRail({
  transaction,
  onClose,
}: {
  transaction: Transaction | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1">
      <RightRailHeader title={t("rail.transaction")} />
      {transaction ? (
        <TransactionDetail transaction={transaction} onClose={onClose} />
      ) : (
        <EmptyDetail />
      )}
    </div>
  );
}

function EmptyDetail() {
  const { t } = useI18n();
  return (
    <div className="mt-3.5 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/70 px-5 py-12 text-center">
      <span
        className="grid size-10 place-items-center rounded-xl bg-secondary text-muted-foreground"
        aria-hidden="true"
      >
        <Receipt className="size-5" />
      </span>
      <p className="text-[13px] font-medium text-foreground">{t("rail.noTransactionSelected")}</p>
      <p className="text-xs text-muted-foreground">{t("rail.noTransactionSelectedHint")}</p>
    </div>
  );
}

function TransactionDetail({
  transaction,
  onClose,
}: {
  transaction: Transaction;
  onClose: () => void;
}) {
  const fmt = useFormatters();
  const { t } = useI18n();
  const meta = transactionMeta[resolveUiTransactionType(transaction)];
  const status: TransactionStatus = getTransactionStatus(transaction.confirmations);
  const Icon = meta.icon;

  return (
    <div className="mt-1.5 flex flex-col gap-4">
      <button
        type="button"
        onClick={onClose}
        className="-ml-1 inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-sm px-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        {t("rail.backToList")}
      </button>

      <div className="flex items-center gap-3">
        <span
          className={cn("grid size-10 shrink-0 place-items-center rounded-xl", meta.chipClassName)}
          aria-hidden="true"
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-foreground">{meta.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fmt.timeAgo(transaction.timestamp)}
          </p>
        </div>
        <span className="ml-auto">
          <StatusPill status={status} />
        </span>
      </div>

      <div className="rounded-xl border border-border/70 p-4">
        <p className="text-[11.5px] font-medium text-muted-foreground">{t("rail.amount")}</p>
        <p className={cn("mt-1 font-mono text-2xl font-bold leading-none", meta.amountClassName)}>
          <CcxAmount>{formatSignedAmount(transaction, fmt)}</CcxAmount>
        </p>
      </div>

      <dl className="flex flex-col gap-2.5">
        <DetailField label={t("rail.time")} icon={CalendarClock}>
          {formatTimestamp(transaction.timestamp, fmt)}
        </DetailField>
        <DetailField label={t("rail.block")}>
          {formatHeightWithConfirmations(transaction.blockHeight, transaction.confirmations, fmt)}
        </DetailField>
        {transaction.paymentId ? (
          <DetailField label={t("rail.paymentId")} mono copyValue={transaction.paymentId}>
            {truncateAddress(transaction.paymentId, 8, 8)}
          </DetailField>
        ) : null}
        {transaction.message ? (
          <DetailField label={t("rail.message")}>{transaction.message}</DetailField>
        ) : null}
        <DetailField label={t("rail.to")} mono copyValue={transaction.address}>
          {truncateAddress(transaction.address, 8, 6)}
        </DetailField>
        <DetailField label={t("rail.txHash")} icon={Hash} mono copyValue={transaction.hash}>
          {truncateAddress(transaction.hash, 8, 6)}
        </DetailField>
      </dl>

      <TransactionNote key={transaction.hash} hash={transaction.hash} />
    </div>
  );
}

function DetailField({
  label,
  icon: Icon,
  mono,
  copyValue,
  children,
}: {
  label: string;
  icon?: typeof Hash;
  mono?: boolean;
  copyValue?: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-lg border border-border/70 px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
        {Icon ? <Icon className="size-3.5" aria-hidden="true" /> : null}
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 flex items-start justify-between gap-2 text-[13px] text-foreground",
          mono && "font-mono",
        )}
      >
        <span className="min-w-0 wrap-break-word">{children}</span>
        {copyValue ? (
          <CopyButton value={copyValue} label={t("action.copyField", { label })} iconOnly />
        ) : null}
      </dd>
    </div>
  );
}
