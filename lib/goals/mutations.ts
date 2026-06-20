/**
 * Pure goal/contribution mutation helpers (#149) — no React/engine/storage.
 *
 * All return NEW objects (immutable). `now`/`id` are injected for testability. The
 * achieve/reopen lifecycle (spec §7) lives here so it can be unit-tested apart from
 * the store + hook.
 */
import {
  type Goal,
  type GoalColor,
  type GoalContribution,
  type GoalIcon,
  parseCcxToAtomic,
  sanitizeGoalName,
  sanitizeGoalNote,
} from "@/lib/goals/goal";

export interface NewGoalInput {
  name: string;
  /** Raw CCX decimal string (parsed precisely to atomic). */
  target: string;
  deadline?: string;
  icon?: GoalIcon;
  color?: GoalColor;
}

export interface NewContributionInput {
  /** Raw CCX decimal string. */
  amount: string;
  note?: string;
  /** ISO timestamp; defaults to `now`. */
  at?: string;
}

function sumAtomic(goal: Goal): bigint {
  return goal.contributions.reduce((acc, c) => acc + BigInt(c.amount), BigInt(0));
}

/** Build a new active goal, or null if name/target are invalid. */
export function buildGoal(
  input: NewGoalInput,
  now: Date = new Date(),
  id: string = crypto.randomUUID(),
): Goal | null {
  const name = sanitizeGoalName(input.name);
  const target = parseCcxToAtomic(input.target);
  if (!name || !target) return null;
  const goal: Goal = {
    id,
    name,
    target,
    contributions: [],
    status: "active",
    createdAt: now.toISOString(),
  };
  if (input.deadline) goal.deadline = input.deadline;
  if (input.icon) goal.icon = input.icon;
  if (input.color) goal.color = input.color;
  return goal;
}

/** Build a contribution, or null if the amount is invalid/non-positive. */
export function buildContribution(
  input: NewContributionInput,
  now: Date = new Date(),
  id: string = crypto.randomUUID(),
): GoalContribution | null {
  const amount = parseCcxToAtomic(input.amount);
  if (!amount) return null;
  const contribution: GoalContribution = {
    id,
    amount,
    at: input.at ?? now.toISOString(),
    source: "manual",
  };
  const note = input.note ? sanitizeGoalNote(input.note) : "";
  if (note) contribution.note = note;
  return contribution;
}

/** Re-derive status + achievedAt from the ledger. Sets achievedAt once; reopens on drop. */
function reconcile(goal: Goal, now: Date): Goal {
  if (goal.status === "archived") return goal;
  const reached = sumAtomic(goal) >= BigInt(goal.target);
  if (reached && goal.status !== "achieved") {
    return { ...goal, status: "achieved", achievedAt: goal.achievedAt ?? now.toISOString() };
  }
  if (!reached && goal.status === "achieved") {
    // Reopen-on-edit (spec §7): logged progress fell below target.
    const { achievedAt: _dropped, ...rest } = goal;
    return { ...rest, status: "active" };
  }
  return goal;
}

/** Append a contribution and reconcile achieve/reopen. */
export function addContribution(goal: Goal, contribution: GoalContribution, now: Date = new Date()): Goal {
  return reconcile({ ...goal, contributions: [...goal.contributions, contribution] }, now);
}

/** Remove a contribution by id and reconcile (may reopen an achieved goal). */
export function removeContribution(goal: Goal, contributionId: string, now: Date = new Date()): Goal {
  return reconcile(
    { ...goal, contributions: goal.contributions.filter((c) => c.id !== contributionId) },
    now,
  );
}

/** Edit a contribution's amount/note by id (immutable) and reconcile. */
export function editContribution(
  goal: Goal,
  contributionId: string,
  patch: NewContributionInput,
  now: Date = new Date(),
): Goal | null {
  const amount = parseCcxToAtomic(patch.amount);
  if (!amount) return null;
  const note = patch.note ? sanitizeGoalNote(patch.note) : "";
  const contributions = goal.contributions.map((c) =>
    c.id === contributionId
      ? { ...c, amount, ...(note ? { note } : { note: undefined }), at: patch.at ?? c.at }
      : c,
  );
  return reconcile({ ...goal, contributions }, now);
}

/** Apply an edit to a goal's own fields (name/target/deadline/icon/color); reconcile. */
export function editGoal(goal: Goal, input: Partial<NewGoalInput>, now: Date = new Date()): Goal | null {
  const patch: Partial<Goal> = {};
  if (input.name !== undefined) {
    const name = sanitizeGoalName(input.name);
    if (!name) return null;
    patch.name = name;
  }
  if (input.target !== undefined) {
    const target = parseCcxToAtomic(input.target);
    if (!target) return null;
    patch.target = target;
  }
  if (input.deadline !== undefined) patch.deadline = input.deadline || undefined;
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.color !== undefined) patch.color = input.color;
  return reconcile({ ...goal, ...patch }, now);
}

export function archiveGoal(goal: Goal): Goal {
  return { ...goal, status: "archived" };
}

/** Restore an archived goal; reconcile re-derives achieved vs active from the ledger. */
export function restoreGoal(goal: Goal, now: Date = new Date()): Goal {
  return reconcile({ ...goal, status: "active" }, now);
}
