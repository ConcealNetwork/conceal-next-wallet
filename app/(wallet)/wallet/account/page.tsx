"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { AccountRail } from "@/components/layout/rails/account-rail";
import { usePageRightRail } from "@/components/layout/right-rail";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceHero, BalanceHeroSkeleton } from "@/components/wallet/balance-hero";
import { CcxAmount } from "@/components/wallet/ccx";
import { PageHeader, SectionCard, ViewOnlyBadge } from "@/components/wallet/common";
import { WalletSyncingBanner } from "@/components/wallet/syncing-banner";
import { ViewOnlyBanner } from "@/components/wallet/view-only-banner";
import {
  useDeposits,
  useMarketData,
  useRefreshWallet,
  useTransactions,
  useWalletInfo,
  useWalletViewOnly,
} from "@/lib/hooks";
import { useFormatters } from "@/lib/i18n/use-formatters";
import type { Transaction, TransactionType } from "@/lib/types";
import { ccxToNumber, cn, truncateAddress } from "@/lib/utils";

export default function AccountPage() {
  // Register the Account rail (Market + Holdings + Quick actions) in the
  // contextual right column. The rail element is registered once on mount; its
  // sections read their own hooks to stay live.
  usePageRightRail(<AccountRail />);

  const wallet = useWalletInfo();
  const viewOnly = useWalletViewOnly();
  const transactions = useTransactions();
  const market = useMarketData();
  const deposits = useDeposits();
  const refresh = useRefreshWallet();
  const info = wallet.data;

  const totals = (transactions.data ?? []).reduce(
    (acc, transaction) => {
      const value = ccxToNumber(transaction.amount);
      if (
        transaction.type === "receive" ||
        transaction.type === "miner" ||
        transaction.type === "withdrawal"
      ) {
        acc.received += value;
      }
      if (transaction.type === "send" || transaction.type === "fusion") acc.sent += value;
      if (transaction.type === "deposit") acc.deposits += value;
      return acc;
    },
    { received: 0, sent: 0, deposits: 0 },
  );

  return (
    <>
      <PageHeader
        title="Account Overview"
        subtitle="Manage your CCX holdings and view transaction summary"
        badge={viewOnly ? <ViewOnlyBadge /> : null}
        action={
          <Button
            type="button"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="gap-2 active:scale-[0.98] motion-reduce:active:scale-100"
          >
            <RefreshCw
              className={cn(
                "size-4",
                refresh.isPending && "animate-spin motion-reduce:animate-none",
              )}
              aria-hidden="true"
            />
            {refresh.isPending ? "Refreshing" : "Refresh"}
          </Button>
        }
      />
      <WalletSyncingBanner />
      <ViewOnlyBanner />
      {wallet.isError && (
        <div
          className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          Could not load wallet data:{" "}
          {wallet.error instanceof Error ? wallet.error.message : "Unknown error"}
        </div>
      )}
      <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
        {info && market.data && deposits.data ? (
          <BalanceHero wallet={info} market={market.data} deposits={deposits.data} />
        ) : (
          <BalanceHeroSkeleton />
        )}
      </div>
      <div className="mt-6 animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:70ms]">
        <SectionCard
          title="Transaction Summary"
          description="Net flow this period"
          fill
          footer={
            <Link
              className="inline-flex cursor-pointer rounded-sm text-sm font-semibold text-primary transition-[color,transform] duration-200 hover:text-primary/80 active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-reduce:active:scale-100 motion-reduce:transition-none"
              href="/wallet/transactions"
            >
              View All Transactions →
            </Link>
          }
        >
          {transactions.isLoading ? (
            <div className="space-y-5">
              <Skeleton className="h-3 w-full rounded-full" />
              <div className="grid gap-4 sm:grid-cols-3">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
              <Skeleton className="h-4 w-48" />
            </div>
          ) : (
            <TransactionFlowSummary
              received={totals.received}
              sent={totals.sent}
              deposits={totals.deposits}
              transactionCount={transactions.data?.length ?? 0}
              lastActivityAt={transactions.data?.[0]?.timestamp}
            />
          )}
          {transactions.data && transactions.data.length > 0 ? (
            <RecentActivityList transactions={transactions.data.slice(0, 5)} />
          ) : null}
        </SectionCard>
      </div>
      {/* Small-screen fallback: the contextual rail column is hidden < 1200px,
          so surface its Market + Holdings + Quick-actions summary inline here.
          Above the rail breakpoint this is CSS-hidden and the rail shows it. */}
      <div className="mt-6 animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:140ms] min-[1200px]:hidden">
        <AccountRail embedded />
      </div>
    </>
  );
}

function TransactionFlowSummary({
  received,
  sent,
  deposits,
  transactionCount,
  lastActivityAt,
}: {
  received: number;
  sent: number;
  deposits: number;
  transactionCount: number;
  lastActivityAt?: string;
}) {
  const { formatCcx, timeAgo } = useFormatters();
  const total = received + sent + deposits;
  const lastActivity = lastActivityAt ? timeAgo(lastActivityAt) : "—";
  const segments = [
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
      prefix: "",
    },
    {
      label: "Deposits",
      value: deposits,
      className: "bg-wallet-deposit",
      textClassName: "text-wallet-deposit",
      prefix: "+",
    },
  ];

  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
        {segments.map((segment, index) => (
          <span
            key={segment.label}
            className={cn("animate-scale-x-in motion-reduce:animate-none", segment.className)}
            style={{
              width: `${total > 0 ? (segment.value / total) * 100 : 0}%`,
              animationDelay: `${index * 70}ms`,
            }}
          />
        ))}
      </div>
      <p className="sr-only">
        Transaction flow: {formatCcx(received)} received, {formatCcx(sent)} sent,{" "}
        {formatCcx(deposits)} deposits.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {segments.map((segment) => (
          <div key={segment.label} className="min-w-0">
            <p className="text-xs text-muted-foreground">{segment.label}</p>
            <p
              className={cn(
                "mt-1 truncate font-mono text-base font-semibold",
                segment.textClassName,
              )}
            >
              {segment.prefix}
              <CcxAmount>{formatCcx(segment.value)}</CcxAmount>
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        {transactionCount} transactions · last activity {lastActivity}
      </p>
    </div>
  );
}

const TX_META: Record<TransactionType, { label: string; sign: string; className: string }> = {
  receive: { label: "Receive", sign: "+", className: "text-wallet-incoming" },
  miner: { label: "Miner", sign: "+", className: "text-wallet-incoming" },
  message: { label: "Message", sign: "+", className: "text-primary" },
  deposit: { label: "Deposit", sign: "+", className: "text-wallet-deposit" },
  send: { label: "Send", sign: "−", className: "text-wallet-outgoing" },
  withdrawal: { label: "Withdraw", sign: "+", className: "text-wallet-incoming" },
  fusion: { label: "Fusion", sign: "−", className: "text-muted-foreground" },
};

function RecentActivityList({ transactions }: { transactions: Transaction[] }) {
  const { formatCcx, timeAgo } = useFormatters();
  return (
    <div className="mt-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Recent Activity
      </p>
      <ul className="mt-1 divide-y divide-border">
        {transactions.map((transaction, index) => {
          const meta = TX_META[transaction.type];
          const sign = transaction.type === "message" && transaction.outgoing ? "−" : meta.sign;
          return (
            <li
              key={transaction.id}
              className="animate-rise-in flex items-center justify-between gap-3 py-2.5 motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100"
              style={{ animationDelay: `${180 + index * 40}ms` }}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-[10.5px] text-muted-foreground">
                  {meta.label}
                </span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {truncateAddress(transaction.address)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className={cn("font-mono text-sm font-medium", meta.className)}>
                  {sign}
                  <CcxAmount>{formatCcx(transaction.amount)}</CcxAmount>
                </span>
                <span className="hidden w-16 text-right text-xs text-muted-foreground sm:inline">
                  {timeAgo(transaction.timestamp)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
