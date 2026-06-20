"use client";

import { Check, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  GOAL_COLOR_BG,
  GOAL_COLOR_TEXT,
  GOAL_ICON_COMPONENT,
} from "@/app/(wallet)/wallet/goals/goal-color";
import { CcxAmount } from "@/components/wallet/ccx";
import type { Goal, GoalContribution } from "@/lib/goals/goal";
import { DEFAULT_GOAL_COLOR, DEFAULT_GOAL_ICON } from "@/lib/goals/goal";
import { atomicToCcx, type GoalComputation } from "@/lib/goals/progress";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { cn } from "@/lib/utils";

interface GoalCardProps {
  goal: Goal;
  computation: GoalComputation;
  /** USD price per CCX, for the ≈$ subline; omit to hide it. */
  usdPrice?: number;
  onAdd: (goal: Goal) => void;
  onEdit: (goal: Goal) => void;
  onArchive: (goal: Goal) => void;
  onRestore: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  onEditContribution: (goal: Goal, contribution: GoalContribution) => void;
  onDeleteContribution: (goal: Goal, contribution: GoalContribution) => void;
}

export function GoalCard({
  goal,
  computation,
  usdPrice,
  onAdd,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  onEditContribution,
  onDeleteContribution,
}: GoalCardProps) {
  const { t } = useI18n();
  const { formatCcx, formatUsd, formatDate } = useFormatters();
  const [trailOpen, setTrailOpen] = useState(false);

  const color = goal.color ?? DEFAULT_GOAL_COLOR;
  const Icon = GOAL_ICON_COMPONENT[goal.icon ?? DEFAULT_GOAL_ICON];
  const { saved, target, remaining, overage, visualPct, achieved, pace, status } = computation;
  const archived = goal.status === "archived";

  const savedCcx = atomicToCcx(saved);
  const targetCcx = atomicToCcx(target);
  const usdLine =
    usdPrice !== undefined
      ? `${formatUsd((Number(saved) / 1e6) * usdPrice, 2)} ${t("goals.ofUsd", {
          value: formatUsd((Number(target) / 1e6) * usdPrice, 2),
        })}`
      : null;

  const deadlineDate = goal.deadline
    ? formatDate(new Date(goal.deadline), { dateStyle: "medium" })
    : null;
  const targetText = formatCcx(targetCcx, 0, true);
  const sortedContribs = [...goal.contributions].sort((a, b) => (a.at < b.at ? 1 : -1));

  // Expected-pace marker (graft from momentum): a thin tick at the linear-plan
  // expected-% for deadline goals that aren't done yet.
  const expectedPct =
    pace && !achieved && target > BigInt(0)
      ? Math.min(100, (Number(pace.expectedSaved) / Number(target)) * 100)
      : null;

  return (
    <div
      className={cn(
        "wallet-card flex flex-col gap-4 p-5",
        achieved && "ring-1 ring-wallet-incoming/30",
        archived && "opacity-70",
      )}
    >
      <div className="flex items-start gap-3">
        <Ring
          pct={visualPct}
          colorClass={achieved ? "text-wallet-incoming" : GOAL_COLOR_TEXT[color]}
          done={achieved}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-md",
                  GOAL_COLOR_BG[color],
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <h3 className="truncate font-semibold text-foreground">{goal.name}</h3>
            </div>
            <CardMenu
              goal={goal}
              onEdit={() => onEdit(goal)}
              onArchive={() => onArchive(goal)}
              onRestore={() => onRestore(goal)}
              onDelete={() => onDelete(goal)}
            />
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {deadlineDate
              ? t("goals.targetByDate", { target: targetText, date: deadlineDate })
              : t("goals.targetNoDeadline", { target: targetText })}
          </p>
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-lg font-semibold text-foreground">
            <CcxAmount>{formatCcx(savedCcx, 0, true)}</CcxAmount>{" "}
            <span className="text-sm text-muted-foreground">
              {t("goals.ofTarget", { target: targetText })}
            </span>
          </p>
          {usdLine ? <p className="mt-0.5 text-xs text-muted-foreground">≈ {usdLine}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-sm font-semibold text-foreground">
            {overage > BigInt(0) ? (
              <span className="text-wallet-incoming">
                {t("goals.overBy", { amount: formatCcx(atomicToCcx(overage), 0, true) })}
              </span>
            ) : (
              <CcxAmount>{formatCcx(atomicToCcx(remaining), 0, true)}</CcxAmount>
            )}
          </p>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {overage > BigInt(0) ? "" : t("goals.remaining")}
          </p>
        </div>
      </div>

      <ProgressBar pct={visualPct} expectedPct={expectedPct} done={achieved} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusPill status={status} pace={pace} formatCcx={formatCcx} />
        <div className="flex items-center gap-1">
          {!archived ? (
            <button
              type="button"
              onClick={() => onAdd(goal)}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition hover:border-ring"
            >
              <Plus className="size-4" aria-hidden="true" />
              {t("goals.add")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onEdit(goal)}
            className="inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition hover:text-foreground"
          >
            {t("goals.edit")}
          </button>
        </div>
      </div>

      {sortedContribs.length > 0 ? (
        <div className="border-t border-border/60 pt-3">
          <button
            type="button"
            onClick={() => setTrailOpen((v) => !v)}
            className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
            aria-expanded={trailOpen}
          >
            {t("goals.recentContributions", { count: sortedContribs.length })}
          </button>
          {trailOpen ? (
            <ul className="mt-2 space-y-1.5">
              {sortedContribs.slice(0, 8).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-muted-foreground">
                    {formatDate(new Date(c.at), { dateStyle: "medium" })}
                    {c.note ? ` · ${c.note}` : ""}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="font-mono text-foreground">
                      +<CcxAmount>{formatCcx(atomicToCcx(c.amount), 0, true)}</CcxAmount>
                    </span>
                    {!archived ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onEditContribution(goal, c)}
                          className="text-muted-foreground transition hover:text-foreground"
                          aria-label={t("goals.editContribution")}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteContribution(goal, c)}
                          className="text-muted-foreground transition hover:text-wallet-outgoing"
                          aria-label={t("goals.deleteContribution")}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Ring({ pct, colorClass, done }: { pct: number; colorClass: string; done: boolean }) {
  const clamped = Math.min(Math.max(pct, 0), 100);
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  return (
    <svg viewBox="0 0 44 44" className={cn("size-12 shrink-0", colorClass)} aria-hidden="true">
      <circle cx="22" cy="22" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
      <circle
        cx="22"
        cy="22"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 22 22)"
        style={{ "--donut-offset": String(offset) } as CSSProperties}
      />
      {done ? (
        <path
          d="M16 22.5 l4 4 l8 -9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <text x="22" y="26" textAnchor="middle" className="fill-foreground font-mono text-[10px]">
          {`${Math.round(clamped)}%`}
        </text>
      )}
    </svg>
  );
}

function ProgressBar({
  pct,
  expectedPct,
  done,
}: {
  pct: number;
  expectedPct: number | null;
  done: boolean;
}) {
  return (
    <div className="relative h-1.5 w-full rounded-full bg-secondary">
      <div
        className={cn("h-full rounded-full", done ? "bg-wallet-incoming" : "bg-primary/70")}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
      {expectedPct !== null ? (
        <span
          className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-foreground/50"
          style={{ left: `${expectedPct}%` }}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

function StatusPill({
  status,
  pace,
  formatCcx,
}: {
  status: GoalComputation["status"];
  pace: GoalComputation["pace"];
  formatCcx: ReturnType<typeof useFormatters>["formatCcx"];
}) {
  const { t } = useI18n();
  if (status === "in-progress") return <span />;

  const paceText = pace
    ? t(pace.cadence === "weekly" ? "goals.perWeek" : "goals.perMonth", {
        amount: formatCcx(
          atomicToCcx(pace.cadence === "weekly" ? pace.requiredPerWeek : pace.requiredPerMonth),
          0,
          true,
        ),
      })
    : "";

  const config: Record<string, { label: string; tone: string; icon?: boolean; suffix?: string }> = {
    "not-started": {
      label: t("goals.statusNotStarted"),
      tone: "text-muted-foreground bg-secondary",
    },
    "on-track": {
      label: t("goals.statusOnTrack"),
      tone: "text-wallet-incoming bg-wallet-incoming/10",
      icon: true,
      suffix: paceText,
    },
    behind: {
      label: t("goals.statusBehind"),
      tone: "text-primary bg-primary/10",
      suffix: `${paceText} ${t("goals.catchUp")}`.trim(),
    },
    "due-soon": {
      label: t("goals.statusDueSoon"),
      tone: "text-primary bg-primary/10",
      suffix: paceText,
    },
    "deadline-passed": {
      label: t("goals.statusPastDeadline"),
      tone: "text-muted-foreground bg-secondary",
    },
    achieved: {
      label: t("goals.statusGoalMet"),
      tone: "text-wallet-incoming bg-wallet-incoming/10",
      icon: true,
    },
    archived: { label: t("goals.statusArchived"), tone: "text-muted-foreground bg-secondary" },
  };
  const c = config[status] ?? config["not-started"];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        c.tone,
      )}
    >
      {c.icon ? <Check className="size-3.5" aria-hidden="true" /> : null}
      {c.suffix ? `${c.label} · ${c.suffix}` : c.label}
    </span>
  );
}

function CardMenu({
  goal,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
}: {
  goal: Goal;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const itemClass =
    "block w-full px-3 py-2 text-left text-sm text-foreground transition hover:bg-secondary";

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="grid size-8 place-items-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        aria-label={t("goals.cardMenu")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="size-4" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-lg"
        >
          <button type="button" role="menuitem" className={itemClass} onClick={run(onEdit)}>
            {t("goals.edit")}
          </button>
          {goal.status === "archived" ? (
            <button type="button" role="menuitem" className={itemClass} onClick={run(onRestore)}>
              {t("goals.restore")}
            </button>
          ) : (
            <button type="button" role="menuitem" className={itemClass} onClick={run(onArchive)}>
              {t("goals.archive")}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className={cn(itemClass, "text-wallet-outgoing")}
            onClick={run(onDelete)}
          >
            {t("goals.delete")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
