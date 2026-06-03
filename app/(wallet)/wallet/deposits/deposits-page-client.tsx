"use client";

import { CalendarClock, LayoutGrid, Lock, Plus, Table2, Unlock } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
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
import { EmptyState, PageHeader, SectionCard } from "@/components/wallet/common";
import {
  useCreateDeposit,
  useDepositConstraints,
  useDepositPreview,
  useDeposits,
  useWithdrawDeposit,
} from "@/lib/hooks";
import { useCountUp, usePrefersReducedMotion } from "@/lib/hooks/use-count-up";
import {
  COIN_FEE_ATOMIC,
  COIN_UNIT_PLACES,
  DEPOSIT_SMALL_WITHDRAW_FEE_ATOMIC,
} from "@/lib/config/config";
import {
  DEPOSIT_DURATION_OPTIONS,
  estimateDepositUnlockDays,
} from "@/lib/services/deposit.service";
import type { CreateDepositInput } from "@/lib/services/deposit.service";
import type { Deposit } from "@/lib/types";
import { walletCopy } from "@/lib/ui/wallet-copy";
import { ccxToNumber, cn, formatCcx, truncateAddress } from "@/lib/utils";

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

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

type DepositView = "cards" | "table" | "timeline";

const DEPOSITS_VIEW_KEY = "conceal-deposits-view";

export default function DepositsPageClient() {
  const { data = [] } = useDeposits();
  const constraints = useDepositConstraints();
  const createDeposit = useCreateDeposit();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<DepositView>("cards");

  const openDeposits = useMemo(() => data.filter((deposit) => deposit.status !== "spent"), [data]);

  const withdrawnDeposits = useMemo(
    () => data.filter((deposit) => deposit.status === "spent"),
    [data],
  );

  const sortedDeposits = useMemo(() => {
    const open = openDeposits.toSorted((a, b) => a.unlocksInDays - b.unlocksInDays);
    return [...open, ...withdrawnDeposits];
  }, [openDeposits, withdrawnDeposits]);

  const createDisabled = constraints.data?.isDepositDisabled ?? false;

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
        title="Deposits"
        subtitle="Create time-locked deposits and track projected returns"
        action={
          <Button
            type="button"
            className="gap-2 active:scale-[0.98] motion-reduce:active:scale-100"
            onClick={() => setOpen(true)}
            disabled={createDisabled}
          >
            <Plus className="size-4" aria-hidden="true" />
            Create New Deposit
          </Button>
        }
      />

      {constraints.data?.isWalletSyncing ? (
        <div
          className="mb-4 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground"
          role="status"
        >
          Wallet is syncing — create and withdraw are disabled until the chain is caught up.
        </div>
      ) : null}

      {constraints.data?.hasPendingDeposit ? (
        <div
          className="mb-4 rounded-xl border border-border bg-secondary/60 px-4 py-3 text-sm text-muted-foreground"
          role="status"
        >
          A deposit transaction is pending confirmation in the mempool.
        </div>
      ) : null}

      <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
        <SectionCard title="Summary" description="Locked CCX, maturity timing, and blended APR">
          <DepositsSummary deposits={openDeposits} />
        </SectionCard>
      </div>

      <div className="mt-6 animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:90ms]">
        <SectionCard>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold leading-none tracking-tight text-card-foreground">
                {withdrawnDeposits.length > 0 ? "All Deposits" : "Active Deposits"}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {data.length === 0
                  ? "No deposits yet"
                  : [
                      openDeposits.length > 0
                        ? `${openDeposits.length} open position${openDeposits.length === 1 ? "" : "s"}`
                        : null,
                      withdrawnDeposits.length > 0 ? `${withdrawnDeposits.length} withdrawn` : null,
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
              toast.error(error instanceof Error ? error.message : "Failed to create deposit.");
            },
          });
        }}
      />
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
  const activeDeposits = useMemo(
    () => deposits.filter((deposit) => deposit.status === "active"),
    [deposits],
  );
  const totalLocked = activeDeposits.reduce((sum, deposit) => sum + ccxToNumber(deposit.amount), 0);
  const totalInterest = activeDeposits.reduce(
    (sum, deposit) => sum + ccxToNumber(deposit.interest),
    0,
  );
  const totalAtMaturity = totalLocked + totalInterest;
  const weightedApr =
    totalLocked > 0
      ? activeDeposits.reduce(
          (sum, deposit) => sum + ccxToNumber(deposit.amount) * deposit.apr,
          0,
        ) / totalLocked
      : 0;
  const nextUnlock = activeDeposits.reduce<Deposit | null>((soonest, deposit) => {
    if (!soonest || deposit.unlocksInDays < soonest.unlocksInDays) return deposit;
    return soonest;
  }, null);
  const maxUnlock = activeDeposits.reduce(
    (max, deposit) => Math.max(max, deposit.unlocksInDays),
    0,
  );

  const segments = useMemo<DepositSegment[]>(
    () =>
      activeDeposits.map((deposit, index) => ({
        id: deposit.id,
        amount: ccxToNumber(deposit.amount),
        apr: deposit.apr,
        unlocksInDays: deposit.unlocksInDays,
        progressPct: deposit.progressPct,
        color: DEPOSIT_SERIES_COLORS[index % DEPOSIT_SERIES_COLORS.length],
      })),
    [activeDeposits],
  );
  const projection = useMemo(
    () => buildProjection(activeDeposits, maxUnlock),
    [activeDeposits, maxUnlock],
  );
  const maxAmount = segments.reduce((max, segment) => Math.max(max, segment.amount), 0);
  const maxApr = segments.reduce((max, segment) => Math.max(max, segment.apr), 0);

  return (
    <div className="space-y-4">
      <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          label="Total Locked"
          value={totalLocked}
          formatter={(value) => formatCcx(value)}
          detail={`${activeDeposits.length} position${activeDeposits.length === 1 ? "" : "s"} earning`}
          tone="deposit"
          index={0}
          chart={<CompositionBar segments={segments} total={totalLocked} />}
        />
        <SummaryCard
          label="Active Deposits"
          value={activeDeposits.length}
          formatter={(value) => Math.round(value).toLocaleString("en-US")}
          detail="Time locks open"
          tone="default"
          index={1}
          chart={<AmountBars segments={segments} max={maxAmount} />}
        />
        <SummaryCard
          label="Total Est. Interest"
          value={totalInterest}
          formatter={(value) => formatCcx(value, 4)}
          detail="Projected return"
          tone="amber"
          index={2}
          chart={
            <MiniArea values={projection.map((point) => point.value)} color="hsl(var(--primary))" />
          }
        />
        <SummaryCard
          label="Weighted Avg APR"
          value={weightedApr}
          formatter={(value) => `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`}
          detail="Amount-weighted"
          tone="incoming"
          index={3}
          chart={<AprBars segments={segments} max={maxApr} weighted={weightedApr} />}
        />
        <SummaryCard
          label="Next Unlock"
          value={nextUnlock?.unlocksInDays ?? 0}
          formatter={(value) => (nextUnlock ? `${Math.round(value)} days` : "None")}
          detail={
            nextUnlock
              ? `Matures ${formatMaturityDate(nextUnlock.unlocksInDays)}`
              : "No active deposits"
          }
          tone="default"
          index={4}
          chart={<ProgressRing pct={nextUnlock?.progressPct ?? 0} />}
        />
      </div>

      {activeDeposits.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
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
}: {
  label: string;
  value: number;
  formatter: (value: number) => string;
  detail: string;
  tone: "default" | "incoming" | "deposit" | "amber";
  index: number;
  chart: React.ReactNode;
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
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
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
  return (
    <div className="rounded-xl border border-border bg-secondary/60 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">Projected value to maturity</p>
        <p className="font-mono text-xs text-muted-foreground">
          <CcxAmount>{formatCcx(totalLocked)}</CcxAmount>{" "}
          <span className="text-muted-foreground/60">→</span>{" "}
          <span className="text-wallet-incoming">
            <CcxAmount>{formatCcx(totalAtMaturity)}</CcxAmount>
          </span>
        </p>
      </div>
      <div className="mt-3 h-[150px] w-full">
        <ResponsiveContainer width="100%" height="100%">
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
              labelFormatter={(label) => `In ${label} day${label === 1 ? "" : "s"}`}
              formatter={(value) => [formatCcx(Number(value)), "Value"]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#depositProjectionFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>Today</span>
        {nextUnlock ? (
          <span className="text-wallet-deposit">{nextUnlock.unlocksInDays}d · first unlock</span>
        ) : null}
        <span>{maxUnlock}d · maturity</span>
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
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const arcs = segments.reduce<{ segment: DepositSegment; fraction: number; start: number }[]>(
    (current, segment) => {
      const start = current.reduce((sum, arc) => sum + arc.fraction, 0);
      const fraction = totalLocked > 0 ? segment.amount / totalLocked : 0;
      return [...current, { segment, fraction, start }];
    },
    [],
  );

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-secondary/60 p-4">
      <p className="text-sm text-muted-foreground">Locked composition</p>
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
              {Math.round(totalLocked).toLocaleString("en-US")}
            </span>
            <span className="mt-1 text-[10px] text-muted-foreground">CCX locked</span>
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
                  unlocks {segment.unlocksInDays}d
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
  return (
    <div
      className="inline-flex rounded-xl border border-border p-1"
      role="group"
      aria-label="Deposit view"
    >
      <DepositViewToggle active={value === "cards"} onClick={() => onChange("cards")} label="Cards">
        <LayoutGrid className="size-4" aria-hidden="true" />
      </DepositViewToggle>
      <DepositViewToggle active={value === "table"} onClick={() => onChange("table")} label="Table">
        <Table2 className="size-4" aria-hidden="true" />
      </DepositViewToggle>
      <DepositViewToggle
        active={value === "timeline"}
        onClick={() => onChange("timeline")}
        label="Timeline"
      >
        <CalendarClock className="size-4" aria-hidden="true" />
      </DepositViewToggle>
    </div>
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
  const status = getDepositStatus(deposit);
  const isWithdrawn = deposit.status === "spent";
  const Icon = isWithdrawn || status === "matured" ? Unlock : Lock;
  const principal = ccxToNumber(deposit.amount);
  const interest = ccxToNumber(deposit.interest);
  const maturityValue = principal + interest;
  const maturityDate = formatMaturityDate(deposit.unlocksInDays);

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
                  ? "Withdrawn"
                  : status === "withdrawing"
                    ? "Withdrawal in progress"
                    : status === "matured"
                      ? "Ready to withdraw"
                      : `Unlocks in ${deposit.unlocksInDays} days`}
              </h2>
              <DepositStatusPill status={status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {isWithdrawn
                ? `Principal ${formatCcx(deposit.amount)} + ${formatCcx(deposit.interest, 4)} interest · ${truncateAddress(deposit.address)}`
                : `Matures ${maturityDate} · wallet ${truncateAddress(deposit.address)}`}
            </p>
          </div>
        </div>
        {!isWithdrawn ? <DepositWithdrawButton deposit={deposit} size="default" /> : null}
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <DepositDetail label="Principal" value={formatCcx(deposit.amount)} tone="deposit" />
        <DepositDetail label="APR" value={`${deposit.apr.toFixed(2)}%`} tone="amber" />
        <DepositDetail
          label="Est. Interest"
          value={formatCcx(deposit.interest, 4)}
          tone="incoming"
        />
        <DepositDetail
          label="Value at Maturity"
          value={formatCcx(maturityValue, 4)}
          tone="default"
        />
        <DepositDetail label="Duration" value={`${deposit.durationMonths} months`} tone="default" />
      </dl>

      {!isWithdrawn ? (
        <div className="mt-5 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-muted-foreground">Deposit Progress</p>
            <p className="font-mono text-sm font-semibold text-foreground">
              {Math.min(deposit.progressPct, 100)}% complete
            </p>
          </div>
          <AnimatedProgress
            value={deposit.progressPct}
            label={`${Math.min(deposit.progressPct, 100)} percent complete`}
          />
        </div>
      ) : null}
    </article>
  );
}

function DepositsTable({ deposits }: { deposits: Deposit[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[880px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-medium">Amount</th>
            <th className="px-4 py-3 font-medium">APR</th>
            <th className="px-4 py-3 font-medium">Est. Interest</th>
            <th className="px-4 py-3 font-medium">At Maturity</th>
            <th className="px-4 py-3 font-medium">Progress</th>
            <th className="px-4 py-3 font-medium">Unlocks</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Action</th>
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
                  +<CcxAmount>{formatCcx(interest, 4)}</CcxAmount>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-foreground">
                  <CcxAmount>{formatCcx(maturityValue, 4)}</CcxAmount>
                </td>
                <td className="px-4 py-3">
                  <div className="flex min-w-[132px] items-center gap-2">
                    <AnimatedProgress
                      value={progress}
                      label={`${progress} percent complete`}
                      className={cn(
                        "mt-0 h-1.5 min-w-[88px] bg-secondary",
                        status === "matured" ? "[&>div]:bg-wallet-incoming" : "[&>div]:bg-primary",
                      )}
                    />
                    <span className="font-mono text-xs text-muted-foreground">{progress}%</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {getUnlocksLabel(deposit, "table")}
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
            <p className="text-xs text-muted-foreground">{getTimelineDateLabel(deposit)}</p>
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
                  <span className="font-mono text-primary">{deposit.apr.toFixed(2)}% APR</span>
                  <span aria-hidden="true"> · </span>
                  <span className="font-mono text-wallet-incoming">
                    +<CcxAmount>{formatCcx(interest, 4)}</CcxAmount>
                  </span>
                  <span aria-hidden="true"> → </span>
                  <span className="font-mono text-foreground">
                    <CcxAmount>{formatCcx(maturityValue, 4)}</CcxAmount>
                  </span>
                  <span> at maturity</span>
                </p>
                <div className="mt-3 max-w-sm">
                  <AnimatedProgress
                    value={progress}
                    label={`${progress} percent complete`}
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
}: {
  label: string;
  value: string;
  tone: "default" | "incoming" | "deposit" | "amber";
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
  const withdraw = useWithdrawDeposit();
  const [open, setOpen] = useState(false);
  const canWithdraw = canWithdrawDeposit(deposit);
  const principal = ccxToNumber(deposit.amount);
  const interest = ccxToNumber(deposit.interest);
  const withdrawFee = DEPOSIT_SMALL_WITHDRAW_FEE_ATOMIC / Math.pow(10, COIN_UNIT_PLACES);
  const netReceive = principal + interest - withdrawFee;

  function confirmWithdraw() {
    withdraw.mutate(
      { txHash: deposit.txHash, globalOutputIndex: deposit.globalOutputIndex },
      {
        onSuccess: () => {
          toast.success(walletCopy.depositWithdrawSuccess);
          setOpen(false);
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Withdrawal failed.");
        },
      },
    );
  }

  if (deposit.status === "spent") {
    return (
      <Badge variant="secondary" className="min-h-8 px-2.5 text-muted-foreground">
        Withdrawn
      </Badge>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant={canWithdraw ? "default" : "outline"}
        size={size}
        disabled={!canWithdraw || withdraw.isPending}
        onClick={() => setOpen(true)}
        className="gap-2 active:scale-[0.98] motion-reduce:active:scale-100"
      >
        <Unlock className="size-4" aria-hidden="true" />
        {deposit.withdrawPending ? "Withdrawing…" : "Withdraw"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm withdrawal</DialogTitle>
            <DialogDescription>{walletCopy.depositWithdrawConfirm}</DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 text-sm">
            <ConfirmRow label="Principal" value={formatCcx(deposit.amount)} />
            <ConfirmRow label="Interest" value={formatCcx(deposit.interest, 4)} tone="incoming" />
            <ConfirmRow label="Network fee" value={formatCcx(withdrawFee, 6)} />
            <ConfirmRow label="You receive" value={formatCcx(Math.max(netReceive, 0), 4)} strong />
          </dl>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmWithdraw} disabled={withdraw.isPending}>
              {withdraw.isPending ? "Withdrawing…" : "Confirm & Withdraw"}
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
      aria-label="Deposit progress"
      aria-valuetext={label}
      className={cn(
        "mt-3 h-2 bg-secondary [&>div]:bg-linear-to-r [&>div]:from-primary [&>div]:to-[#ffc266]",
        className,
      )}
    />
  );
}

function DepositStatusPill({ status }: { status: DepositStatus }) {
  const label = {
    matured: "Ready",
    soon: "Unlocks soon",
    active: "Active",
    spent: "Withdrawn",
    withdrawing: "Withdrawing",
  }[status];

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
  return (
    <div>
      <EmptyState
        title="No deposits yet"
        description="Create a time-locked deposit to preview APR, maturity date, and projected interest."
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
          Create New Deposit
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
  const createFee = COIN_FEE_ATOMIC / Math.pow(10, COIN_UNIT_PLACES);
  const maturityDate = formatDate(addDays(new Date(), estimateDepositUnlockDays(durationMonths)));

  useEffect(() => {
    if (!open) setStep("form");
  }, [open]);

  function submitForm() {
    if (!Number.isFinite(amountValue) || amountValue < 1) {
      setAmountError("Enter a whole CCX amount of at least 1.");
      return;
    }
    if (maxAmount > 0 && amountValue > maxAmount) {
      setAmountError(`Maximum deposit is ${maxAmount.toLocaleString("en-US")} CCX.`);
      return;
    }
    setAmountError("");
    setStep("confirm");
  }

  function confirmCreate() {
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
              <DialogTitle>Create New Deposit</DialogTitle>
              <DialogDescription>
                Lock CCX for {durationMonths} month{durationMonths === 1 ? "" : "s"} and earn
                interest at term.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-[1fr_170px]">
                <div className="space-y-2">
                  <Label htmlFor="deposit-amount">Amount (CCX)</Label>
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
                          Max {maxAmount.toLocaleString("en-US")} CCX
                        </button>
                      ) : (
                        "Available balance loading…"
                      )}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deposit-duration">Duration</Label>
                  <Select value={duration} onValueChange={setDuration}>
                    <SelectTrigger id="deposit-duration" aria-label="Deposit duration">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEPOSIT_DURATION_OPTIONS.map((months) => (
                        <SelectItem key={months} value={String(months)}>
                          {months} month{months === 1 ? "" : "s"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-secondary/60 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <CalendarClock className="size-4 text-primary" aria-hidden="true" />
                  Live Preview
                </div>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <PreviewRow
                    label="Indicative APR"
                    value={preview.isFetching ? "…" : `${previewApr.toFixed(2)}%`}
                  />
                  <PreviewRow label="Est. unlock" value={maturityDate} />
                  <PreviewRow
                    label="Est. Interest"
                    value={preview.isFetching ? "…" : formatCcx(previewInterest, 4)}
                    tone="incoming"
                  />
                  <PreviewRow
                    label="Value at Maturity"
                    value={
                      preview.isFetching || !amountIsValid
                        ? "…"
                        : formatCcx(amountValue + previewInterest, 4)
                    }
                    tone="deposit"
                  />
                </dl>
              </div>

              <Button
                type="button"
                className="w-full gap-2 active:scale-[0.98] motion-reduce:active:scale-100"
                onClick={submitForm}
                disabled={constraints?.isDepositDisabled || !amountIsValid || preview.isFetching}
              >
                <Lock className="size-4" aria-hidden="true" />
                Review Deposit
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Confirm deposit</DialogTitle>
              <DialogDescription>{walletCopy.depositCreateConfirm}</DialogDescription>
            </DialogHeader>
            <dl className="space-y-2 text-sm">
              <ConfirmRow label="Amount" value={formatCcx(amountValue)} />
              <ConfirmRow
                label="Term"
                value={`${durationMonths} month${durationMonths === 1 ? "" : "s"}`}
              />
              <ConfirmRow
                label="Est. interest"
                value={formatCcx(previewInterest, 4)}
                tone="incoming"
              />
              <ConfirmRow label="Network fee" value={formatCcx(createFee, 6)} />
              <ConfirmRow
                label="Total debit"
                value={formatCcx(amountValue + createFee, 6)}
                strong
              />
            </dl>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep("form")}>
                Back
              </Button>
              <Button type="button" onClick={confirmCreate} disabled={isPending}>
                {isPending ? "Creating…" : "Confirm & Create"}
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

function isMatured(deposit: Deposit) {
  return canWithdrawDeposit(deposit);
}

function getProgressPct(deposit: Deposit) {
  return Math.min(Math.max(deposit.progressPct, 0), 100);
}

function getUnlocksLabel(deposit: Deposit, variant: "table" | "timeline") {
  if (deposit.status === "spent") return "Withdrawn";
  if (deposit.withdrawPending) return "Pending";
  if (canWithdrawDeposit(deposit)) return variant === "table" ? "Ready" : "Ready now";
  return `${deposit.unlocksInDays} day${deposit.unlocksInDays === 1 ? "" : "s"}`;
}

function getTimelineDateLabel(deposit: Deposit) {
  if (deposit.status === "spent") return "Withdrawn";
  if (deposit.withdrawPending) return "Withdrawal pending";
  if (canWithdrawDeposit(deposit)) return "Ready now";
  return `${formatMaturityDate(deposit.unlocksInDays)} - in ${getUnlocksLabel(deposit, "timeline")}`;
}

function formatMaturityDate(unlocksInDays: number) {
  return formatDate(addDays(new Date(), unlocksInDays));
}

function formatDate(date: Date) {
  return dateFormatter.format(date);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}
