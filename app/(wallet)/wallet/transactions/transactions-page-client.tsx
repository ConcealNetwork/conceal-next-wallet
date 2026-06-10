"use client";

import type { LucideIcon } from "lucide-react";
import {
  ArrowDownLeft,
  ArrowUpFromLine,
  ArrowUpRight,
  CalendarClock,
  Combine,
  Hash,
  Lock,
  Mail,
  Pickaxe,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { useTransactions } from "@/lib/hooks";
import { useCountUp } from "@/lib/hooks/use-count-up";
import type { Transaction, TransactionType } from "@/lib/types";
import { isUiMessageOut, resolveUiTransactionType } from "@/lib/wallet-core/mappers";
import {
  ccxToNumber,
  cn,
  formatCcx,
  timeAgo,
  truncateAddress,
  CCX_PRECISION_DECIMAL_DISPLAY,
} from "@/lib/utils";

const tabs = ["All", "Received", "Sent", "Deposits", "Withdrawals", "Messages"];
const pageSizes = ["10", "25", "50"];

type TransactionStatus = "Confirmed" | "Pending";
type DateGroup = "Today" | "Yesterday" | "This Week" | "Earlier";

const dateGroups: DateGroup[] = ["Today", "Yesterday", "This Week", "Earlier"];
const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const transactionMeta: Record<
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

export default function TransactionsPageClient() {
  const { data = [] } = useTransactions();
  const [active, setActive] = useState("All");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState("10");
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<Transaction | null>(null);

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
          formatCcx(transaction.amount),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const matchesSearch = searchTarget.includes(search.trim().toLowerCase());
        return matchesTab && matchesSearch;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [active, data, search]);

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
        title="Transaction History"
        subtitle="Complete transaction history for your wallet"
      />
      <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
        <SectionCard title="Summary" description="Wallet flow across all transactions">
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
            placeholder="Search transactions..."
            className="pl-9"
            aria-label="Search transactions"
          />
        </div>
        <Select value={pageSize} onValueChange={handlePageSizeChange}>
          <SelectTrigger className="md:w-[178px]" aria-label="Transactions per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizes.map((s) => (
              <SelectItem key={s} value={s}>
                Show: {s} per page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="mt-6 animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:90ms]">
        <SectionCard
          title={`${filtered.length} transactions found`}
          description={
            filtered.length > visibleTransactions.length
              ? `Page ${safePage} of ${totalPages} · Showing ${visibleTransactions.length} of ${filtered.length}`
              : "Grouped by transaction date"
          }
        >
          <FilterTabs tabs={tabs} active={active} onChange={handleActiveChange} />
          <div className="mt-5">
            {groupedTransactions.length > 0 ? (
              <div className="space-y-6">
                {groupedTransactions.map((group, groupIndex) => (
                  <TransactionDateGroup
                    key={group.label}
                    group={group}
                    groupIndex={groupIndex}
                    onSelect={setSelected}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No transactions match"
                description="Adjust the active filter or search query to find another transaction."
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
          ariaLabel="Transaction pages"
        />
      )}
      <TransactionDetailsDialog
        transaction={selected}
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
  const totalFlow = received + sent + deposits;
  const flowSegments = [
    {
      label: "In",
      value: received,
      className: "bg-wallet-incoming",
      textClassName: "text-wallet-incoming",
      prefix: "+",
    },
    {
      label: "Out",
      value: sent,
      className: "bg-wallet-outgoing",
      textClassName: "text-wallet-outgoing",
      prefix: "−",
    },
    {
      label: "Deposits",
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
    formatter: (value) => Math.round(value).toLocaleString("en-US"),
  });

  return (
    <div className="space-y-5">
      <div className="grid auto-rows-fr gap-4 md:grid-cols-3">
        <SummaryMetricCard
          label="Total Received"
          value={received}
          prefix="+"
          detail="Incoming transfers"
          tone="incoming"
        />
        <SummaryMetricCard
          label="Total Sent"
          value={sent}
          prefix="−"
          detail="Transfers and withdrawals"
          tone="outgoing"
        />
        <SummaryMetricCard
          label="Total Deposits"
          value={deposits}
          prefix="+"
          detail="Locked deposits"
          tone="deposit"
        />
      </div>
      <div className="rounded-xl border border-border bg-secondary/60 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-muted-foreground">Flow Mix</p>
              <p className="font-mono text-sm text-muted-foreground">
                {transactionCountLabel} transactions
              </p>
            </div>
            <div
              className="mt-3 flex h-3 overflow-hidden rounded-full bg-background"
              aria-hidden="true"
            >
              {flowSegments.map((segment, index) => (
                <span
                  key={segment.label}
                  className={cn("animate-scale-x-in motion-reduce:animate-none", segment.className)}
                  style={{
                    width: `${totalFlow > 0 ? (segment.value / totalFlow) * 100 : 0}%`,
                    animationDelay: `${index * 70}ms`,
                  }}
                />
              ))}
            </div>
            <p className="sr-only">
              Flow mix: {formatCcx(received)} received, {formatCcx(sent)} sent,{" "}
              {formatCcx(deposits)} deposits.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {flowSegments.map((segment) => (
                <div key={segment.label} className="min-w-0">
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
            <p className="text-sm text-muted-foreground">Net Flow</p>
            <p
              className={cn(
                "mt-2 wrap-break-word font-mono text-2xl font-bold",
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
            "mt-3 wrap-break-word font-mono text-2xl font-bold tracking-tight",
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
}: {
  group: { label: DateGroup; transactions: Transaction[] };
  groupIndex: number;
  onSelect: (transaction: Transaction) => void;
}) {
  return (
    <section aria-labelledby={`transactions-${group.label.replace(/\s/g, "-").toLowerCase()}`}>
      <div className="mb-2 flex items-center gap-3">
        <h2
          id={`transactions-${group.label.replace(/\s/g, "-").toLowerCase()}`}
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {group.label}
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
            <TransactionListRow transaction={transaction} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TransactionListRow({
  transaction,
  onSelect,
}: {
  transaction: Transaction;
  onSelect: (transaction: Transaction) => void;
}) {
  const meta = transactionMeta[resolveUiTransactionType(transaction)];
  const status = getTransactionStatus(transaction.confirmations);
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect(transaction)}
      className="group flex w-full cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors duration-200 hover:bg-secondary/70 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:flex-row sm:items-center sm:justify-between"
      aria-label={`${meta.label} transaction for ${formatSignedAmount(transaction)} from ${timeAgo(transaction.timestamp)}`}
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
            <span>{timeAgo(transaction.timestamp)}</span>
            <span aria-hidden="true">•</span>
            <span>{transaction.confirmations} confirmations</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
        <Badge variant="secondary" className="sm:hidden">
          {meta.label}
        </Badge>
        <span className={cn("font-mono text-base font-semibold", meta.amountClassName)}>
          <CcxAmount>{formatSignedAmount(transaction)}</CcxAmount>
        </span>
        <span className="hidden text-xs text-muted-foreground sm:block">{meta.label}</span>
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
  if (!transaction) {
    return null;
  }

  const meta = transactionMeta[resolveUiTransactionType(transaction)];
  const status = getTransactionStatus(transaction.confirmations);
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
              <DialogTitle>{meta.label} Transaction</DialogTitle>
              <DialogDescription>
                {formatTimestamp(transaction.timestamp)} · {transaction.confirmations} confirmations
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
          <div>
            <p className="text-sm text-muted-foreground">Signed Amount</p>
            <p className={cn("mt-1 font-mono text-3xl font-bold", meta.amountClassName)}>
              <CcxAmount>
                {formatSignedAmount(transaction, CCX_PRECISION_DECIMAL_DISPLAY)}
              </CcxAmount>
            </p>
          </div>
          <StatusPill status={status} />
        </div>

        <dl className="grid gap-3">
          <DetailRow label="Type" value={meta.label} />
          <DetailRow
            label="Timestamp"
            value={formatTimestamp(transaction.timestamp)}
            icon={CalendarClock}
          />
          <DetailRow
            label="Confirmations"
            value={transaction.confirmations.toLocaleString("en-US")}
          />
          <DetailRow label="Status" value={status} />
          <DetailRow label="Payment ID" value={transaction.paymentId ?? "Not provided"} />
          <DetailRow label="Message" value={transaction.message ?? "Not provided"} />
          <DetailRow label="Transaction Hash" value={transaction.hash} icon={Hash} mono />
        </dl>

        <div className="rounded-xl border border-border bg-secondary/60 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Full Address</p>
              <p className="mt-2 break-all font-mono text-sm text-foreground">
                {transaction.address}
              </p>
            </div>
            <CopyButton value={transaction.address} label="Copy address" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({
  label,
  value,
  icon: Icon,
  mono,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1 rounded-xl border border-border bg-secondary/60 p-3 sm:grid-cols-[140px_1fr] sm:gap-4">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground">
        {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
        {label}
      </dt>
      <dd
        className={cn(
          "min-w-0 wrap-break-word text-sm text-foreground",
          mono && "break-all font-mono",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function StatusPill({ status }: { status: TransactionStatus }) {
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

function getTransactionStatus(confirmations: number): TransactionStatus {
  return confirmations >= 10 ? "Confirmed" : "Pending";
}

function formatSignedAmount(transaction: Transaction, decimals?: number) {
  const effectiveType = resolveUiTransactionType(transaction);
  const meta = transactionMeta[effectiveType];
  const sign = effectiveType === "message" && isUiMessageOut(transaction) ? "−" : meta.sign;
  return `${sign}${formatCcx(transaction.amount, decimals)}`;
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

function formatTimestamp(timestamp: string) {
  return timestampFormatter.format(new Date(timestamp));
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
