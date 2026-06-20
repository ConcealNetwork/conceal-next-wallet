/**
 * Goals progress + projection — pure functions, NO React/engine import (#149).
 *
 * All money math is **atomic-unit integer math** via BigInt (CCX is 6dp; float
 * drifts). Callers convert to a display `CcxAmount`/number only at the render edge
 * with `atomicToCcx`. Dates use UTC day boundaries so pace can't drift with TZ.
 */
import type { Goal } from "@/lib/goals/goal";
import type { CcxAmount } from "@/lib/types";
import { CCX_ATOMIC_UNITS } from "@/lib/utils";

const MS_PER_DAY = 86_400_000;
const ATOMIC_PER_CCX = BigInt(CCX_ATOMIC_UNITS);
/** Show weekly pace at/under this many days left, monthly beyond it. */
const WEEKLY_PACE_THRESHOLD_DAYS = 60;
/** A goal is "due soon" within this many days of its deadline. */
const DUE_SOON_DAYS = 14;

export type GoalDerivedStatus =
  | "archived"
  | "achieved"
  | "deadline-passed"
  | "behind"
  | "due-soon"
  | "on-track"
  | "not-started"
  | "in-progress";

export interface GoalComputation {
  /** Σ contributions, atomic units. */
  saved: bigint;
  target: bigint;
  /** max(target − saved, 0). */
  remaining: bigint;
  /** max(saved − target, 0). */
  overage: bigint;
  /** Raw saved/target·100 (can exceed 100). */
  progressPct: number;
  /** progressPct clamped to 0..100 (for rings/bars). */
  visualPct: number;
  achieved: boolean;
  status: GoalDerivedStatus;
  /** Deadline-only fields (null when the goal has no deadline). */
  pace: GoalPace | null;
}

export interface GoalPace {
  /** Whole days until the deadline (negative once passed). */
  daysLeft: number;
  /** ceil(remaining / max(daysLeft, 1)), atomic. */
  requiredPerDay: bigint;
  requiredPerWeek: bigint;
  requiredPerMonth: bigint;
  /** Which cadence to surface (weekly when ≤ 60 days left). */
  cadence: "weekly" | "monthly";
  /** Linear-plan expected-saved-by-today, atomic. */
  expectedSaved: bigint;
  /** saved + buffer ≥ expectedSaved. */
  onTrack: boolean;
}

/** Atomic units (bigint or wire string) → a display `CcxAmount`. */
export function atomicToCcx(atomic: bigint | string): CcxAmount {
  return { atomic: Number(typeof atomic === "string" ? BigInt(atomic) : atomic) };
}

export function sumContributions(goal: Goal): bigint {
  return goal.contributions.reduce((acc, c) => acc + BigInt(c.amount), BigInt(0));
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= BigInt(0)) return BigInt(0);
  return (numerator + denominator - BigInt(1)) / denominator;
}

function toEpochDayUtc(value: string | Date): number {
  const date = typeof value === "string" ? new Date(value) : value;
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / MS_PER_DAY,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Compute every derived value a goal card needs. `now` is injected for testability
 * (defaults to the current time). Never mutates the goal.
 */
export function computeGoal(goal: Goal, now: Date = new Date()): GoalComputation {
  const saved = sumContributions(goal);
  const target = BigInt(goal.target);
  const remaining = saved >= target ? BigInt(0) : target - saved;
  const overage = saved > target ? saved - target : BigInt(0);
  const progressPct = target > BigInt(0) ? (Number(saved) / Number(target)) * 100 : 0;
  const visualPct = clamp(progressPct, 0, 100);
  const achieved = saved >= target;

  const pace = goal.deadline ? computePace(goal, saved, target, remaining, now) : null;
  const status = deriveStatus(goal, { saved, achieved, pace });

  return { saved, target, remaining, overage, progressPct, visualPct, achieved, pace, status };
}

function computePace(
  goal: Goal,
  saved: bigint,
  target: bigint,
  remaining: bigint,
  now: Date,
): GoalPace {
  // biome-ignore lint/style/noNonNullAssertion: only called when goal.deadline is set
  const deadlineDay = toEpochDayUtc(goal.deadline!);
  const todayDay = toEpochDayUtc(now);
  const createdDay = toEpochDayUtc(goal.createdAt);
  const daysLeft = deadlineDay - todayDay;

  const requiredPerDay = ceilDiv(remaining, BigInt(Math.max(daysLeft, 1)));
  const requiredPerWeek = requiredPerDay * BigInt(7);
  // 30.4375 days/month, kept in integer math as ·1218 / ÷40.
  const requiredPerMonth = (requiredPerDay * BigInt(1218)) / BigInt(40);
  const cadence = daysLeft <= WEEKLY_PACE_THRESHOLD_DAYS ? "weekly" : "monthly";

  const totalPlanDays = BigInt(Math.max(deadlineDay - createdDay, 1));
  const elapsedDays = BigInt(clamp(todayDay - createdDay, 0, Number(totalPlanDays)));
  const expectedSaved = (target * elapsedDays) / totalPlanDays;
  // 2% of target, or 1 CCX, whichever is larger.
  const buffer = (() => {
    const twoPct = (target * BigInt(2)) / BigInt(100);
    return twoPct > ATOMIC_PER_CCX ? twoPct : ATOMIC_PER_CCX;
  })();
  const onTrack = saved + buffer >= expectedSaved;

  return {
    daysLeft,
    requiredPerDay,
    requiredPerWeek,
    requiredPerMonth,
    cadence,
    expectedSaved,
    onTrack,
  };
}

/** Strict precedence: archived > achieved > deadline-passed > behind > due-soon > on-track > not-started. */
function deriveStatus(
  goal: Goal,
  ctx: { saved: bigint; achieved: boolean; pace: GoalPace | null },
): GoalDerivedStatus {
  if (goal.status === "archived") return "archived";
  if (ctx.achieved) return "achieved";
  if (ctx.pace) {
    if (ctx.pace.daysLeft < 0) return "deadline-passed";
    if (!ctx.pace.onTrack) return "behind";
    if (ctx.pace.daysLeft <= DUE_SOON_DAYS) return "due-soon";
    return "on-track";
  }
  // No deadline: an aspiration, not a commitment — no on-track/behind claim.
  return ctx.saved === BigInt(0) ? "not-started" : "in-progress";
}
