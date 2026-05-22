"use client"

import { Clock, Lock, RefreshCw, ShieldCheck, Wallet } from "lucide-react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader, SectionCard, StatCard } from "@/components/wallet/common"
import type { MarketData, WalletInfo } from "@/lib/types"
import { useMarketData, useRefreshWallet, useTransactions, useWalletInfo } from "@/lib/hooks"
import { ccxToNumber, cn, formatCcx, formatUsd } from "@/lib/utils"

const Area = dynamic(() => import("recharts").then((mod) => mod.Area), { ssr: false })
const AreaChart = dynamic(() => import("recharts").then((mod) => mod.AreaChart), { ssr: false })
const ResponsiveContainer = dynamic(() => import("recharts").then((mod) => mod.ResponsiveContainer), { ssr: false })
const Tooltip = dynamic(() => import("recharts").then((mod) => mod.Tooltip), { ssr: false })

export default function AccountPage() {
  const wallet = useWalletInfo()
  const transactions = useTransactions()
  const market = useMarketData()
  const refresh = useRefreshWallet()
  const info = wallet.data

  const totals = (transactions.data ?? []).reduce(
    (acc, transaction) => {
      const value = ccxToNumber(transaction.amount)
      if (transaction.type === "receive") acc.received += value
      if (transaction.type === "send") acc.sent += value
      if (transaction.type === "deposit") acc.deposits += value
      return acc
    },
    { received: 0, sent: 0, deposits: 0 }
  )

  return (
    <>
      <PageHeader
        title="Account Overview"
        subtitle="Manage your CCX holdings and view transaction summary"
        action={
          <Button type="button" onClick={() => refresh.mutate()} disabled={refresh.isPending} className="gap-2">
            <RefreshCw className={cn("size-4", refresh.isPending && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
            {refresh.isPending ? "Refreshing" : "Refresh"}
          </Button>
        }
      />
      {info ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <StatCard
            label="Total Balance"
            value={formatCcx(info.balanceTotal)}
            detail="$56.2725 USD"
            icon={<Wallet />}
            trend={info.trends?.balanceTotal?.trend}
            changePct={info.trends?.balanceTotal?.changePct}
          />
          <StatCard
            label="Available"
            value={formatCcx(info.available)}
            detail="Ready to spend"
            trend={info.trends?.available?.trend}
            changePct={info.trends?.available?.changePct}
          />
          <StatCard label="Pending" value={formatCcx(info.pending)} detail="Awaiting confirmation" icon={<Clock />} />
          <StatCard
            label="Locked Deposits"
            value={formatCcx(info.lockedDeposits)}
            detail="In time-locked deposits"
            icon={<Lock />}
          />
          <StatCard
            label="Staking"
            value={formatCcx(info.staking)}
            detail="Earning rewards"
            icon={<ShieldCheck />}
            trend={info.trends?.staking?.trend}
            changePct={info.trends?.staking?.changePct}
          />
          <StatCard label="Withdrawable" value={formatCcx(info.withdrawable)} detail="Available for withdrawal" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="wallet-card min-h-[136px] space-y-4 p-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      )}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <SectionCard title="Transaction Summary" description="Net flow this period">
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
          <Link
            className="mt-4 inline-flex cursor-pointer rounded-sm text-sm font-semibold text-primary transition-colors duration-200 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href="/wallet/transactions"
          >
            View All Transactions →
          </Link>
        </SectionCard>
        <SectionCard title="Market Summary" description="Live CCX price and your holdings">
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
          <Link
            className="mt-4 inline-flex cursor-pointer rounded-sm text-sm font-semibold text-primary transition-colors duration-200 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href="/wallet/market"
          >
            View Full Market →
          </Link>
        </SectionCard>
      </div>
    </>
  )
}

function TransactionFlowSummary({
  received,
  sent,
  deposits,
  transactionCount,
  lastActivity,
}: {
  received: number
  sent: number
  deposits: number
  transactionCount: number
  lastActivity: string
}) {
  const total = received + sent + deposits
  const segments = [
    { label: "In", value: received, className: "bg-wallet-incoming", textClassName: "text-wallet-incoming", prefix: "+" },
    { label: "Out", value: sent, className: "bg-wallet-outgoing", textClassName: "text-wallet-outgoing", prefix: "" },
    { label: "Deposits", value: deposits, className: "bg-wallet-deposit", textClassName: "text-wallet-deposit", prefix: "+" },
  ]

  return (
    <div>
      <div
        className="flex h-3 overflow-hidden rounded-full bg-secondary"
        aria-hidden="true"
      >
        {segments.map((segment) => (
          <span
            key={segment.label}
            className={segment.className}
            style={{ width: `${total > 0 ? (segment.value / total) * 100 : 0}%` }}
          />
        ))}
      </div>
      <p className="sr-only">
        Transaction flow: {formatCcx(received)} received, {formatCcx(sent)} sent, {formatCcx(deposits)} deposits.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {segments.map((segment) => (
          <div key={segment.label} className="min-w-0">
            <p className="text-xs text-muted-foreground">{segment.label}</p>
            <p className={cn("mt-1 truncate font-mono text-base font-semibold", segment.textClassName)}>
              {segment.prefix}
              {formatCcx(segment.value)}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        {transactionCount} transactions · last activity {lastActivity}
      </p>
    </div>
  )
}

function MarketSummaryHybrid({ market, walletInfo }: { market: MarketData; walletInfo: WalletInfo }) {
  const available = ccxToNumber(walletInfo.available)
  const locked = ccxToNumber(walletInfo.lockedDeposits)
  const staking = ccxToNumber(walletInfo.staking)
  const holdingsTotal = available + locked + staking
  const segments = [
    { label: "Available", value: available, className: "text-primary", stroke: "hsl(var(--primary))", dotClassName: "bg-primary" },
    { label: "Locked", value: locked, className: "text-wallet-deposit", stroke: "hsl(var(--chart-1))", dotClassName: "bg-wallet-deposit" },
    { label: "Staking", value: staking, className: "text-wallet-incoming", stroke: "hsl(var(--chart-2))", dotClassName: "bg-wallet-incoming" },
  ]
  let offset = 25

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">CCX / USD</p>
          <p className="mt-1 font-mono text-4xl font-bold leading-none tracking-tight text-primary">
            {formatUsd(market.price, 3)}
          </p>
        </div>
        <span
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
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="my-5 h-px bg-border" />
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative size-[120px] shrink-0">
          <svg className="size-[120px]" viewBox="0 0 42 42" aria-hidden="true">
            <circle cx="21" cy="21" r="15.9" fill="none" stroke="hsl(var(--secondary))" strokeWidth="4.5" />
            {segments.map((segment) => {
              const pct = holdingsTotal > 0 ? (segment.value / holdingsTotal) * 100 : 0
              const dashOffset = offset
              offset -= pct
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
                />
              )
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Holdings</p>
            <p className="font-mono text-sm font-semibold leading-tight">{formatCcx(holdingsTotal).replace(" CCX", "")}</p>
            <p className="text-[10px] text-muted-foreground">CCX</p>
          </div>
        </div>
        <div className="flex-1 space-y-2.5">
          {segments.map((segment) => {
            const pct = holdingsTotal > 0 ? (segment.value / holdingsTotal) * 100 : 0
            return (
              <div key={segment.label} className="flex items-center gap-2 text-sm">
                <span className={cn("size-2.5 shrink-0 rounded-[3px]", segment.dotClassName)} aria-hidden="true" />
                <span>{segment.label}</span>
                <span className="ml-auto font-mono text-muted-foreground">{formatCcx(segment.value).replace(" CCX", "")}</span>
                <span className="w-10 text-right font-mono text-muted-foreground">{Math.round(pct)}%</span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
        <div>
          <p className="text-xs text-muted-foreground">Portfolio Value</p>
          <p className="mt-1 font-mono text-base font-semibold">{formatUsd(market.portfolioValueUsd)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">24h Volume</p>
          <p className="mt-1 font-mono text-base font-semibold">{formatUsd(market.volume24h, 0)}</p>
        </div>
      </div>
    </div>
  )
}
