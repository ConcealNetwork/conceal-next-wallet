"use client";

import type { LucideIcon } from "lucide-react";
import { CalendarClock, Download, Hash, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { TransactionsRail } from "@/components/layout/rails/transactions-rail";
import { usePageRightRail, useRightRailCollapse } from "@/components/layout/right-rail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PaginationCarousel } from "@/components/ui/pagination-carousel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CcxAmount } from "@/components/wallet/ccx";
import {
  CopyButton,
  EmptyState,
  FilterTabs,
  PageHeader,
  SectionCard,
} from "@/components/wallet/common";
import {
  formatHeightWithConfirmations,
  formatSignedAmount,
  formatTimestamp,
  getTransactionStatus,
  StatusPill,
  statusLabelKey,
  transactionMeta,
} from "@/components/wallet/transaction-display";
import { TransactionNote } from "@/components/wallet/transaction-note";
import { useTransactions } from "@/lib/hooks";
import { useCountUp } from "@/lib/hooks/use-count-up";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useFormatters } from "@/lib/i18n/use-formatters";
import type { Transaction } from "@/lib/types";
import { downloadCsvFile, transactionCsvFilename } from "@/lib/ui/download-csv-file";
import { toast } from "@/lib/ui/toast";
import { transactionsToCsv } from "@/lib/ui/transaction-csv";
import { resolveUiTransactionType } from "@/lib/ui/transaction-kind";
import { CCX_PRECISION_DECIMAL_DISPLAY, ccxToNumber, cn, truncateAddress } from "@/lib/utils";

// Tab identifiers stay English — they drive `transactionMatchesTab` and remain the
// stable selector for e2e. Display strings resolve via `TAB_LABEL_KEYS` + t().
const tabs = ["All", "Received", "Sent", "Deposits", "Withdrawals", "Messages"];
const TAB_LABEL_KEYS: Record<string, string> = {
  All: "txn.tabAll",
  Received: "txn.tabReceived",
  Sent: "txn.tabSent",
  Deposits: "txn.tabDeposits",
  Withdrawals: "txn.tabWithdrawals",
  Messages: "txn.tabMessages",
};
const pageSizes = ["10", "25", "50"];

type DateGroup = "Today" | "Yesterday" | "This Week" | "Earlier";

const dateGroups: DateGroup[] = ["Today", "Yesterday", "This Week", "Earlier"];
// Date-group identifiers stay English (used as map keys + section ids); the
// heading text resolves via `DATE_GROUP_LABEL_KEYS` + t() at render time.
const DATE_GROUP_LABEL_KEYS: Record<DateGroup, string> = {
  Today: "txn.groupToday",
  Yesterday: "txn.groupYesterday",
  "This Week": "txn.groupThisWeek",
  Earlier: "txn.groupEarlier",
};

export default function TransactionsPageClient() {
  const fmt = useFormatters();
  const { t } = useI18n();
  const { data = [] } = useTransactions();
  const [active, setActive] = useState("All");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState("10");
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<Transaction | null>(null);

  // The detail renders in the rail only when it is actually on screen: >=1200px
  // AND not collapsed to its strip. Otherwise (narrow, or the user collapsed the
  // rail) fall back to the detail dialog so a selection is never shown nowhere.
  const railVisible = useMediaQuery("(min-width: 1200px)");
  const { collapsed: railCollapsed } = useRightRailCollapse();
  const detailInRail = railVisible && !railCollapsed;

  // Register the contextual Transactions rail; re-register when `selected`
  // changes (a discrete user action) so the rail reflects the chosen row.
  usePageRightRail(
    <TransactionsRail
      transaction={selected}
      onSelect={setSelected}
      onClose={() => setSelected(null)}
    />,
    [selected],
  );

  const size = Number(pageSize);

  const filtered = useMemo(() => {
    return data
      .filter((transaction) => {
        const matchesTab = transactionMatchesTab(transaction, active);
        const searchTarget = [
          transaction.address,
          transaction.hash,
          transaction.type,
          transaction.paymentId,
          transaction.message,
          fmt.formatCcx(transaction.amount),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const matchesSearch = searchTarget.includes(search.trim().toLowerCase());
        return matchesTab && matchesSearch;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [active, data, search, fmt]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / size));
  const safePage = Math.min(currentPage, totalPages);

  const visibleTransactions = useMemo(
    () => filtered.slice((safePage - 1) * size, safePage * size),
    [filtered, safePage, size],
  );

  function goToPage(page: number) {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }

  function handleActiveChange(tab: string) {
    setActive(tab);
    setCurrentPage(1);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setCurrentPage(1);
  }

  function handlePageSizeChange(value: string) {
    setPageSize(value);
    setCurrentPage(1);
  }

  async function handleExportCsv() {
    // Export the current filtered/searched view (WYSIWYG), not just the visible page.
    try {
      await downloadCsvFile(transactionCsvFilename(active), transactionsToCsv(filtered));
      toast.success(
        filtered.length === 1
          ? t("txn.exportSuccessOne")
          : t("txn.exportSuccess", { count: fmt.formatNumber(filtered.length) }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("txn.exportError"));
    }
  }

  const groupedTransactions = useMemo(() => {
    const groups = new Map<DateGroup, Transaction[]>(dateGroups.map((label) => [label, []]));

    for (const transaction of visibleTransactions) {
      groups.get(groupTransactionDate(transaction.timestamp))?.push(transaction);
    }

    return dateGroups.reduce<Array<{ label: DateGroup; transactions: Transaction[] }>>(
      (acc, label) => {
        const transactions = groups.get(label) ?? [];
        if (transactions.length > 0) acc.push({ label, transactions });
        return acc;
      },
      [],
    );
  }, [visibleTransactions]);

  const totals = useMemo(
    () =>
      data.reduce(
        (acc, transaction) => {
          const value = ccxToNumber(transaction.amount);
          if (transaction.type === "receive" || transaction.type === "miner") acc.received += value;
          if (transaction.type === "send" || transaction.type === "fusion") acc.sent += value;
          if (transaction.type === "deposit") acc.deposits += value;
          if (transaction.type === "withdrawal") acc.withdrawals += value;
          return acc;
        },
        { received: 0, sent: 0, deposits: 0, withdrawals: 0 },
      ),
    [data],
  );

  const outflow = totals.sent + totals.withdrawals;
  const netFlow = totals.received + totals.deposits - outflow;

  return (
    <>
      <PageHeader
        title={t("txn.history")}
        subtitle={t("txn.subtitle")}
        action={
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => void handleExportCsv()}
            disabled={filtered.length === 0}
            title={filtered.length === 0 ? t("txn.exportEmpty") : undefined}
          >
            <Download className="size-4" aria-hidden="true" />
            {t("txn.exportButton")}
          </Button>
        }
      />
      <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
        <SectionCard title={t("txn.summary")} description={t("txn.summaryDescription")}>
          <TransactionSummary
            received={totals.received}
            sent={outflow}
            deposits={totals.deposits}
            netFlow={netFlow}
            transactionCount={data.length}
          />
        </SectionCard>
      </div>
      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative max-w-md flex-1">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder={t("txn.searchPlaceholder")}
            className="pl-9"
            aria-label={t("txn.searchAria")}
          />
        </div>
        <Select value={pageSize} onValueChange={handlePageSizeChange}>
          <SelectTrigger className="md:w-[178px]" aria-label={t("txn.perPageAria")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizes.map((s) => (
              <SelectItem key={s} value={s}>
                {t("txn.perPageOption", { count: s })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="mt-6 animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:90ms]">
        <SectionCard
          title={t("txn.found", { count: fmt.formatNumber(filtered.length) })}
          description={
            filtered.length > visibleTransactions.length
              ? t("txn.pageSummary", {
                  page: fmt.formatNumber(safePage),
                  total: fmt.formatNumber(totalPages),
                  shown: fmt.formatNumber(visibleTransactions.length),
                  total_count: fmt.formatNumber(filtered.length),
                })
              : t("txn.groupedByDate")
          }
        >
          <FilterTabs
            tabs={tabs}
            active={active}
            onChange={handleActiveChange}
            labels={Object.fromEntries(tabs.map((tab) => [tab, t(TAB_LABEL_KEYS[tab])]))}
          />
          <div className="mt-5">
            {groupedTransactions.length > 0 ? (
              <div className="space-y-6">
                {groupedTransactions.map((group, groupIndex) => (
                  <TransactionDateGroup
                    key={group.label}
                    group={group}
                    groupIndex={groupIndex}
                    onSelect={setSelected}
                    selectedId={selected?.id ?? null}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title={t("txn.emptyTitle")}
                description={t("txn.emptyDescription")}
                illustration="/brand/empty/transactions.png"
              />
            )}
          </div>
        </SectionCard>
      </div>
      {totalPages > 1 && (
        <PaginationCarousel
          currentPage={safePage}
          totalPages={totalPages}
          onPageChange={goToPage}
          ariaLabel={t("txn.paginationAria")}
        />
      )}
      <TransactionDetailsDialog
        transaction={detailInRail ? null : selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </>
  );
}

function TransactionSummary({
  received,
  sent,
  deposits,
  netFlow,
  transactionCount,
}: {
  received: number;
  sent: number;
  deposits: number;
  netFlow: number;
  transactionCount: number;
}) {
  const { formatCcx, formatNumber } = useFormatters();
  const { t } = useI18n();
  const totalFlow = received + sent + deposits;
  const flowSegments = [
    {
      key: "in",
      label: t("account.flowIn"),
      value: received,
      className: "bg-wallet-incoming",
      textClassName: "text-wallet-incoming",
      prefix: "+",
    },
    {
      key: "out",
      label: t("account.flowOut"),
      value: sent,
      className: "bg-wallet-outgoing",
      textClassName: "text-wallet-outgoing",
      prefix: "−",
    },
    {
      key: "deposits",
      label: t("account.flowDeposits"),
      value: deposits,
      className: "bg-wallet-deposit",
      textClassName: "text-wallet-deposit",
      prefix: "+",
    },
  ];
  const netFlowLabel = useCountUp(netFlow, {
    formatter: (value) => `${value >= 0 ? "+" : "−"}${formatCcx(Math.abs(value))}`,
  });
  const transactionCountLabel = useCountUp(transactionCount, {
    formatter: (value) => formatNumber(Math.round(value)),
  });

  return (
    <div className="space-y-5">
      <div className="grid auto-rows-fr gap-4 @2xl:grid-cols-3">
        <SummaryMetricCard
          label={t("txn.totalReceived")}
          value={received}
          prefix="+"
          detail={t("txn.incomingTransfers")}
          tone="incoming"
        />
        <SummaryMetricCard
          label={t("txn.totalSent")}
          value={sent}
          prefix="−"
          detail={t("txn.transfersAndWithdrawals")}
          tone="outgoing"
        />
        <SummaryMetricCard
          label={t("txn.totalDeposits")}
          value={deposits}
          prefix="+"
          detail={t("txn.lockedDeposits")}
          tone="deposit"
        />
      </div>
      <div className="rounded-xl border border-border bg-secondary/60 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-muted-foreground">{t("txn.flowMix")}</p>
              <p className="font-mono text-sm text-muted-foreground">
                {t("txn.transactionsCount", { count: transactionCountLabel })}
              </p>
            </div>
            <div
              className="mt-3 flex h-3 overflow-hidden rounded-full bg-background"
              aria-hidden="true"
            >
              {flowSegments.map((segment, index) => (
                <span
                  key={segment.key}
                  className={cn("animate-scale-x-in motion-reduce:animate-none", segment.className)}
                  style={{
                    width: `${totalFlow > 0 ? (segment.value / totalFlow) * 100 : 0}%`,
                    animationDelay: `${index * 70}ms`,
                  }}
                />
              ))}
            </div>
            <p className="sr-only">
              {t("txn.flowMixSrOnly", {
                received: formatCcx(received),
                sent: formatCcx(sent),
                deposits: formatCcx(deposits),
              })}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {flowSegments.map((segment) => (
                <div key={segment.key} className="min-w-0">
                  <p className="text-xs text-muted-foreground">{segment.label}</p>
                  <p
                    className={cn(
                      "mt-1 truncate font-mono text-sm font-semibold",
                      segment.textClassName,
                    )}
                  >
                    {segment.prefix}
                    <CcxAmount>{formatCcx(segment.value)}</CcxAmount>
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 lg:min-w-[230px]">
            <p className="text-sm text-muted-foreground">{t("txn.netFlow")}</p>
            <p
              className={cn(
                "mt-2 whitespace-nowrap font-mono text-xl font-bold",
                netFlow >= 0 ? "text-wallet-incoming" : "text-wallet-outgoing",
              )}
            >
              <CcxAmount>{netFlowLabel}</CcxAmount>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryMetricCard({
  label,
  value,
  prefix,
  detail,
  tone,
}: {
  label: string;
  value: number;
  prefix: "+" | "−";
  detail: string;
  tone: "incoming" | "outgoing" | "deposit";
}) {
  const { formatCcx } = useFormatters();
  const valueLabel = useCountUp(value, {
    formatter: (countedValue) => `${prefix}${formatCcx(countedValue)}`,
  });
  const toneClass = {
    incoming: "text-wallet-incoming",
    outgoing: "text-wallet-outgoing",
    deposit: "text-wallet-deposit",
  }[tone];

  return (
    <div className="flex min-h-[118px] flex-col justify-between rounded-xl border border-border bg-secondary/60 p-4">
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-3 whitespace-nowrap font-mono text-xl font-bold tracking-tight",
            toneClass,
          )}
        >
          <CcxAmount>{valueLabel}</CcxAmount>
        </p>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function TransactionDateGroup({
  group,
  groupIndex,
  onSelect,
  selectedId,
}: {
  group: { label: DateGroup; transactions: Transaction[] };
  groupIndex: number;
  onSelect: (transaction: Transaction) => void;
  selectedId: string | null;
}) {
  const { t } = useI18n();
  return (
    <section aria-labelledby={`transactions-${group.label.replace(/\s/g, "-").toLowerCase()}`}>
      <div className="mb-2 flex items-center gap-3">
        <h2
          id={`transactions-${group.label.replace(/\s/g, "-").toLowerCase()}`}
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {t(DATE_GROUP_LABEL_KEYS[group.label])}
        </h2>
        <div className="h-px flex-1 bg-border" />
      </div>
      <ul className="space-y-2">
        {group.transactions.map((transaction, index) => (
          <li
            key={transaction.id}
            className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100"
            style={{ animationDelay: `${140 + (groupIndex * 5 + index) * 35}ms` }}
          >
            <TransactionListRow
              transaction={transaction}
              onSelect={onSelect}
              selected={transaction.id === selectedId}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TransactionListRow({
  transaction,
  onSelect,
  selected = false,
}: {
  transaction: Transaction;
  onSelect: (transaction: Transaction) => void;
  selected?: boolean;
}) {
  const fmt = useFormatters();
  const { t } = useI18n();
  const meta = transactionMeta[resolveUiTransactionType(transaction)];
  const label = t(meta.labelKey);
  const status = getTransactionStatus(transaction.confirmations);
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect(transaction)}
      aria-pressed={selected}
      className={cn(
        "group flex w-full cursor-pointer flex-col gap-3 rounded-xl border bg-card p-3 text-left transition-colors duration-200 hover:bg-secondary/70 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:flex-row sm:items-center sm:justify-between",
        selected ? "border-primary ring-1 ring-primary/40" : "border-border",
      )}
      aria-label={t("txn.rowAria", {
        label,
        amount: formatSignedAmount(transaction, fmt),
        time: fmt.timeAgo(transaction.timestamp),
      })}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn("grid size-10 shrink-0 place-items-center rounded-xl", meta.chipClassName)}
          aria-hidden="true"
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">{truncateAddress(transaction.address)}</p>
            <StatusPill status={status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>{fmt.timeAgo(transaction.timestamp)}</span>
            <span aria-hidden="true">•</span>
            <span>
              {t("txn.confirmationsCount", {
                count: fmt.formatNumber(transaction.confirmations),
              })}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
        <Badge variant="secondary" className="sm:hidden">
          {label}
        </Badge>
        <span className={cn("font-mono text-base font-semibold", meta.amountClassName)}>
          <CcxAmount>{formatSignedAmount(transaction, fmt)}</CcxAmount>
        </span>
        <span className="hidden text-xs text-muted-foreground sm:block">{label}</span>
      </div>
    </button>
  );
}

function TransactionDetailsDialog({
  transaction,
  onOpenChange,
}: {
  transaction: Transaction | null;
  onOpenChange: (open: boolean) => void;
}) {
  const fmt = useFormatters();
  const { t } = useI18n();
  if (!transaction) {
    return null;
  }

  const meta = transactionMeta[resolveUiTransactionType(transaction)];
  const label = t(meta.labelKey);
  const status = getTransactionStatus(transaction.confirmations);
  const statusLabel = t(statusLabelKey(status));
  const Icon = meta.icon;

  return (
    <Dialog open={Boolean(transaction)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start gap-3 pr-8">
            <span
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-xl",
                meta.chipClassName,
              )}
              aria-hidden="true"
            >
              <Icon className="size-5" />
            </span>
            <div>
              <DialogTitle>{t("txn.titleTransaction", { label })}</DialogTitle>
              <DialogDescription>
                {formatTimestamp(transaction.timestamp, fmt)} ·{" "}
                {t("txn.confirmationsCount", {
                  count: fmt.formatNumber(transaction.confirmations),
                })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
          <div>
            <p className="text-sm text-muted-foreground">{t("txn.signedAmount")}</p>
            <p className={cn("mt-1 font-mono text-3xl font-bold", meta.amountClassName)}>
              <CcxAmount>
                {formatSignedAmount(transaction, fmt, CCX_PRECISION_DECIMAL_DISPLAY)}
              </CcxAmount>
            </p>
          </div>
          <StatusPill status={status} />
        </div>

        <dl className="grid gap-3">
          <DetailRow label={t("txn.detailType")} value={label} />
          <DetailRow
            label={t("txn.detailTimestamp")}
            value={formatTimestamp(transaction.timestamp, fmt)}
            icon={CalendarClock}
          />
          <DetailRow
            label={t("txn.detailHeight")}
            value={formatHeightWithConfirmations(
              transaction.blockHeight,
              transaction.confirmations,
              fmt,
              t,
            )}
          />
          <DetailRow label={t("txn.detailStatus")} value={statusLabel} />
          <DetailRow
            label={t("rail.paymentId")}
            value={transaction.paymentId ?? t("txn.notProvided")}
          />
          <DetailRow
            label={t("rail.message")}
            value={transaction.message ?? t("txn.notProvided")}
          />
          <DetailRow
            label={t("txn.detailHash")}
            value={transaction.hash}
            icon={Hash}
            mono
            copyValue={transaction.hash}
          />
        </dl>

        <div className="rounded-xl border border-border bg-secondary/60 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{t("txn.fullAddress")}</p>
              <p className="mt-2 break-all font-mono text-sm text-foreground">
                {transaction.address}
              </p>
            </div>
            <CopyButton value={transaction.address} label={t("txn.copyAddress")} iconOnly />
          </div>
        </div>

        <TransactionNote key={transaction.hash} hash={transaction.hash} />
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({
  label,
  value,
  icon: Icon,
  mono,
  copyValue,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  mono?: boolean;
  copyValue?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-1 rounded-xl border border-border bg-secondary/60 p-3 sm:grid-cols-[140px_1fr] sm:gap-4">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground">
        {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
        {label}
      </dt>
      <dd
        className={cn(
          "min-w-0 text-sm text-foreground",
          copyValue ? "flex items-start justify-between gap-2" : "wrap-break-word",
          mono && "break-all font-mono",
        )}
      >
        <span className="min-w-0 wrap-break-word">{value}</span>
        {copyValue ? (
          <CopyButton value={copyValue} label={t("action.copyField", { label })} iconOnly />
        ) : null}
      </dd>
    </div>
  );
}

function transactionMatchesTab(transaction: Transaction, tab: string): boolean {
  const effectiveType = resolveUiTransactionType(transaction);
  switch (tab) {
    case "All":
      return true;
    case "Received":
      return (
        effectiveType === "receive" || effectiveType === "miner" || effectiveType === "withdrawal"
      );
    case "Sent":
      return effectiveType === "send" || effectiveType === "fusion";
    case "Deposits":
      return transaction.type === "deposit";
    case "Withdrawals":
      return transaction.type === "withdrawal";
    case "Messages":
      return effectiveType === "message";
    default:
      return true;
  }
}

function groupTransactionDate(timestamp: string): DateGroup {
  const transactionDate = new Date(timestamp);
  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const transactionStart = startOfLocalDay(transactionDate);
  const dayDifference = Math.floor((todayStart - transactionStart) / 86_400_000);

  if (dayDifference <= 0) return "Today";
  if (dayDifference === 1) return "Yesterday";
  if (dayDifference < 7) return "This Week";
  return "Earlier";
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
