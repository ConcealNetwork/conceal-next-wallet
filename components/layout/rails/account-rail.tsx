"use client";

import { LineChart, PiggyBank, QrCode, Repeat, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { RightRailHeader } from "@/components/layout/right-rail";
import { CcxAmount } from "@/components/wallet/ccx";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketData, useWalletInfo } from "@/lib/hooks";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { ccxToNumber, cn, stripTickerSuffix } from "@/lib/utils";

// Issue #122, stage 2 — the Account-page contextual rail. Compact Market +
// Holdings + Quick actions summary that complements (not duplicates) the dense
// main content. Section labels are hardcoded English for now (a later #84 chunk
// localizes them); the action labels mirror that staging decision for parity.

// `embedded` renders the same sections WITHOUT the panel header + collapse pin,
// for the small-screen body fallback (< 1200px, where the rail column is hidden)
// so narrow viewports never lose the market/holdings summary. Above the rail
// breakpoint the body fallback is CSS-hidden and the registered rail shows instead.
export function AccountRail({ embedded = false }: { embedded?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      {embedded ? null : <RightRailHeader title="Account" />}
      <MarketSection />
      <HoldingsSection />
      <QuickActionsSection />
    </div>
  );
}

/** Small uppercase section heading with an optional leading icon. */
function RailSectionHeading({
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

function MarketSection() {
  const market = useMarketData();
  const { formatUsd } = useFormatters();
  const data = market.data;

  return (
    <section>
      <RailSectionHeading icon={LineChart} first>
        Market
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
        View full market →
      </Link>
    </section>
  );
}

function MarketChangeBadge({ pct }: { pct: number }) {
  const up = pct >= 0;
  return (
    <span
      role="status"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold",
        up ? "text-wallet-incoming" : "text-wallet-outgoing",
      )}
      aria-label={`CCX price ${up ? "up" : "down"} ${Math.abs(pct).toFixed(2)} percent`}
    >
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      {Math.abs(pct).toFixed(2)}%
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

type Holding = {
  label: string;
  value: number;
  note: string;
  barClassName: string;
};

function HoldingsSection() {
  const wallet = useWalletInfo();
  const { formatCcx } = useFormatters();
  const info = wallet.data;

  const holdings: Holding[] = info
    ? [
        {
          label: "Available",
          value: ccxToNumber(info.available),
          note: "ready to spend",
          barClassName: "bg-primary",
        },
        {
          label: "Locked",
          value: ccxToNumber(info.lockedDeposits),
          note: "in deposits",
          barClassName: "bg-wallet-deposit",
        },
        {
          label: "Pending",
          value: ccxToNumber(info.pending),
          note: "awaiting confirmation",
          barClassName: "bg-wallet-outgoing",
        },
        {
          label: "Withdrawable",
          value: ccxToNumber(info.withdrawable),
          note: "ready to claim",
          barClassName: "bg-wallet-incoming",
        },
      ]
    : [];

  return (
    <section>
      <RailSectionHeading>Holdings</RailSectionHeading>
      <div className="mt-3.5 rounded-xl border border-border/70 px-5">
        {info ? (
          holdings.map((holding, index) => (
            <div
              key={holding.label}
              className={cn(
                "flex items-center gap-3.5 py-3",
                index > 0 && "border-t border-border/70",
              )}
            >
              <span
                className={cn("h-9 w-1 shrink-0 rounded-full", holding.barClassName)}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-foreground">{holding.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{holding.note}</p>
              </div>
              <p className="shrink-0 text-right font-mono text-[14.5px] font-semibold text-foreground">
                <CcxAmount>{stripTickerSuffix(formatCcx(holding.value))}</CcxAmount>
              </p>
            </div>
          ))
        ) : (
          <div className="space-y-4 py-3">
            {Array.from({ length: 4 }).map((_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static fixed-length placeholder list, never reordered
              <div key={index} className="flex items-center gap-3.5">
                <Skeleton className="h-9 w-1 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

type QuickAction = { href: string; label: string; aria: string; icon: LucideIcon };

// `aria` is intentionally MORE specific than the bare nav-link labels ("Send", etc.):
// it makes these rail shortcuts distinct in the accessibility tree so they don't collide
// with the sidebar nav links (which the e2e selects by exact name), and reads better aloud.
const QUICK_ACTIONS: QuickAction[] = [
  { href: "/wallet/send", label: "Send", aria: "Send CCX", icon: Send },
  { href: "/wallet/receive", label: "Receive", aria: "Receive CCX", icon: QrCode },
  { href: "/wallet/deposits", label: "Deposit", aria: "Create a deposit", icon: PiggyBank },
  { href: "/wallet/settings", label: "Optimize", aria: "Optimize wallet", icon: Repeat },
];

function QuickActionsSection() {
  return (
    <section>
      <RailSectionHeading>Quick actions</RailSectionHeading>
      <div className="mt-3.5 grid grid-cols-2 gap-3">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              aria-label={action.aria}
              className="flex flex-col items-center gap-2.5 rounded-xl border border-border/70 px-3 py-4 text-center text-[13px] font-semibold text-foreground transition-[border-color,background-color,transform] duration-150 hover:-translate-y-px hover:bg-secondary hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none motion-reduce:transition-none"
            >
              <Icon className="size-[18px] text-muted-foreground" aria-hidden="true" />
              {action.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
