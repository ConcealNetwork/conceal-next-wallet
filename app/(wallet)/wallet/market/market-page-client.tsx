"use client";

import { RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useQuery } from "@/lib/hooks/query-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CcxAmount } from "@/components/wallet/ccx";
import { PageHeader, SectionCard } from "@/components/wallet/common";
import { queryKeys, useMarketData, useWalletInfo } from "@/lib/hooks";
import { useCountUp, usePrefersReducedMotion } from "@/lib/hooks/use-count-up";
import { marketHistoryQueryOptions } from "@/lib/services/query-options";
import { services } from "@/lib/services";
import type { MarketData, MarketHistoryPoint, MarketTimeframe, WalletInfo } from "@/lib/types";
import { ccxToNumber, cn, formatCcx, formatUsd } from "@/lib/utils";

const Area = dynamic(() => import("recharts").then((mod) => mod.Area), { ssr: false });
const AreaChart = dynamic(() => import("recharts").then((mod) => mod.AreaChart), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((mod) => mod.CartesianGrid), {
  ssr: false,
});
const ResponsiveContainer = dynamic(
  () => import("recharts").then((mod) => mod.ResponsiveContainer),
  { ssr: false },
);
const Tooltip = dynamic(() => import("recharts").then((mod) => mod.Tooltip), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((mod) => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((mod) => mod.YAxis), { ssr: false });

const TIMEFRAMES: MarketTimeframe[] = ["24H", "7D", "30D", "90D"];

export default function MarketPage() {
  const [activeRange, setActiveRange] = useState<MarketTimeframe>("30D");
  const market = useMarketData();
  const wallet = useWalletInfo();
  const data = market.data;
  const historyQuery = useQuery({
    queryKey: [...queryKeys.market, "history", activeRange],
    queryFn: () => services.market.getPriceHistory(activeRange),
    enabled: Boolean(data),
    ...marketHistoryQueryOptions,
  });
  const chartData = historyQuery.data ?? data?.historyByTimeframe[activeRange] ?? [];

  return (
    <>
      <PageHeader
        title="Market Data"
        subtitle="Conceal Network (CCX) price, range history, and market metrics"
        action={
          <Button
            type="button"
            onClick={() => void market.refetch()}
            disabled={market.isFetching}
            className="gap-2 active:scale-[0.98] motion-reduce:active:scale-100"
          >
            <RefreshCw
              className={cn(
                "size-4",
                market.isFetching && "animate-spin motion-reduce:animate-none",
              )}
              aria-hidden="true"
            />
            {market.isFetching ? "Refreshing" : "Refresh"}
          </Button>
        }
      />

      <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
        {data && wallet.data ? (
          <PriceHero market={data} walletInfo={wallet.data} />
        ) : (
          <PriceHeroSkeleton />
        )}
      </div>

      <div className="mt-6 animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:70ms]">
        <SectionCard
          title="Price History"
          description={`${activeRange} CCX / USD trend`}
          className="min-h-[470px]"
        >
          <div className="flex justify-start sm:justify-end">
            <TimeframeToggle active={activeRange} onChange={setActiveRange} />
          </div>
          <div className="mt-5 h-[390px]">
            {market.isLoading ? (
              <ChartSkeleton />
            ) : (
              <PriceAreaChart data={chartData} range={activeRange} />
            )}
          </div>
        </SectionCard>
      </div>

      <div className="mt-8 animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:140ms]">
        <h2 className="text-lg font-semibold text-foreground">Market Metrics</h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">CCX market snapshot</p>
        {data ? <MarketStatsGrid market={data} /> : <StatsSkeleton />}
      </div>
    </>
  );
}

function PriceHero({ market, walletInfo }: { market: MarketData; walletInfo: WalletInfo }) {
  const balance = ccxToNumber(walletInfo.balanceTotal);
  const holdingsUsd = balance * market.price.value;
  const priceLabel = useCountUp(market.price.value, {
    formatter: (value) => formatUsd(value, 4),
  });
  const holdingsUsdLabel = useCountUp(holdingsUsd, {
    formatter: (value) => formatUsd(value, 2),
  });
  const isPositive = market.change24hPct >= 0;

  return (
    <SectionCard className="overflow-hidden">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            CCX / USD
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h2 className="font-mono text-5xl font-semibold leading-none tracking-tight text-primary sm:text-6xl">
              {priceLabel}
            </h2>
            <DeltaChip change={market.change24hPct} />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Your holdings:{" "}
            <span className="font-mono font-semibold text-foreground">
              <CcxAmount>{formatCcx(walletInfo.balanceTotal)}</CcxAmount>
            </span>{" "}
            <span aria-hidden="true">≈</span>
            <span className="sr-only">approximately</span>{" "}
            <span className="font-mono font-semibold text-foreground">{holdingsUsdLabel}</span>
          </p>
        </div>
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            isPositive
              ? "border-wallet-incoming/30 bg-wallet-incoming/10 text-wallet-incoming"
              : "border-wallet-outgoing/30 bg-wallet-outgoing/10 text-wallet-outgoing",
          )}
        >
          <p className="font-medium">{isPositive ? "Trading above" : "Trading below"} yesterday</p>
          <p className="mt-1 font-mono text-lg font-semibold">{formatUsd(market.price.value, 4)}</p>
        </div>
      </div>
    </SectionCard>
  );
}

function DeltaChip({ change }: { change: number }) {
  const isPositive = change >= 0;

  return (
    <span
      role="status"
      className={cn(
        "inline-flex min-h-8 items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold",
        isPositive
          ? "bg-wallet-incoming/10 text-wallet-incoming"
          : "bg-wallet-outgoing/10 text-wallet-outgoing",
      )}
      aria-label={`CCX price ${isPositive ? "up" : "down"} ${Math.abs(change).toFixed(2)} percent over 24 hours`}
    >
      <span aria-hidden="true">{isPositive ? "▲" : "▼"}</span>
      {isPositive ? "+" : "−"}
      {Math.abs(change).toFixed(2)}%
    </span>
  );
}

function TimeframeToggle({
  active,
  onChange,
}: {
  active: MarketTimeframe;
  onChange: (range: MarketTimeframe) => void;
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
      <legend className="sr-only">Price chart timeframe</legend>
      {TIMEFRAMES.map((range) => (
        <button
          key={range}
          type="button"
          onClick={() => onChange(range)}
          aria-pressed={active === range}
          className={cn(
            "min-h-10 cursor-pointer rounded-xl border border-border px-4 text-sm font-semibold text-muted-foreground transition-[border-color,color,background-color,transform] duration-200 hover:border-ring hover:text-foreground active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-reduce:active:scale-100 motion-reduce:transition-none",
            active === range &&
              "border-primary bg-primary text-primary-foreground hover:text-primary-foreground",
          )}
        >
          {range}
        </button>
      ))}
    </fieldset>
  );
}

function PriceAreaChart({ data, range }: { data: MarketHistoryPoint[]; range: MarketTimeframe }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const prices = useMemo(() => data.map((point) => point.price), [data]);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const domainPadding = Math.max((maxPrice - minPrice) * 0.18, 0.0008);

  if (data.length === 0) {
    return (
      <div className="grid h-full place-items-center rounded-xl border border-dashed border-border bg-secondary/60 p-6 text-center text-sm text-muted-foreground">
        No price history available for {range}.
      </div>
    );
  }

  return (
    <>
      <p className="sr-only">
        {range} CCX price chart from {formatUsd(minPrice, 4)} to {formatUsd(maxPrice, 4)}.
      </p>
      <ResponsiveContainer width="100%" height={390}>
        <AreaChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="marketPriceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.36} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="date"
            stroke="hsl(var(--muted-foreground))"
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            interval="preserveStartEnd"
          />
          <YAxis
            width={64}
            stroke="hsl(var(--muted-foreground))"
            tickLine={false}
            axisLine={false}
            domain={[minPrice - domainPadding, maxPrice + domainPadding]}
            tickFormatter={(value) => formatUsd(Number(value), 3)}
          />
          <Tooltip
            cursor={{ stroke: "hsl(var(--border))" }}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              color: "hsl(var(--foreground))",
            }}
            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
            formatter={(value) => [formatUsd(Number(value), 4), "Price"]}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke="hsl(var(--primary))"
            strokeWidth={3}
            fill="url(#marketPriceFill)"
            isAnimationActive={!prefersReducedMotion}
            animationDuration={800}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </>
  );
}

const TILE =
  "wallet-card animate-rise-in flex min-h-[148px] flex-col justify-between gap-3 p-5 motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100";
const tileDelay = (index: number) => ({ animationDelay: `${180 + index * 40}ms` });

function MarketStatsGrid({ market }: { market: MarketData }) {
  return (
    <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <ChangeMetric market={market} index={0} />
      <RangeMetric market={market} index={1} />
      <ValueMetric
        index={2}
        label="24h Volume"
        value={market.volume24h.value}
        formatter={(v) => formatUsd(v, 0)}
        detail="Trading volume"
      />
      <ValueMetric
        index={3}
        label="Market Cap"
        value={market.marketCap.value}
        formatter={(v) => formatUsd(v, 0)}
        detail="Price × circulating supply"
        tone="amber"
      />
      <ValueMetric
        index={4}
        label="Circulating Supply"
        value={ccxToNumber(market.circulatingSupply)}
        formatter={(v) => formatCcx(v, 0)}
        detail="Estimated CCX in market"
      />
      {market.ath ? <AthMetric market={market} index={5} /> : null}
    </div>
  );
}

function ValueMetric({
  label,
  value,
  formatter,
  detail,
  tone = "default",
  index,
}: {
  label: string;
  value: number;
  formatter: (value: number) => string;
  detail: string;
  tone?: "default" | "amber";
  index: number;
}) {
  const display = useCountUp(value, { formatter });
  return (
    <div className={TILE} style={tileDelay(index)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div>
        <p
          className={cn(
            "wrap-break-word font-mono text-2xl font-bold tracking-tight",
            tone === "amber" ? "text-primary" : "text-foreground",
          )}
        >
          <CcxAmount>{display}</CcxAmount>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function ChangeMetric({ market, index }: { market: MarketData; index: number }) {
  const positive = market.change24hPct >= 0;
  const display = useCountUp(market.change24hPct, {
    formatter: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`,
  });
  const toneClass = positive ? "text-wallet-incoming" : "text-wallet-outgoing";
  return (
    <div className={TILE} style={tileDelay(index)}>
      <div className="flex items-start justify-between">
        <p className="text-sm text-muted-foreground">24h Change</p>
        <span aria-hidden="true" className={cn("text-xs", toneClass)}>
          {positive ? "▲" : "▼"}
        </span>
      </div>
      <p className={cn("font-mono text-2xl font-bold tracking-tight", toneClass)}>{display}</p>
      <Sparkline values={market.history.map((point) => point.price)} positive={positive} />
    </div>
  );
}

function Sparkline({ values, positive }: { values: number[]; positive: boolean }) {
  if (values.length < 2) return <div className="h-9" />;
  const width = 240;
  const height = 36;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map(
      (value, index) =>
        `${(index * step).toFixed(1)},${(height - ((value - min) / range) * (height - 4) - 2).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("h-9 w-full", positive ? "text-wallet-incoming" : "text-wallet-outgoing")}
    >
      <polyline
        className="animate-stroke-draw motion-reduce:animate-none"
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={1}
        pathLength={1}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function RangeMetric({ market, index }: { market: MarketData; index: number }) {
  const low = market.low24h.value;
  const high = market.high24h.value;
  const price = market.price.value;
  const pct = high > low ? Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100)) : 50;
  return (
    <div className={TILE} style={tileDelay(index)}>
      <p className="text-sm text-muted-foreground">24h Range</p>
      <div>
        <p className="font-mono text-2xl font-bold tracking-tight">{formatUsd(price, 4)}</p>
        <p className="mt-1 text-sm text-muted-foreground">Current price within 24h range</p>
      </div>
      <div>
        <div className="relative h-1.5 rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary/40" style={{ width: `${pct}%` }} />
          <span
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary"
            style={{ left: `${pct}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between font-mono text-xs text-muted-foreground">
          <span>L {formatUsd(low, 4)}</span>
          <span>H {formatUsd(high, 4)}</span>
        </div>
      </div>
    </div>
  );
}

function AthMetric({ market, index }: { market: MarketData; index: number }) {
  const ath = market.ath?.value ?? market.price.value;
  const price = market.price.value;
  const fromAth = ath > 0 ? ((price - ath) / ath) * 100 : 0;
  const pctOfAth = ath > 0 ? Math.min(100, Math.max(0, (price / ath) * 100)) : 0;
  const display = useCountUp(ath, { formatter: (v) => formatUsd(v, 4) });
  return (
    <div className={TILE} style={tileDelay(index)}>
      <p className="text-sm text-muted-foreground">All-Time High</p>
      <p className="font-mono text-2xl font-bold tracking-tight text-primary">{display}</p>
      <div>
        <div className="h-1.5 rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pctOfAth}%` }} />
        </div>
        <p className="mt-2 text-sm text-wallet-outgoing">{fromAth.toFixed(1)}% from ATH</p>
      </div>
    </div>
  );
}

function PriceHeroSkeleton() {
  return (
    <SectionCard>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-14 w-64" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-20 w-52 rounded-xl" />
      </div>
    </SectionCard>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex h-full flex-col justify-end gap-3 rounded-xl bg-secondary/50 p-4">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-64 w-full flex-1" />
      <div className="grid grid-cols-4 gap-3">
        <Skeleton className="h-3" />
        <Skeleton className="h-3" />
        <Skeleton className="h-3" />
        <Skeleton className="h-3" />
      </div>
    </div>
  );
}

const MARKET_STAT_SKELETON_KEYS = [
  "market-stat-supply",
  "market-stat-cap",
  "market-stat-volume",
  "market-stat-change",
  "market-stat-rank",
  "market-stat-liquidity",
] as const;

function StatsSkeleton() {
  return (
    <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {MARKET_STAT_SKELETON_KEYS.map((key) => (
        <Skeleton key={key} className="min-h-[132px] rounded-xl" />
      ))}
    </div>
  );
}
