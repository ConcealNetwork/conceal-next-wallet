"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCountUp } from "@/lib/hooks/use-count-up";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { Deposit, MarketData, WalletInfo } from "@/lib/types";
import { TickerBadge } from "@/lib/ui/ticker-preference-provider";
import {
  CCX_HUMAIN_DECIMAL_DISPLAY,
  CCX_PRECISION_DECIMAL_DISPLAY,
  ccxToNumber,
  cn,
  formatCcx,
  formatUsd,
  stripTickerSuffix,
  walletBalanceUsd,
} from "@/lib/utils";

type BalanceHeroProps = {
  wallet: WalletInfo;
  market: MarketData;
  deposits: Deposit[];
};

type Segment = {
  label: string;
  value: number;
  pct: number;
  dotClassName: string;
  barClassName: string;
  note: string;
  /** Full precision for dust; default human decimals elsewhere. */
  valueDecimals?: number;
  valueClassName?: string;
};

const BALANCE_SEGMENT_LABELS = ["Available", "Pending", "Locked", "Withdrawable", "Dust"] as const;

export function BalanceHero({ wallet, market, deposits }: BalanceHeroProps) {
  const { t } = useI18n();
  const [availableHovered, setAvailableHovered] = useState(false);
  const available = ccxToNumber(wallet.available);
  const dust = ccxToNumber(wallet.dust);
  const total = ccxToNumber(wallet.balanceTotal);
  const pending = ccxToNumber(wallet.pending);
  const locked = ccxToNumber(wallet.lockedDeposits);
  const withdrawable = ccxToNumber(wallet.withdrawable);
  const activeDeposits = deposits.filter((deposit) => deposit.status === "active");
  const soonestUnlockDays = activeDeposits.length
    ? Math.min(...activeDeposits.map((deposit) => deposit.unlocksInDays))
    : null;
  const availablePct = getPct(available, total);
  const changeLabel = `${market.change24hPct.toFixed(2)}%`;
  const availableLabel = useCountUp(available, {
    formatter: (value) => stripTickerSuffix(formatCcx(value)),
  });
  const totalLabel = useCountUp(total, {
    formatter: (value) => formatCcx(value),
  });

  const totalUsd = walletBalanceUsd(wallet.balanceTotal, market.price.value);

  const segments: Segment[] = [
    {
      label: t("rail.available"),
      value: available,
      pct: availablePct,
      dotClassName: "bg-primary",
      barClassName: "bg-primary",
      note: t("account.availableNotePct", { pct: Math.round(availablePct) }),
    },
    {
      label: t("rail.pending"),
      value: pending,
      pct: getPct(pending, total),
      dotClassName: "bg-wallet-outgoing",
      barClassName: "bg-wallet-outgoing",
      note: t("rail.pendingNote"),
    },
    {
      label: t("rail.locked"),
      value: locked,
      pct: getPct(locked, total),
      dotClassName: "bg-wallet-deposit",
      barClassName: "bg-wallet-deposit",
      note:
        soonestUnlockDays === null
          ? t("account.noActiveLock")
          : t("account.unlocksInDays", { days: soonestUnlockDays }),
    },
    {
      label: t("rail.withdrawable"),
      value: withdrawable,
      pct: getPct(withdrawable, total),
      dotClassName: "bg-wallet-incoming",
      barClassName: "bg-wallet-incoming",
      note: withdrawable > 0 ? t("rail.withdrawableNote") : t("account.noMaturedDeposits"),
    },
    {
      label: t("account.dust"),
      value: dust,
      pct: getPct(dust, total),
      dotClassName: "bg-muted-foreground/50",
      barClassName: "bg-muted-foreground/40",
      note: t("account.unmixable"),
      valueDecimals: CCX_PRECISION_DECIMAL_DISPLAY,
      valueClassName: "text-sm text-muted-foreground",
    },
  ];

  return (
    <Card className="wallet-card">
      <CardContent>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{t("account.availableReadyToSpend")}</p>
            <p
              className="mt-2 wrap-break-word font-mono text-[2.5rem] font-bold leading-none tracking-tight text-foreground sm:text-[2.75rem]"
              onMouseEnter={() => setAvailableHovered(true)}
              onMouseLeave={() => setAvailableHovered(false)}
            >
              {availableHovered
                ? stripTickerSuffix(formatCcx(available, CCX_PRECISION_DECIMAL_DISPLAY))
                : availableLabel}
              <TickerBadge className="ml-2 align-baseline text-xl font-medium text-primary" />
            </p>
            <p className="mt-2 text-sm font-semibold text-muted-foreground">
              {t("account.ofTotalUsd", { total: totalLabel, usd: formatUsd(totalUsd) })}
            </p>
          </div>
          <div className="shrink-0 text-left sm:text-right">
            <span
              role="status"
              className="inline-flex items-center gap-1 rounded-full bg-wallet-incoming/10 px-2.5 py-1 text-xs font-semibold text-wallet-incoming"
              aria-label={t("account.marketChangeUp", { change: changeLabel })}
            >
              <span aria-hidden="true">▲</span>
              {changeLabel}
            </span>
            <BalanceSparkline
              values={wallet.trends?.balanceTotal?.trend ?? []}
              className="mt-3 h-[50px] w-full sm:w-60"
            />
          </div>
        </div>

        <div
          className="mt-6 flex h-3.5 overflow-hidden rounded-full bg-secondary"
          aria-hidden="true"
        >
          {segments.map((segment, index) => (
            <span
              key={segment.label}
              className={cn("animate-scale-x-in motion-reduce:animate-none", segment.barClassName)}
              style={{ width: `${segment.pct}%`, animationDelay: `${index * 70}ms` }}
            />
          ))}
        </div>
        <p className="sr-only">
          {t("account.balanceComposition", {
            items: segments
              .map((segment) =>
                t("account.balanceCompositionItem", {
                  label: segment.label,
                  value: formatCcx(segment.value),
                  pct: Math.round(segment.pct),
                }),
              )
              .join("; "),
          })}
        </p>

        <div className="mt-5 grid grid-cols-1 gap-x-5 gap-y-4 border-t border-border pt-5 min-[400px]:grid-cols-2 xl:grid-cols-5">
          {segments.map((segment) => (
            <div key={segment.label} className="min-w-0">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span
                  className={cn("size-2.5 shrink-0 rounded-[3px]", segment.dotClassName)}
                  aria-hidden="true"
                />
                <span>{segment.label}</span>
              </div>
              <p
                className={cn(
                  "mt-2 truncate font-mono text-lg font-bold text-foreground",
                  segment.valueClassName,
                )}
              >
                {stripTickerSuffix(
                  formatCcx(segment.value, segment.valueDecimals ?? CCX_HUMAIN_DECIMAL_DISPLAY),
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{segment.note}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function BalanceHeroSkeleton() {
  return (
    <Card className="wallet-card">
      <CardContent>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="space-y-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-11 w-56" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <div className="space-y-3 sm:w-60">
            <Skeleton className="h-7 w-20 rounded-full sm:ml-auto" />
            <Skeleton className="h-[50px] w-full" />
          </div>
        </div>
        <Skeleton className="mt-6 h-3.5 w-full rounded-full" />
        <div className="mt-5 grid grid-cols-1 gap-x-5 gap-y-4 border-t border-border pt-5 min-[400px]:grid-cols-2 xl:grid-cols-5">
          {BALANCE_SEGMENT_LABELS.map((segmentLabel) => (
            <div key={segmentLabel} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BalanceSparkline({ values, className }: { values: number[]; className?: string }) {
  // No flat-line placeholder: with <2 points there's no real trend to draw, so
  // render nothing (matches the market/rail sparklines).
  if (values.length < 2) return null;
  const width = 240;
  const height = 50;
  const trend = values;
  const min = Math.min(...trend);
  const max = Math.max(...trend);
  const range = max - min || 1;
  const step = width / (trend.length - 1);
  const points = trend
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * (height - 10) - 5;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg
      aria-hidden="true"
      className={cn("block text-primary", className)}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <polygon points={areaPoints} fill="hsl(var(--primary) / 0.08)" />
      <polyline
        className="animate-stroke-draw motion-reduce:animate-none"
        points={points}
        fill="none"
        pathLength={1}
        stroke="currentColor"
        strokeDasharray={1}
        strokeDashoffset={0}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function getPct(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}
