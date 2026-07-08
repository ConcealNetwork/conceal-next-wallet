"use client";

import { COIN_UNIT_PLACES, DEPOSIT_SMALL_WITHDRAW_FEE, MINIMUM_FEE_V2 } from "conceal-wallet-sdk";
import {
  Calculator,
  CalendarClock,
  EyeOff,
  LayoutGrid,
  Lock,
  Plus,
  Table2,
  Unlock,
} from "lucide-react";
import dynamic from "next/dynamic";
import { type CSSProperties, useEffect, useId, useMemo, useState } from "react";
import { DepositsRail } from "@/components/layout/rails/deposits-rail";
import { usePageRightRail } from "@/components/layout/right-rail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CcxAmount } from "@/components/wallet/ccx";
import { EmptyState, PageHeader, SectionCard, ViewOnlyBadge } from "@/components/wallet/common";
import { WalletSyncingBanner } from "@/components/wallet/syncing-banner";
import { ViewOnlyBanner } from "@/components/wallet/view-only-banner";
import {
  useCreateDeposit,
  useDepositConstraints,
  useDepositPreview,
  useDeposits,
  useMarketData,
  useWalletSyncStatus,
  useWalletViewOnly,
  useWithdrawDeposit,
} from "@/lib/hooks";
import { useCountUp, usePrefersReducedMotion } from "@/lib/hooks/use-count-up";
import { useCreateDeepLink } from "@/lib/hooks/use-create-deeplink";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { type Formatters, useFormatters } from "@/lib/i18n/use-formatters";
import type { CreateDepositInput } from "@/lib/services/deposit.service";
import {
  DEPOSIT_DURATION_OPTIONS,
  estimateDepositUnlockDays,
} from "@/lib/services/deposit.service";
import type { Deposit } from "@/lib/types";
import { CHART_DRAW_MS, CHART_EASING } from "@/lib/ui/animation";
import { toast } from "@/lib/ui/toast";
import { walletCopy } from "@/lib/ui/wallet-copy";
import { ccxToNumber, cn, truncateAddress, usdSubline } from "@/lib/utils";
import { InterestCalculatorDialog } from "./interest-calculator-dialog";

const ResponsiveContainer = dynamic(
  () => import("recharts").then((mod) => mod.ResponsiveContainer),
  { ssr: false },
);
const AreaChart = dynamic(() => import("recharts").then((mod) => mod.AreaChart), { ssr: false });
const Area = dynamic(() => import("recharts").then((mod) => mod.Area), { ssr: false });
const ReferenceLine = dynamic(() => import("recharts").then((mod) => mod.ReferenceLine), {
  ssr: false,
});
const RechartsTooltip = dynamic(() => import("recharts").then((mod) => mod.Tooltip), {
  ssr: false,
});
const XAxis = dynamic(() => import("recharts").then((mod) => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((mod) => mod.YAxis), { ssr: false });

// Deposit-series colors drawn from the shared chart token palette (see app/globals.css).
const DEPOSIT_SERIES_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-2))",
];
const PROJECTION_SAMPLES = 28;

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

type DepositView = "cards" | "table" | "timeline";

const DEPOSITS_VIEW_KEY = "conceal-deposits-view";

export default function DepositsPageClient() {
  const { t } = useI18n();
  usePageRightRail(<DepositsRail />);
  const { data = [] } = useDeposits();
  const constraints = useDepositConstraints();
  const createDeposit = useCreateDeposit();
  const [open, setOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [view, setView] = useState<DepositView>("cards");
  // Sidebar "+" quick-create deep-link (?new=1) opens the create dialog.
  useCreateDeepLink(() => setOpen(true));

  const openDeposits = useMemo(() => data.filter((deposit) => deposit.status !== "spent"), [data]);

  const withdrawnDeposits = useMemo(
    () => data.filter((deposit) => deposit.status === "spent"),
    [data],
  );

  const sortedDeposits = useMemo(() => {
    const open = openDeposits.toSorted((a, b) => a.unlocksInDays - b.unlocksInDays);
    return [...open, ...withdrawnDeposits];
  }, [openDeposits, withdrawnDeposits]);

  const viewOnly = useWalletViewOnly();
  const createDisabled = (constraints.data?.isDepositDisabled ?? false) || viewOnly;

  useEffect(() => {
    function applyStoredView(next: DepositView) {
      setView(next);
    }

    const stored = window.localStorage.getItem(DEPOSITS_VIEW_KEY);
    if (stored === "cards" || stored === "table" || stored === "timeline") applyStoredView(stored);
  }, []);

  function chooseView(next: DepositView) {
    setView(next);
    window.localStorage.setItem(DEPOSITS_VIEW_KEY, next);
  }

  return (
    <>
      <PageHeader
        title={t("nav.deposits")}
        subtitle={t("deposits.pageSubtitle")}
        badge={viewOnly ? <ViewOnlyBadge /> : null}
        action={
          <Button
            type="button"
            className="gap-2 active:scale-[0.98] motion-reduce:active:scale-100"
            onClick={() => setOpen(true)}
            disabled={createDisabled}
            title={viewOnly ? walletCopy.viewOnlyDepositDisabled : undefined}
          >
            <Plus className="size-4" aria-hidden="true" />
            {t("deposits.createNew")}
          </Button>
        }
      />

      <WalletSyncingBanner hint={t("deposits.syncingHint")} />
      <ViewOnlyBanner />

      {constraints.data?.hasPendingDeposit ? (
        <div
          className="mb-4 rounded-xl border border-border bg-secondary/60 px-4 py-3 text-sm text-muted-foreground"
          role="status"
        >
          {t("deposits.pendingMempool")}
        </div>
      ) : null}

      <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
        <SectionCard
          title={t("txn.summary")}
          description={t("deposits.summaryDescription")}
          headerAction={
            <button
              type="button"
              onClick={() => setCalcOpen(true)}
              aria-label={t("deposits.openCalculator")}
              className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-border bg-secondary/95 text-muted-foreground shadow-sm transition-colors duration-200 hover:bg-secondary hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Calculator className="size-4" aria-hidden="true" />
            </button>
          }
        >
          <DepositsSummary deposits={openDeposits} />
        </SectionCard>
      </div>

      <div className="mt-6 animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:90ms]">
        <SectionCard>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold leading-none tracking-tight text-card-foreground">
                {withdrawnDeposits.length > 0
                  ? t("deposits.allHeading")
                  : t("deposits.activeHeading")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {data.length === 0
                  ? t("deposits.noneYet")
                  : [
                      openDeposits.length > 0
                        ? t(
                            openDeposits.length === 1
                              ? "deposits.openPositionsOne"
                              : "deposits.openPositionsOther",
                            { count: openDeposits.length },
                          )
                        : null,
                      withdrawnDeposits.length > 0
                        ? t("deposits.withdrawnCount", { count: withdrawnDeposits.length })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
              </p>
            </div>
            {data.length > 0 ? <DepositViewSwitcher value={view} onChange={chooseView} /> : null}
          </div>
          {data.length > 0 ? (
            <DepositsView deposits={sortedDeposits} view={view} />
          ) : (
            <DepositEmptyState onCreate={() => setOpen(true)} createDisabled={createDisabled} />
          )}
        </SectionCard>
      </div>

      <CreateDepositDialog
        open={open}
        isPending={createDeposit.isPending}
        constraints={constraints.data}
        onOpenChange={setOpen}
        onCreate={(input) => {
          createDeposit.mutate(input, {
            onSuccess: () => {
              toast.success(walletCopy.depositCreateSuccess);
              setOpen(false);
            },
            onError: (error) => {
              toast.error(error instanceof Error ? error.message : t("deposits.createFailed"));
            },
          });
        }}
      />

      <InterestCalculatorDialog open={calcOpen} onOpenChange={setCalcOpen} />
      {/* Small-screen fallback: rail column hidden < 1200px → surface the
          earnings summary + market inline. CSS-hidden above the breakpoint. */}
      <div className="mt-8 min-[1200px]:hidden">
        <DepositsRail embedded />
      </div>
    </>
  );
}

type DepositSegment = {
  id: string;
  amount: number;
  apr: number;
  unlocksInDays: number;
  progressPct: number;
  color: string;
};

type ProjectionPoint = { day: number; value: number };

// Projects total deposit value forward from today to the furthest maturity, accruing
// each deposit's interest linearly across its own remaining lock period.
function buildProjection(deposits: Deposit[], maxDays: number): ProjectionPoint[] {
  if (deposits.length === 0 || maxDays <= 0) return [];
  const points: ProjectionPoint[] = [];
  for (let sample = 0; sample <= PROJECTION_SAMPLES; sample += 1) {
    const day = (maxDays * sample) / PROJECTION_SAMPLES;
    let value = 0;
    for (const deposit of deposits) {
      const principal = ccxToNumber(deposit.amount);
      const interest = ccxToNumber(deposit.interest);
      const durationDays = Math.max(deposit.durationMonths * 30, 1);
      const elapsedDays = durationDays - deposit.unlocksInDays;
      const fraction = Math.min(Math.max((elapsedDays + day) / durationDays, 0), 1);
      value += principal + interest * fraction;
    }
    points.push({ day: Math.round(day), value: Number(value.toFixed(4)) });
  }
  return points;
}

function DepositsSummary({ deposits }: { deposits: Deposit[] }) {
  const { t } = useI18n();
  const fmt = useFormatters();
  const { formatCcx, formatNumber } = fmt;
  const lockedDeposits = useMemo(
    () => deposits.filter((deposit) => deposit.status === "active"),
    [deposits],
  );
  const withdrawableDeposits = useMemo(
    () => deposits.filter((deposit) => deposit.status === "unlocked"),
    [deposits],
  );
  const earningDeposits = useMemo(
    () => [...lockedDeposits, ...withdrawableDeposits],
    [lockedDeposits, withdrawableDeposits],
  );
  const price = useMarketData().data?.price.value ?? 0;
  const totalLocked = lockedDeposits.reduce((sum, deposit) => sum + ccxToNumber(deposit.amount), 0);
  const totalInterest = earningDeposits.reduce(
    (sum, deposit) => sum + ccxToNumber(deposit.interest),
    0,
  );
  const totalAtMaturity =
    earningDeposits.reduce((sum, deposit) => sum + ccxToNumber(deposit.amount), 0) + totalInterest;
  const earningPrincipal = earningDeposits.reduce(
    (sum, deposit) => sum + ccxToNumber(deposit.amount),
    0,
  );
  const weightedApr =
    earningPrincipal > 0
      ? earningDeposits.reduce(
          (sum, deposit) => sum + ccxToNumber(deposit.amount) * deposit.apr,
          0,
        ) / earningPrincipal
      : 0;
  const nextUnlock = lockedDeposits.reduce<Deposit | null>((soonest, deposit) => {
    if (!soonest || deposit.unlocksInDays < soonest.unlocksInDays) return deposit;
    return soonest;
  }, null);
  const maxUnlock = lockedDeposits.reduce(
    (max, deposit) => Math.max(max, deposit.unlocksInDays),
    0,
  );

  const segments = useMemo<DepositSegment[]>(
    () =>
      earningDeposits.map((deposit, index) => ({
        id: deposit.id,
        amount: ccxToNumber(deposit.amount),
        apr: deposit.apr,
        unlocksInDays: deposit.unlocksInDays,
        progressPct: deposit.progressPct,
        color: DEPOSIT_SERIES_COLORS[index % DEPOSIT_SERIES_COLORS.length],
      })),
    [earningDeposits],
  );
  const projection = useMemo(
    () => buildProjection(earningDeposits, maxUnlock),
    [earningDeposits, maxUnlock],
  );
  const maxAmount = segments.reduce((max, segment) => Math.max(max, segment.amount), 0);
  const maxApr = segments.reduce((max, segment) => Math.max(max, segment.apr), 0);

  return (
    <div className="space-y-4">
      <div className="grid auto-rows-fr gap-4 @sm:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-5">
        <SummaryCard
          label={t("deposits.totalLocked")}
          value={totalLocked}
          formatter={(value) => formatCcx(value)}
          detail={t(
            lockedDeposits.length === 1
              ? "deposits.positionsEarningOne"
              : "deposits.positionsEarningOther",
            { count: lockedDeposits.length },
          )}
          tone="deposit"
          index={0}
          usd={usdSubline(totalLocked, price)}
          chart={<CompositionBar segments={segments} total={totalLocked} />}
        />
        <SummaryCard
          label={t("deposits.activeDeposits")}
          value={deposits.length}
          formatter={(value) => formatNumber(Math.round(value))}
          detail={
            withdrawableDeposits.length > 0 && lockedDeposits.length === 0
              ? t("deposits.readyToWithdraw")
              : t("deposits.timeLocksOpen")
          }
          tone="default"
          index={1}
          chart={<AmountBars segments={segments} max={maxAmount} />}
        />
        <SummaryCard
          label={t("deposits.totalEstInterest")}
          value={totalInterest}
          formatter={(value) => formatCcx(value, 6)}
          detail={t("deposits.projectedReturn")}
          tone="amber"
          index={2}
          usd={usdSubline(totalInterest, price)}
          chart={
            <MiniArea values={projection.map((point) => point.value)} color="hsl(var(--primary))" />
          }
        />
        <SummaryCard
          label={t("deposits.weightedAvgApr")}
          value={weightedApr}
          formatter={(value) => `${formatNumber(value, { maximumFractionDigits: 2 })}%`}
          detail={t("deposits.amountWeighted")}
          tone="incoming"
          index={3}
          chart={<AprBars segments={segments} max={maxApr} weighted={weightedApr} />}
        />
        <SummaryCard
          label={t("deposits.nextUnlock")}
          value={nextUnlock?.unlocksInDays ?? 0}
          formatter={(value) =>
            nextUnlock
              ? t(Math.round(value) === 1 ? "deposits.daysLabelOne" : "deposits.daysLabelOther", {
                  count: Math.round(value),
                })
              : withdrawableDeposits.length > 0
                ? t("deposits.readyNow")
                : t("deposits.none")
          }
          detail={
            nextUnlock
              ? t("deposits.maturesOn", {
                  date: formatMaturityDate(nextUnlock.unlocksInDays, fmt),
                })
              : withdrawableDeposits.length > 0
                ? t("deposits.readyToWithdraw")
                : t("deposits.noActiveDeposits")
          }
          tone="default"
          index={4}
          chart={<ProgressRing pct={nextUnlock?.progressPct ?? 0} />}
        />
      </div>

      {earningDeposits.length > 0 ? (
        <div className="grid gap-4 @4xl:grid-cols-[1.6fr_1fr]">
          <ProjectionChart
            projection={projection}
            totalLocked={totalLocked}
            totalAtMaturity={totalAtMaturity}
            nextUnlock={nextUnlock}
            maxUnlock={maxUnlock}
          />
          <CompositionDonut segments={segments} totalLocked={totalLocked} />
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  formatter,
  detail,
  tone,
  index,
  chart,
  usd,
}: {
  label: string;
  value: number;
  formatter: (value: number) => string;
  detail: string;
  tone: "default" | "incoming" | "deposit" | "amber";
  index: number;
  chart: React.ReactNode;
  usd?: string;
}) {
  const valueLabel = useCountUp(value, { formatter });
  const toneClass = {
    default: "text-foreground",
    incoming: "text-wallet-incoming",
    deposit: "text-wallet-deposit",
    amber: "text-primary",
  }[tone];

  return (
    <div
      className="animate-rise-in flex min-h-[148px] flex-col rounded-xl border border-border bg-secondary/60 p-4 motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100"
      style={{ animationDelay: `${120 + index * 40}ms` }}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-2 wrap-break-word font-mono text-2xl font-bold tracking-tight",
          toneClass,
        )}
      >
        {valueLabel}
      </p>
      {usd ? <p className="mt-0.5 text-xs text-muted-foreground">≈ {usd}</p> : null}
      <div className="mt-auto pt-4">{chart}</div>
      <p className="mt-3 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function CompositionBar({ segments, total }: { segments: DepositSegment[]; total: number }) {
  if (segments.length === 0 || total <= 0) {
    return <div className="h-2.5 w-full rounded-full bg-border/60" />;
  }
  return (
    <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
      {segments.map((segment) => (
        <div
          key={segment.id}
          className="h-full first:rounded-l-full last:rounded-r-full"
          style={{
            flexBasis: `${(segment.amount / total) * 100}%`,
            backgroundColor: segment.color,
          }}
        />
      ))}
    </div>
  );
}

function AmountBars({ segments, max }: { segments: DepositSegment[]; max: number }) {
  if (segments.length === 0 || max <= 0) return <div className="h-9" />;
  return (
    <div className="flex h-9 items-end gap-1.5" aria-hidden="true">
      {segments.map((segment) => (
        <div
          key={segment.id}
          className="min-h-[4px] flex-1 rounded-sm"
          style={{
            height: `${Math.max((segment.amount / max) * 100, 8)}%`,
            backgroundColor: segment.color,
          }}
        />
      ))}
    </div>
  );
}

function MiniArea({ values, color }: { values: number[]; color: string }) {
  const gradientId = useId();
  if (values.length < 2) return <div className="h-9" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = 100 / (values.length - 1);
  const coords = values.map(
    (value, index) => [index * stepX, 32 - ((value - min) / span) * 28] as const,
  );
  const line = coords
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 34" preserveAspectRatio="none" className="h-9 w-full" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.4} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line} L100,34 L0,34 Z`} fill={`url(#${gradientId})`} />
      <path
        className="animate-stroke-draw motion-reduce:animate-none"
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={0}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function AprBars({
  segments,
  max,
  weighted,
}: {
  segments: DepositSegment[];
  max: number;
  weighted: number;
}) {
  if (segments.length === 0 || max <= 0) return <div className="h-9" />;
  return (
    <div className="relative flex h-9 items-end gap-2" aria-hidden="true">
      {segments.map((segment) => (
        <div
          key={segment.id}
          className="min-h-[4px] flex-1 rounded-sm bg-wallet-incoming/55"
          style={{ height: `${Math.max((segment.apr / max) * 100, 10)}%` }}
        />
      ))}
      <div
        className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/40"
        style={{ bottom: `${(weighted / max) * 100}%` }}
      />
    </div>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const clamped = Math.min(Math.max(pct, 0), 100);
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  return (
    <svg viewBox="0 0 44 44" className="h-11 w-11" aria-hidden="true">
      <circle cx="22" cy="22" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
      <circle
        className="animate-donut-sweep motion-reduce:animate-none"
        cx="22"
        cy="22"
        r={radius}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 22 22)"
        style={
          {
            "--donut-offset": String(offset),
            "--donut-pct": String(circumference - offset),
          } as CSSProperties
        }
      />
      <text x="22" y="26" textAnchor="middle" className="fill-foreground font-mono text-[10px]">
        {`${Math.round(clamped)}%`}
      </text>
    </svg>
  );
}

function ProjectionChart({
  projection,
  totalLocked,
  totalAtMaturity,
  nextUnlock,
  maxUnlock,
}: {
  projection: ProjectionPoint[];
  totalLocked: number;
  totalAtMaturity: number;
  nextUnlock: Deposit | null;
  maxUnlock: number;
}) {
  const { t } = useI18n();
  const { formatCcx } = useFormatters();
  const prefersReducedMotion = usePrefersReducedMotion();
  return (
    <div className="rounded-xl border border-border bg-secondary/60 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("deposits.projectedToMaturity")}</p>
        <p className="font-mono text-xs text-muted-foreground">
          <CcxAmount>{formatCcx(totalLocked)}</CcxAmount>{" "}
          <span className="text-muted-foreground/60">→</span>{" "}
          <span className="text-wallet-incoming">
            <CcxAmount>{formatCcx(totalAtMaturity)}</CcxAmount>
          </span>
        </p>
      </div>
      <div className="mt-3 h-[150px] w-full">
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={projection} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="depositProjectionFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.32} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" type="number" domain={[0, maxUnlock]} hide />
            <YAxis domain={["dataMin", "dataMax"]} hide />
            {nextUnlock ? (
              <ReferenceLine
                x={nextUnlock.unlocksInDays}
                stroke="hsl(var(--wallet-deposit))"
                strokeDasharray="4 4"
              />
            ) : null}
            <RechartsTooltip
              cursor={{ stroke: "hsl(var(--border))" }}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 12,
                color: "hsl(var(--foreground))",
                fontSize: 12,
              }}
              labelFormatter={(label) =>
                t(label === 1 ? "deposits.inDaysOne" : "deposits.inDaysOther", {
                  count: Number(label),
                })
              }
              formatter={(value) => [formatCcx(Number(value)), t("deposits.valueLabel")]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#depositProjectionFill)"
              isAnimationActive={!prefersReducedMotion}
              animationDuration={CHART_DRAW_MS}
              animationEasing={CHART_EASING}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>{t("deposits.today")}</span>
        {nextUnlock ? (
          <span className="text-wallet-deposit">
            {t("deposits.firstUnlockMarker", { days: nextUnlock.unlocksInDays })}
          </span>
        ) : null}
        <span>{t("deposits.maturityMarker", { days: maxUnlock })}</span>
      </div>
    </div>
  );
}

function CompositionDonut({
  segments,
  totalLocked,
}: {
  segments: DepositSegment[];
  totalLocked: number;
}) {
  const { t } = useI18n();
  const { formatCcx, formatNumber } = useFormatters();
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const arcs = segments.reduce<{ segment: DepositSegment; fraction: number; start: number }[]>(
    (current, segment) => {
      const start = current.reduce((sum, arc) => sum + arc.fraction, 0);
      const fraction = totalLocked > 0 ? segment.amount / totalLocked : 0;
      current.push({ segment, fraction, start });
      return current;
    },
    [],
  );

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-secondary/60 p-4">
      <p className="text-sm text-muted-foreground">{t("deposits.lockedComposition")}</p>
      <div className="mt-3 flex flex-1 items-center gap-5">
        <div className="relative h-[128px] w-[128px] shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke="hsl(var(--border) / 0.4)"
              strokeWidth="15"
            />
            {arcs.map(({ segment, fraction, start }) => {
              const gap = arcs.length > 1 ? 1.5 : 0;
              const dash = Math.max(fraction * circumference - gap, 0);
              return (
                <circle
                  key={segment.id}
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="15"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-start * circumference}
                />
              );
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-xl font-bold leading-none text-foreground">
              {formatNumber(Math.round(totalLocked))}
            </span>
            <span className="mt-1 text-[10px] text-muted-foreground">
              {t("deposits.ccxLocked")}
            </span>
          </div>
        </div>
        <ul className="flex min-w-0 flex-1 flex-col justify-center gap-4 text-sm">
          {segments.map((segment) => (
            <li key={segment.id} className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span
                  className="size-2.5 shrink-0 translate-y-px rounded-sm"
                  style={{ backgroundColor: segment.color }}
                  aria-hidden="true"
                />
                <span className="font-mono text-foreground">
                  <CcxAmount>{formatCcx(segment.amount)}</CcxAmount>
                </span>
                <span className="ml-auto font-mono text-xs text-wallet-incoming">
                  {segment.apr.toFixed(2)}%
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2 pl-[18px]">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/50">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(Math.max(segment.progressPct, 0), 100)}%`,
                      backgroundColor: segment.color,
                    }}
                  />
                </div>
                <span className="shrink-0 text-xs text-muted-foreground/70">
                  {t("deposits.unlocksInDaysShort", { days: segment.unlocksInDays })}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DepositViewSwitcher({
  value,
  onChange,
}: {
  value: DepositView;
  onChange: (view: DepositView) => void;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="m-0 inline-flex min-w-0 rounded-xl border border-border p-1">
      <legend className="sr-only">{t("deposits.viewLegend")}</legend>
      <DepositViewToggle
        active={value === "cards"}
        onClick={() => onChange("cards")}
        label={t("deposits.viewCards")}
      >
        <LayoutGrid className="size-4" aria-hidden="true" />
      </DepositViewToggle>
      <DepositViewToggle
        active={value === "table"}
        onClick={() => onChange("table")}
        label={t("deposits.viewTable")}
      >
        <Table2 className="size-4" aria-hidden="true" />
      </DepositViewToggle>
      <DepositViewToggle
        active={value === "timeline"}
        onClick={() => onChange("timeline")}
        label={t("deposits.viewTimeline")}
      >
        <CalendarClock className="size-4" aria-hidden="true" />
      </DepositViewToggle>
    </fieldset>
  );
}

function DepositViewToggle({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      {label}
    </button>
  );
}

function DepositsView({ deposits, view }: { deposits: Deposit[]; view: DepositView }) {
  if (view === "table") return <DepositsTable deposits={deposits} />;
  if (view === "timeline") return <DepositsTimeline deposits={deposits} />;

  return (
    <div className="grid gap-4">
      {deposits.map((deposit, index) => (
        <DepositCard key={deposit.id} deposit={deposit} index={index} />
      ))}
    </div>
  );
}

function DepositCard({ deposit, index }: { deposit: Deposit; index: number }) {
  const { t } = useI18n();
  const fmt = useFormatters();
  const { formatCcx } = fmt;
  const status = getDepositStatus(deposit);
  const isWithdrawn = deposit.status === "spent";
  const Icon = isWithdrawn || status === "matured" ? Unlock : Lock;
  const price = useMarketData().data?.price.value ?? 0;
  const principal = ccxToNumber(deposit.amount);
  const interest = ccxToNumber(deposit.interest);
  const maturityValue = principal + interest;
  const maturityDate = formatMaturityDate(deposit.unlocksInDays, fmt);
  const usd = (ccx: number) => usdSubline(ccx, price);

  return (
    <article
      className={cn(
        "animate-rise-in rounded-xl border border-border bg-secondary/60 p-4 motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 sm:p-5",
        isWithdrawn && "opacity-75",
      )}
      style={{ animationDelay: `${160 + index * 55}ms` }}
      aria-labelledby={`${deposit.id}-title`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-xl",
              isWithdrawn && "bg-muted text-muted-foreground",
              !isWithdrawn && status === "matured" && "bg-wallet-incoming/10 text-wallet-incoming",
              !isWithdrawn && status !== "matured" && "bg-card text-primary",
            )}
            aria-hidden="true"
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={`${deposit.id}-title`} className="font-semibold text-foreground">
                {isWithdrawn
                  ? t("deposits.statusWithdrawn")
                  : status === "withdrawing"
                    ? t("deposits.withdrawalInProgress")
                    : status === "matured"
                      ? t("deposits.readyToWithdraw")
                      : t("deposits.unlocksInDaysTitle", { days: deposit.unlocksInDays })}
              </h2>
              <DepositStatusPill status={status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {isWithdrawn
                ? t("deposits.cardWithdrawnSubtitle", {
                    principal: formatCcx(deposit.amount),
                    interest: formatCcx(deposit.interest, 6),
                    address: truncateAddress(deposit.address),
                  })
                : t("deposits.cardOpenSubtitle", {
                    date: maturityDate,
                    address: truncateAddress(deposit.address),
                  })}
            </p>
          </div>
        </div>
        {!isWithdrawn ? <DepositWithdrawButton deposit={deposit} size="default" /> : null}
      </div>

      <dl className="mt-5 grid gap-3 @sm:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-5">
        <DepositDetail
          label={t("deposits.principal")}
          value={formatCcx(deposit.amount)}
          tone="deposit"
          usd={usd(principal)}
        />
        <DepositDetail
          label={t("deposits.apr")}
          value={`${deposit.apr.toFixed(2)}%`}
          tone="amber"
        />
        <DepositDetail
          label={t("deposits.estInterest")}
          value={formatCcx(deposit.interest, 6)}
          tone="incoming"
          usd={usd(interest)}
        />
        <DepositDetail
          label={t("deposits.valueAtMaturity")}
          value={formatCcx(maturityValue, 6)}
          tone="default"
          usd={usd(maturityValue)}
        />
        <DepositDetail
          label={t("deposits.duration")}
          value={t(
            deposit.durationMonths === 1 ? "deposits.monthsValueOne" : "deposits.monthsValue",
            { count: deposit.durationMonths },
          )}
          tone="default"
        />
      </dl>

      {!isWithdrawn ? (
        <div className="mt-5 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-muted-foreground">
              {t("deposits.progressLabel")}
            </p>
            <p className="font-mono text-sm font-semibold text-foreground">
              {t("deposits.percentComplete", { pct: Math.min(deposit.progressPct, 100) })}
            </p>
          </div>
          <AnimatedProgress
            value={deposit.progressPct}
            label={t("deposits.percentCompleteAria", {
              pct: Math.min(deposit.progressPct, 100),
            })}
          />
        </div>
      ) : null}
    </article>
  );
}

function DepositsTable({ deposits }: { deposits: Deposit[] }) {
  const { t } = useI18n();
  const { formatCcx } = useFormatters();
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[880px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-medium">{t("rail.amount")}</th>
            <th className="px-4 py-3 font-medium">{t("deposits.apr")}</th>
            <th className="px-4 py-3 font-medium">{t("deposits.estInterest")}</th>
            <th className="px-4 py-3 font-medium">{t("deposits.atMaturity")}</th>
            <th className="px-4 py-3 font-medium">{t("deposits.progressColumn")}</th>
            <th className="px-4 py-3 font-medium">{t("deposits.unlocksColumn")}</th>
            <th className="px-4 py-3 font-medium">{t("deposits.statusColumn")}</th>
            <th className="px-4 py-3 text-right font-medium">{t("deposits.actionColumn")}</th>
          </tr>
        </thead>
        <tbody>
          {deposits.map((deposit, index) => {
            const interest = ccxToNumber(deposit.interest);
            const maturityValue = ccxToNumber(deposit.amount) + interest;
            const status = getDepositStatus(deposit);
            const progress = getProgressPct(deposit);

            return (
              <tr
                key={deposit.id}
                className={cn(
                  "animate-rise-in border-b border-border last:border-b-0 motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100",
                  deposit.status === "spent" && "opacity-70",
                )}
                style={{ animationDelay: `${120 + index * 40}ms` }}
              >
                <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-foreground">
                  <CcxAmount>{formatCcx(deposit.amount)}</CcxAmount>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-primary">
                  {deposit.apr.toFixed(2)}%
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-wallet-incoming">
                  +<CcxAmount>{formatCcx(interest, 6)}</CcxAmount>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-foreground">
                  <CcxAmount>{formatCcx(maturityValue, 6)}</CcxAmount>
                </td>
                <td className="px-4 py-3">
                  <div className="flex min-w-[132px] items-center gap-2">
                    <AnimatedProgress
                      value={progress}
                      label={t("deposits.percentCompleteAria", { pct: progress })}
                      className={cn(
                        "mt-0 h-1.5 min-w-[88px] bg-secondary",
                        status === "matured" ? "[&>div]:bg-wallet-incoming" : "[&>div]:bg-primary",
                      )}
                    />
                    <span className="font-mono text-xs text-muted-foreground">{progress}%</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {getUnlocksLabel(deposit, "table", t)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <DepositStatusPill status={status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <DepositWithdrawButton deposit={deposit} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DepositsTimeline({ deposits }: { deposits: Deposit[] }) {
  const { t } = useI18n();
  const fmt = useFormatters();
  const { formatCcx } = fmt;
  return (
    <div className="relative pl-7 before:absolute before:bottom-2 before:left-[9px] before:top-2 before:w-px before:bg-border">
      {deposits.map((deposit, index) => {
        const interest = ccxToNumber(deposit.interest);
        const maturityValue = ccxToNumber(deposit.amount) + interest;
        const status = getDepositStatus(deposit);
        const progress = getProgressPct(deposit);

        return (
          <article
            key={deposit.id}
            className={cn(
              "animate-rise-in relative pb-6 last:pb-0 motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100",
              deposit.status === "spent" && "opacity-70",
            )}
            style={{ animationDelay: `${120 + index * 50}ms` }}
            aria-labelledby={`${deposit.id}-timeline-title`}
          >
            <span
              className={cn(
                "absolute left-[-23px] top-1.5 size-3 rounded-full ring-4 ring-background",
                deposit.status === "spent" && "bg-muted-foreground",
                deposit.status !== "spent" && status === "matured" && "bg-wallet-incoming",
                deposit.status !== "spent" && status !== "matured" && "bg-primary",
              )}
              aria-hidden="true"
            />
            <p className="text-xs text-muted-foreground">{getTimelineDateLabel(deposit, fmt, t)}</p>
            <div className="mt-2 flex flex-col gap-3 rounded-xl border border-border bg-secondary/60 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3
                    id={`${deposit.id}-timeline-title`}
                    className="font-mono font-semibold text-foreground"
                  >
                    <CcxAmount>{formatCcx(deposit.amount)}</CcxAmount>
                  </h3>
                  <DepositStatusPill status={status} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  <span className="font-mono text-primary">
                    {t("deposits.aprValue", { apr: deposit.apr.toFixed(2) })}
                  </span>
                  <span aria-hidden="true"> · </span>
                  <span className="font-mono text-wallet-incoming">
                    +<CcxAmount>{formatCcx(interest, 6)}</CcxAmount>
                  </span>
                  <span aria-hidden="true"> → </span>
                  <span className="font-mono text-foreground">
                    <CcxAmount>{formatCcx(maturityValue, 6)}</CcxAmount>
                  </span>
                  <span> {t("deposits.atMaturitySuffix")}</span>
                </p>
                <div className="mt-3 max-w-sm">
                  <AnimatedProgress
                    value={progress}
                    label={t("deposits.percentCompleteAria", { pct: progress })}
                    className={cn(
                      "mt-0 h-2 bg-card",
                      status === "matured" ? "[&>div]:bg-wallet-incoming" : "[&>div]:bg-primary",
                    )}
                  />
                </div>
              </div>
              {canWithdrawDeposit(deposit) ? <DepositWithdrawButton deposit={deposit} /> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function DepositDetail({
  label,
  value,
  tone,
  usd,
}: {
  label: string;
  value: string;
  tone: "default" | "incoming" | "deposit" | "amber";
  usd?: string;
}) {
  const toneClass = {
    default: "text-foreground",
    incoming: "text-wallet-incoming",
    deposit: "text-wallet-deposit",
    amber: "text-primary",
  }[tone];

  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 truncate font-mono text-sm font-semibold", toneClass)}>
        <CcxAmount>{value}</CcxAmount>
      </dd>
      {usd ? <dd className="mt-0.5 truncate text-xs text-muted-foreground">≈ {usd}</dd> : null}
    </div>
  );
}

function DepositWithdrawButton({
  deposit,
  size = "xs",
}: {
  deposit: Deposit;
  size?: "default" | "xs";
}) {
  const { t } = useI18n();
  const { formatCcx } = useFormatters();
  const withdraw = useWithdrawDeposit();
  const viewOnly = useWalletViewOnly();
  const { isSyncing } = useWalletSyncStatus();
  const [open, setOpen] = useState(false);
  const canWithdraw = canWithdrawDeposit(deposit);
  const principal = ccxToNumber(deposit.amount);
  const interest = ccxToNumber(deposit.interest);
  const withdrawFee = DEPOSIT_SMALL_WITHDRAW_FEE / 10 ** COIN_UNIT_PLACES;
  const netReceive = principal + interest - withdrawFee;

  function confirmWithdraw() {
    if (viewOnly) {
      toast.error(walletCopy.viewOnlyDepositDisabled);
      return;
    }
    if (isSyncing) return;
    withdraw.mutate(
      { txHash: deposit.txHash, globalOutputIndex: deposit.globalOutputIndex },
      {
        onSuccess: () => {
          toast.success(walletCopy.depositWithdrawSuccess);
          setOpen(false);
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : t("deposits.withdrawFailed"));
        },
      },
    );
  }

  if (deposit.status === "spent") {
    return (
      <Badge variant="secondary" className="min-h-8 px-2.5 text-muted-foreground">
        {t("deposits.statusWithdrawn")}
      </Badge>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant={canWithdraw ? "default" : "outline"}
        size={size}
        disabled={!canWithdraw || withdraw.isPending || viewOnly || isSyncing}
        onClick={() => setOpen(true)}
        title={
          viewOnly
            ? walletCopy.viewOnlyDepositDisabled
            : isSyncing
              ? t("deposits.syncingHint")
              : undefined
        }
        className="gap-2 active:scale-[0.98] motion-reduce:active:scale-100"
      >
        {viewOnly ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Unlock className="size-4" aria-hidden="true" />
        )}
        {viewOnly
          ? t("deposits.viewOnlyShort")
          : deposit.withdrawPending
            ? t("deposits.withdrawing")
            : t("account.txWithdraw")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deposits.confirmWithdrawalTitle")}</DialogTitle>
            <DialogDescription>{walletCopy.depositWithdrawConfirm}</DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 text-sm">
            <ConfirmRow label={t("deposits.principal")} value={formatCcx(deposit.amount)} />
            <ConfirmRow
              label={t("deposits.interest")}
              value={formatCcx(deposit.interest, 6)}
              tone="incoming"
            />
            <ConfirmRow label={t("deposits.networkFee")} value={formatCcx(withdrawFee, 6)} />
            <ConfirmRow
              label={t("deposits.youReceive")}
              value={formatCcx(Math.max(netReceive, 0), 6)}
              strong
            />
          </dl>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("action.cancel")}
            </Button>
            <Button
              type="button"
              onClick={confirmWithdraw}
              disabled={withdraw.isPending || isSyncing}
            >
              {withdraw.isPending ? t("deposits.withdrawing") : t("deposits.confirmAndWithdraw")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AnimatedProgress({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) {
  const { t } = useI18n();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [displayValue, setDisplayValue] = useState(prefersReducedMotion ? value : 0);
  const clampedValue = Math.min(Math.max(value, 0), 100);

  useEffect(() => {
    function applyDisplayValue(next: number) {
      setDisplayValue(next);
    }

    if (prefersReducedMotion) {
      applyDisplayValue(clampedValue);
      return;
    }

    const frame = window.requestAnimationFrame(() => applyDisplayValue(clampedValue));
    return () => window.cancelAnimationFrame(frame);
  }, [clampedValue, prefersReducedMotion]);

  return (
    <Progress
      value={displayValue}
      aria-label={t("deposits.progressAria")}
      aria-valuetext={label}
      className={cn(
        "mt-3 h-2 bg-secondary [&>div]:bg-linear-to-r [&>div]:from-primary [&>div]:to-[#ffc266]",
        className,
      )}
    />
  );
}

const DEPOSIT_STATUS_LABEL_KEYS: Record<DepositStatus, string> = {
  matured: "deposits.pillReady",
  soon: "deposits.pillUnlocksSoon",
  active: "deposits.pillActive",
  spent: "deposits.statusWithdrawn",
  withdrawing: "deposits.pillWithdrawing",
};

function DepositStatusPill({ status }: { status: DepositStatus }) {
  const { t } = useI18n();
  const label = t(DEPOSIT_STATUS_LABEL_KEYS[status]);

  return (
    <Badge
      variant="secondary"
      className={cn(
        "min-h-7 px-2.5 py-1",
        status === "matured" && "bg-wallet-incoming/10 text-wallet-incoming",
        status === "soon" && "bg-primary/10 text-primary",
        status === "active" && "bg-wallet-deposit/10 text-wallet-deposit",
        status === "spent" && "text-muted-foreground",
        status === "withdrawing" && "bg-wallet-outgoing/10 text-wallet-outgoing",
      )}
    >
      {label}
    </Badge>
  );
}

function DepositEmptyState({
  onCreate,
  createDisabled,
}: {
  onCreate: () => void;
  createDisabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div>
      <EmptyState
        title={t("deposits.emptyTitle")}
        description={t("deposits.emptyDescription")}
        illustration="/brand/empty/deposits.png"
      />
      <div className="mt-4 flex justify-center">
        <Button
          type="button"
          onClick={onCreate}
          disabled={createDisabled}
          className="gap-2 active:scale-[0.98] motion-reduce:active:scale-100"
        >
          <Plus className="size-4" aria-hidden="true" />
          {t("deposits.createNew")}
        </Button>
      </div>
    </div>
  );
}

function CreateDepositDialog({
  open,
  isPending,
  constraints,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  isPending: boolean;
  constraints?: {
    maxDepositAmount: number;
    isDepositDisabled: boolean;
  };
  onOpenChange: (open: boolean) => void;
  onCreate: (input: CreateDepositInput) => void;
}) {
  const { t } = useI18n();
  const fmt = useFormatters();
  const { formatCcx, formatNumber } = fmt;
  const viewOnly = useWalletViewOnly();
  const [amount, setAmount] = useState("100");
  const [duration, setDuration] = useState("12");
  const [amountError, setAmountError] = useState("");
  const [step, setStep] = useState<"form" | "confirm">("form");
  const durationMonths = Number(duration);
  const amountValue = Math.floor(Number(amount));
  const maxAmount = constraints?.maxDepositAmount ?? 0;
  const amountIsValid =
    Number.isFinite(amountValue) &&
    amountValue >= 1 &&
    (maxAmount <= 0 || amountValue <= maxAmount);
  const preview = useDepositPreview(
    amountValue,
    durationMonths,
    open && step === "form" && amountIsValid,
  );
  const previewInterest = preview.data?.interestCcx ?? 0;
  const previewApr = preview.data?.indicativeApr ?? 0;
  const createFee = MINIMUM_FEE_V2 / 10 ** COIN_UNIT_PLACES;
  const maturityDate = formatDate(
    addDays(new Date(), estimateDepositUnlockDays(durationMonths)),
    fmt,
  );

  useEffect(() => {
    if (!open) setStep("form");
  }, [open]);

  function submitForm() {
    if (!Number.isFinite(amountValue) || amountValue < 1) {
      setAmountError(t("deposits.errorWholeAmount"));
      return;
    }
    if (maxAmount > 0 && amountValue > maxAmount) {
      setAmountError(t("deposits.errorMaxAmount", { max: formatNumber(maxAmount) }));
      return;
    }
    setAmountError("");
    setStep("confirm");
  }

  function confirmCreate() {
    if (viewOnly) {
      toast.error(walletCopy.viewOnlyDepositDisabled);
      return;
    }
    onCreate({ amount: amountValue, durationMonths });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setStep("form");
      }}
    >
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        {step === "form" ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("deposits.createNew")}</DialogTitle>
              <DialogDescription>
                {t(
                  durationMonths === 1
                    ? "deposits.createDescriptionOne"
                    : "deposits.createDescriptionOther",
                  { count: durationMonths },
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-[1fr_170px]">
                <div className="space-y-2">
                  <Label htmlFor="deposit-amount">{t("deposits.amountCcx")}</Label>
                  <Input
                    id="deposit-amount"
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value.replace(/[^\d]/g, ""));
                      if (amountError) setAmountError("");
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-invalid={amountError ? "true" : "false"}
                    aria-describedby={amountError ? "deposit-amount-error" : "deposit-max-hint"}
                  />
                  {amountError ? (
                    <p id="deposit-amount-error" className="text-sm text-destructive">
                      {amountError}
                    </p>
                  ) : (
                    <p id="deposit-max-hint" className="text-xs text-muted-foreground">
                      {maxAmount > 0 ? (
                        <button
                          type="button"
                          className="cursor-pointer font-semibold text-primary hover:text-primary/80"
                          onClick={() => setAmount(String(maxAmount))}
                        >
                          {t("deposits.maxAmount", { max: formatNumber(maxAmount) })}
                        </button>
                      ) : (
                        t("deposits.balanceLoading")
                      )}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deposit-duration">{t("deposits.duration")}</Label>
                  <Select value={duration} onValueChange={setDuration}>
                    <SelectTrigger id="deposit-duration" aria-label={t("deposits.durationAria")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEPOSIT_DURATION_OPTIONS.map((months) => (
                        <SelectItem key={months} value={String(months)}>
                          {t(months === 1 ? "deposits.monthsValueOne" : "deposits.monthsValue", {
                            count: months,
                          })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-secondary/60 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <CalendarClock className="size-4 text-primary" aria-hidden="true" />
                  {t("deposits.livePreview")}
                </div>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <PreviewRow
                    label={t("deposits.indicativeApr")}
                    value={preview.isFetching ? "…" : `${previewApr.toFixed(2)}%`}
                  />
                  <PreviewRow label={t("deposits.estUnlock")} value={maturityDate} />
                  <PreviewRow
                    label={t("deposits.estInterest")}
                    value={preview.isFetching ? "…" : formatCcx(previewInterest, 6)}
                    tone="incoming"
                  />
                  <PreviewRow
                    label={t("deposits.valueAtMaturity")}
                    value={
                      preview.isFetching || !amountIsValid
                        ? "…"
                        : formatCcx(amountValue + previewInterest, 6)
                    }
                    tone="deposit"
                  />
                </dl>
              </div>

              <Button
                type="button"
                className="w-full gap-2 active:scale-[0.98] motion-reduce:active:scale-100"
                onClick={submitForm}
                disabled={
                  constraints?.isDepositDisabled || !amountIsValid || preview.isFetching || viewOnly
                }
                title={viewOnly ? walletCopy.viewOnlyDepositDisabled : undefined}
              >
                <Lock className="size-4" aria-hidden="true" />
                {t("deposits.reviewDeposit")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("deposits.confirmDepositTitle")}</DialogTitle>
              <DialogDescription>{walletCopy.depositCreateConfirm}</DialogDescription>
            </DialogHeader>
            <dl className="space-y-2 text-sm">
              <ConfirmRow label={t("rail.amount")} value={formatCcx(amountValue)} />
              <ConfirmRow
                label={t("deposits.term")}
                value={t(
                  durationMonths === 1 ? "deposits.monthsValueOne" : "deposits.monthsValue",
                  { count: durationMonths },
                )}
              />
              <ConfirmRow
                label={t("deposits.estInterestLower")}
                value={formatCcx(previewInterest, 6)}
                tone="incoming"
              />
              <ConfirmRow label={t("deposits.networkFee")} value={formatCcx(createFee, 6)} />
              <ConfirmRow
                label={t("deposits.totalDebit")}
                value={formatCcx(amountValue + createFee, 6)}
                strong
              />
            </dl>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep("form")}>
                {t("deposits.back")}
              </Button>
              <Button type="button" onClick={confirmCreate} disabled={isPending}>
                {isPending ? t("deposits.creating") : t("deposits.confirmAndCreate")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConfirmRow({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: "incoming";
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "font-mono text-foreground",
          tone === "incoming" && "text-wallet-incoming",
          strong && "font-semibold",
        )}
      >
        <CcxAmount>{value}</CcxAmount>
      </dd>
    </div>
  );
}

function PreviewRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "incoming" | "deposit";
}) {
  const toneClass = {
    default: "text-foreground",
    incoming: "text-wallet-incoming",
    deposit: "text-wallet-deposit",
  }[tone];

  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 truncate font-mono text-sm font-semibold", toneClass)}>
        <CcxAmount>{value}</CcxAmount>
      </dd>
    </div>
  );
}

type DepositStatus = "matured" | "soon" | "active" | "spent" | "withdrawing";

function canWithdrawDeposit(deposit: Deposit) {
  return deposit.status === "unlocked" && !deposit.withdrawPending;
}

function getDepositStatus(deposit: Deposit): DepositStatus {
  if (deposit.status === "spent") return "spent";
  if (deposit.withdrawPending) return "withdrawing";
  if (canWithdrawDeposit(deposit)) return "matured";
  if (deposit.unlocksInDays < 14) return "soon";
  return "active";
}

function getProgressPct(deposit: Deposit) {
  return Math.min(Math.max(deposit.progressPct, 0), 100);
}

type TFunction = (key: string, vars?: Record<string, string | number>) => string;

function getUnlocksLabel(deposit: Deposit, variant: "table" | "timeline", t: TFunction) {
  if (deposit.status === "spent") return t("deposits.statusWithdrawn");
  if (deposit.withdrawPending) return t("rail.pending");
  if (canWithdrawDeposit(deposit))
    return variant === "table" ? t("deposits.pillReady") : t("deposits.readyNow");
  return t(deposit.unlocksInDays === 1 ? "deposits.daysLabelOne" : "deposits.daysLabelOther", {
    count: deposit.unlocksInDays,
  });
}

function getTimelineDateLabel(deposit: Deposit, fmt: Formatters, t: TFunction) {
  if (deposit.status === "spent") return t("deposits.statusWithdrawn");
  if (deposit.withdrawPending) return t("deposits.withdrawalPending");
  if (canWithdrawDeposit(deposit)) return t("deposits.readyNow");
  return t("deposits.timelineDateLabel", {
    date: formatMaturityDate(deposit.unlocksInDays, fmt),
    relative: getUnlocksLabel(deposit, "timeline", t),
  });
}

function formatMaturityDate(unlocksInDays: number, fmt: Formatters) {
  return formatDate(addDays(new Date(), unlocksInDays), fmt);
}

function formatDate(date: Date, fmt: Formatters) {
  return fmt.formatDate(date, DATE_FORMAT);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}
