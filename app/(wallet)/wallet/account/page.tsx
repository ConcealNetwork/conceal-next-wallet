"use client";

import { RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceHero, BalanceHeroSkeleton } from "@/components/wallet/balance-hero";
import { CcxAmount } from "@/components/wallet/ccx";
import { PageHeader, SectionCard } from "@/components/wallet/common";
import { useCountUp, usePrefersReducedMotion } from "@/lib/hooks/use-count-up";
import type { MarketData, Transaction, TransactionType, WalletInfo } from "@/lib/types";
import {
  useDeposits,
  useMarketData,
  useRefreshWallet,
  useTransactions,
  useWalletInfo,
} from "@/lib/hooks";
import {
  ccxToNumber,
  cn,
  formatCcx,
  formatUsd,
  timeAgo,
  truncateAddress,
  walletBalanceUsd,
} from "@/lib/utils";

const Area = dynamic(() => import("recharts").then((mod) => mod.Area), { ssr: false });
const AreaChart = dynamic(() => import("recharts").then((mod) => mod.AreaChart), { ssr: false });
const ResponsiveContainer = dynamic(
  () => import("recharts").then((mod) => mod.ResponsiveContainer),
  { ssr: false },
);
const Tooltip = dynamic(() => import("recharts").then((mod) => mod.Tooltip), { ssr: false });

export default function AccountPage() {
  const wallet = useWalletInfo();
  const transactions = useTransactions();
  const market = useMarketData();
  const deposits = useDeposits();
  const refresh = useRefreshWallet();
  const info = wallet.data;
  const isSyncing =
    info !== undefined && info.networkHeight > 0 && info.currentHeight < info.networkHeight - 1;
  const syncPct =
    info && info.networkHeight > 0
      ? Math.min(100, Math.round((info.currentHeight / info.networkHeight) * 100))
      : 0;

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
      {isSyncing && info && (
        <div
          className="mb-4 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground"
          role="status"
        >
          Syncing blockchain… block {info.currentHeight.toLocaleString()} /{" "}
          {info.networkHeight.toLocaleString()} ({syncPct}%)
        </div>
      )}
      <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
        {info && market.data && deposits.data ? (
          <BalanceHero wallet={info} market={market.data} deposits={deposits.data} />
        ) : (
          <BalanceHeroSkeleton />
        )}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="h-full animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:70ms]">
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
                lastActivity="1h ago"
              />
            )}
            {transactions.data && transactions.data.length > 0 ? (
              <RecentActivityList transactions={transactions.data.slice(0, 5)} />
            ) : null}
          </SectionCard>
        </div>
        <div className="h-full animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:140ms]">
          <SectionCard
            title="Market Summary"
            description="Live CCX price and your holdings"
            fill
            footer={
              <Link
                className="inline-flex cursor-pointer rounded-sm text-sm font-semibold text-primary transition-[color,transform] duration-200 hover:text-primary/80 active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-reduce:active:scale-100 motion-reduce:transition-none"
                href="/wallet/market"
              >
                View Full Market →
              </Link>
            }
          >
            {info && market.data ? (
              <MarketSummaryHybrid market={market.data} walletInfo={info} />
            ) : (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-10 w-36" />
                  </div>
                  <Skeleton className="h-7 w-20 rounded-full" />
                </div>
                <Skeleton className="h-[60px] w-full" />
                <Skeleton className="h-px w-full" />
                <div className="flex gap-5">
                  <Skeleton className="size-[120px] rounded-full" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  );
}

function TransactionFlowSummary({
  received,
  sent,
  deposits,
  transactionCount,
  lastActivity,
}: {
  received: number;
  sent: number;
  deposits: number;
  transactionCount: number;
  lastActivity: string;
}) {
  const total = received + sent + deposits;
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

function MarketSummaryHybrid({
  market,
  walletInfo,
}: {
  market: MarketData;
  walletInfo: WalletInfo;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const available = ccxToNumber(walletInfo.available);
  const locked = ccxToNumber(walletInfo.lockedDeposits);
  const staking = ccxToNumber(walletInfo.staking);
  const holdingsTotal = available + locked + staking;
  const portfolioUsd = walletBalanceUsd(walletInfo.balanceTotal, market.price.value);
  const marketPriceLabel = useCountUp(market.price.value, {
    formatter: (value) => formatUsd(value, 3),
  });
  const segments = [
    {
      label: "Available",
      value: available,
      className: "text-primary",
      stroke: "hsl(var(--primary))",
      dotClassName: "bg-primary",
    },
    {
      label: "Locked",
      value: locked,
      className: "text-wallet-deposit",
      stroke: "hsl(var(--chart-1))",
      dotClassName: "bg-wallet-deposit",
    },
    {
      label: "Staking",
      value: staking,
      className: "text-wallet-incoming",
      stroke: "hsl(var(--chart-2))",
      dotClassName: "bg-wallet-incoming",
    },
  ];
  let offset = 25;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">CCX / USD</p>
          <p className="mt-1 font-mono text-4xl font-bold leading-none tracking-tight text-primary">
            {marketPriceLabel}
          </p>
        </div>
        <span
          role="status"
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-wallet-incoming/10 px-2.5 py-1 text-xs font-semibold text-wallet-incoming"
          aria-label={`CCX price up ${market.change24hPct.toFixed(2)} percent`}
        >
          <span aria-hidden="true">▲</span>
          {market.change24hPct.toFixed(2)}%
        </span>
      </div>
      <div className="mt-3 h-[60px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={market.history} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="accountMarketFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <Tooltip
              cursor={{ stroke: "hsl(var(--border))" }}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 12,
                color: "hsl(var(--foreground))",
              }}
              formatter={(value) => [formatUsd(Number(value), 3), "Price"]}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2}
              fill="url(#accountMarketFill)"
              isAnimationActive={!prefersReducedMotion}
              animationDuration={700}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="my-5 h-px bg-border" />
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative size-[120px] shrink-0">
          <svg className="size-[120px]" viewBox="0 0 42 42" aria-hidden="true">
            <circle
              cx="21"
              cy="21"
              r="15.9"
              fill="none"
              stroke="hsl(var(--secondary))"
              strokeWidth="4.5"
            />
            {segments.map((segment, index) => {
              const pct = holdingsTotal > 0 ? (segment.value / holdingsTotal) * 100 : 0;
              const dashOffset = offset;
              offset -= pct;
              return (
                <circle
                  key={segment.label}
                  cx="21"
                  cy="21"
                  r="15.9"
                  fill="none"
                  stroke={segment.stroke}
                  strokeWidth="4.5"
                  strokeDasharray={`${pct} ${100 - pct}`}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="butt"
                  transform="rotate(-90 21 21)"
                  className="animate-donut-sweep motion-reduce:animate-none"
                  style={
                    {
                      "--donut-offset": dashOffset,
                      "--donut-pct": pct,
                      animationDelay: `${index * 80}ms`,
                    } as CSSProperties
                  }
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Holdings</p>
            <p className="font-mono text-sm font-semibold leading-tight">
              {formatCcx(holdingsTotal).replace(" CCX", "")}
            </p>
            <p className="text-[10px] text-primary">CCX</p>
          </div>
        </div>
        <div className="flex-1 space-y-2.5">
          {segments.map((segment) => {
            const pct = holdingsTotal > 0 ? (segment.value / holdingsTotal) * 100 : 0;
            return (
              <div key={segment.label} className="flex items-center gap-2 text-sm">
                <span
                  className={cn("size-2.5 shrink-0 rounded-[3px]", segment.dotClassName)}
                  aria-hidden="true"
                />
                <span>{segment.label}</span>
                <span className="ml-auto font-mono text-muted-foreground">
                  {formatCcx(segment.value).replace(" CCX", "")}
                </span>
                <span className="w-10 text-right font-mono text-muted-foreground">
                  {Math.round(pct)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
        <div>
          <p className="text-xs text-muted-foreground">Portfolio Value</p>
          <p className="mt-1 font-mono text-base font-semibold">{formatUsd(portfolioUsd)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">24h Volume</p>
          <p className="mt-1 font-mono text-base font-semibold">{formatUsd(market.volume24h, 0)}</p>
        </div>
      </div>
    </div>
  );
}
