"use client";

import { CalendarClock, Target, Trophy } from "lucide-react";
import {
  RailMarketSection,
  RailSectionHeading,
  RailStatRow,
} from "@/components/layout/rails/rail-parts";
import { RightRailHeader } from "@/components/layout/right-rail";
import { Skeleton } from "@/components/ui/skeleton";
import { CcxAmount } from "@/components/wallet/ccx";
import type { Goal } from "@/lib/goals/goal";
import { atomicToCcx, computeGoal } from "@/lib/goals/progress";
import { useGoals } from "@/lib/hooks/use-goals";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useFormatters } from "@/lib/i18n/use-formatters";

export function GoalsRail({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const { formatCcx, formatDate } = useFormatters();
  const { goals, loading } = useGoals();

  const active = goals.filter((g) => g.status !== "archived");
  const computed = active.map((g) => ({ goal: g, c: computeGoal(g) }));

  let totalSaved = BigInt(0);
  let totalTarget = BigInt(0);
  let onTrackCount = 0;
  let behindCount = 0;
  for (const { c } of computed) {
    totalSaved += c.saved > c.target ? c.target : c.saved;
    totalTarget += c.target;
    if (c.status === "on-track" || c.status === "due-soon") onTrackCount += 1;
    if (c.status === "behind" || c.status === "deadline-passed") behindCount += 1;
  }
  const blendedPct =
    totalTarget > BigInt(0) ? Math.round((Number(totalSaved) / Number(totalTarget)) * 100) : 0;

  // Next milestone: closest-to-done unachieved goal.
  const nextMilestone = computed
    .filter(({ c }) => !c.achieved)
    .sort((a, b) => b.c.visualPct - a.c.visualPct)[0];
  // Soonest deadline among active, unachieved.
  const soonest = computed
    .filter(({ goal, c }) => goal.deadline && !c.achieved)
    .sort((a, b) => (a.goal.deadline as string).localeCompare(b.goal.deadline as string))[0];

  return (
    <div className="flex flex-col gap-1">
      {embedded ? null : <RightRailHeader title={t("nav.goals")} />}

      <section>
        <RailSectionHeading icon={Target} first>
          {t("goals.railOverall")}
        </RailSectionHeading>
        <div className="mt-3.5 rounded-xl border border-border/70 px-5">
          {loading ? (
            <RailSkeleton rows={4} />
          ) : active.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{t("goals.railEmpty")}</p>
          ) : (
            <>
              <RailStatRow
                first
                label={t("goals.railTotalSaved")}
                value={<CcxAmount>{formatCcx(atomicToCcx(totalSaved), 0, true)}</CcxAmount>}
              />
              <RailStatRow
                label={t("goals.railTotalTarget")}
                value={<CcxAmount>{formatCcx(atomicToCcx(totalTarget), 0, true)}</CcxAmount>}
              />
              <RailStatRow label={t("goals.railBlended")} value={`${blendedPct}%`} />
              <RailStatRow
                label={t("goals.railStatus")}
                value={t("goals.railOnBehind", { onTrack: onTrackCount, behind: behindCount })}
              />
            </>
          )}
        </div>
      </section>

      {nextMilestone ? (
        <section>
          <RailSectionHeading icon={Trophy}>{t("goals.railNextMilestone")}</RailSectionHeading>
          <div className="mt-3.5 flex items-center gap-3 rounded-xl border border-border/70 p-4">
            <MiniRing pct={nextMilestone.c.visualPct} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {nextMilestone.goal.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("goals.railToGo", {
                  amount: formatCcx(atomicToCcx(nextMilestone.c.remaining), 0, true),
                })}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {soonest?.goal.deadline ? (
        <section>
          <RailSectionHeading icon={CalendarClock}>
            {t("goals.railSoonestDeadline")}
          </RailSectionHeading>
          <div className="mt-3.5 rounded-xl border border-border/70 px-5">
            <RailStatRow first label={soonest.goal.name} value={renderDeadline(soonest.goal)} />
            <RailStatRow
              label={t("goals.railDaysLeft")}
              value={t("goals.railDaysValue", {
                count: Math.max(soonest.c.pace?.daysLeft ?? 0, 0),
              })}
            />
          </div>
        </section>
      ) : null}

      <RailMarketSection first={false} />
    </div>
  );

  function renderDeadline(goal: Goal) {
    return goal.deadline ? formatDate(new Date(goal.deadline), { dateStyle: "medium" }) : "—";
  }
}

function MiniRing({ pct }: { pct: number }) {
  const clamped = Math.min(Math.max(pct, 0), 100);
  const r = 16;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - clamped / 100);
  return (
    <svg viewBox="0 0 40 40" className="size-10 shrink-0 text-wallet-incoming" aria-hidden="true">
      <circle cx="20" cy="20" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform="rotate(-90 20 20)"
      />
      <text x="20" y="24" textAnchor="middle" className="fill-foreground font-mono text-[9px]">
        {`${Math.round(clamped)}%`}
      </text>
    </svg>
  );
}

function RailSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-4 py-3">
      {Array.from({ length: rows }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static fixed-length placeholder list
        <div key={i} className="flex items-center justify-between gap-3">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}
