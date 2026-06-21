"use client";

import type { LucideIcon } from "lucide-react";
import { LineChart } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketData } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { cn } from "@/lib/utils";

// Shared building blocks for the contextual right rails (#122). Extracted so the
// Account / Send / Receive / Deposits rails share one section-heading style and
// one Market card instead of each re-implementing them.

/** Small uppercase section heading with an optional leading icon. */
export function RailSectionHeading({
  icon: Icon,
  children,
  first = false,
}: {
  icon?: LucideIcon;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <h3
      className={cn(
        "flex items-center gap-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80",
        first ? "pt-1.5" : "pt-8",
      )}
    >
      {Icon ? <Icon className="size-3.5" aria-hidden="true" /> : null}
      {children}
    </h3>
  );
}

/** Compact "label · value (· sub)" stat row for rail lists. */
export function RailStatRow({
  label,
  value,
  sub,
  first = false,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  first?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 py-3",
        !first && "border-t border-border/70",
      )}
    >
      <span className="min-w-0 text-[13px] text-muted-foreground">{label}</span>
      <span className="shrink-0 text-right">
        <span className="block font-mono text-[14px] font-semibold text-foreground">{value}</span>
        {sub ? <span className="block text-[11px] text-muted-foreground">{sub}</span> : null}
      </span>
    </div>
  );
}

function MarketChangeBadge({ pct }: { pct: number }) {
  const { t } = useI18n();
  const up = pct >= 0;
  const abs = Math.abs(pct).toFixed(2);
  return (
    <span
      role="status"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold",
        up ? "text-wallet-incoming" : "text-wallet-outgoing",
      )}
      aria-label={up ? t("rail.priceUp", { pct: abs }) : t("rail.priceDown", { pct: abs })}
    >
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      {abs}%
    </span>
  );
}

/** Raw SVG sparkline over the market price history the hook already provides. */
function MarketSparkline({ values, className }: { values: number[]; className?: string }) {
  const width = 280;
  const height = 52;
  if (values.length < 2) {
    return null;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * (height - 8) - 4;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg
      aria-hidden="true"
      className={cn("block text-wallet-incoming", className)}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <polygon points={areaPoints} fill="hsl(160 84% 39% / 0.1)" />
      <polyline
        className="animate-stroke-draw motion-reduce:animate-none"
        points={points}
        fill="none"
        pathLength={1}
        stroke="currentColor"
        strokeDasharray={1}
        strokeDashoffset={0}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Market card: CCX/USD price + 24h change + sparkline + a "view full market" link. */
export function RailMarketSection({ first = true }: { first?: boolean }) {
  const market = useMarketData();
  const { formatUsd } = useFormatters();
  const { t } = useI18n();
  const data = market.data;

  return (
    <section>
      <RailSectionHeading icon={LineChart} first={first}>
        {t("nav.market")}
      </RailSectionHeading>
      <div className="mt-3.5 rounded-xl border border-border/70 p-5">
        {data ? (
          <>
            <p className="text-[11.5px] font-medium text-muted-foreground">CCX / USD</p>
            <div className="mt-1.5 flex items-baseline gap-2.5">
              <span className="text-2xl font-semibold leading-none tracking-tight text-foreground">
                {formatUsd(data.price.value, 4)}
              </span>
              <MarketChangeBadge pct={data.change24hPct} />
            </div>
            <MarketSparkline
              values={data.history.map((point) => point.price)}
              className="mt-4 h-[52px] w-full"
            />
          </>
        ) : (
          <div className="space-y-3">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="mt-4 h-[52px] w-full" />
          </div>
        )}
      </div>
      <Link
        href="/wallet/market"
        className="mt-2.5 inline-flex items-center gap-1 self-start rounded-sm px-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("rail.viewFullMarket")} →
      </Link>
    </section>
  );
}
