/**
 * Goals data model — a device-local savings tracker (#149).
 *
 * Neutral UI module: NO `conceal-wallet-sdk` / engine import, so it never pulls the
 * engine into mock mode. Money is stored as **atomic-unit strings** (CCX is 6dp;
 * float math drifts) and converted at the display edge only (see `progress.ts`).
 *
 * A goal is a tracker, never a vault: nothing here moves or locks CCX. Progress is
 * what the user *logged*, not their live balance.
 */
import { CCX_ATOMIC_UNITS } from "@/lib/utils";

export type GoalStatus = "active" | "achieved" | "archived";

/** Fixed palette tokens (never free hex) — map to the wallet theme at render. */
export type GoalColor = "amber" | "incoming" | "deposit" | "violet" | "rose" | "sky" | "slate";

/** Fixed Lucide-icon subset (no emoji) — keeps Goals on-brand with the design system. */
export type GoalIcon =
  | "target"
  | "piggyBank"
  | "laptop"
  | "home"
  | "car"
  | "plane"
  | "graduationCap"
  | "gift"
  | "heart"
  | "wallet"
  | "smartphone"
  | "sparkles";

export interface GoalContribution {
  /** crypto.randomUUID() */
  id: string;
  /** atomic-unit string, > 0 (MVP is positive-only — reduce progress by edit/delete). */
  amount: string;
  /** ISO timestamp the contribution was logged for (backdating allowed). */
  at: string;
  /** Optional note, ≤ GOAL_NOTE_MAX, sanitized. */
  note?: string;
  /** "deposit" reserved for P2 deposit-linking. */
  source: "manual" | "snapshot" | "deposit";
  /** P2 only. */
  depositId?: string;
}

export interface Goal {
  /** crypto.randomUUID() */
  id: string;
  /** 1–GOAL_NAME_MAX chars, trimmed + sanitized. */
  name: string;
  /** atomic-unit string, > 0. */
  target: string;
  /** Optional date-only deadline (YYYY-MM-DD), today-or-future at creation. */
  deadline?: string;
  icon?: GoalIcon;
  color?: GoalColor;
  contributions: GoalContribution[];
  status: GoalStatus;
  createdAt: string;
  /** Set once when first achieved; gates the one-shot celebration. */
  achievedAt?: string;
  /** P2 only. */
  linkedDepositIds?: string[];
}

export const GOAL_NAME_MAX = 60;
export const GOAL_NOTE_MAX = 120;

export const GOAL_COLORS = [
  "amber",
  "incoming",
  "deposit",
  "violet",
  "rose",
  "sky",
  "slate",
] as const satisfies readonly GoalColor[];

export const GOAL_ICONS = [
  "target",
  "piggyBank",
  "laptop",
  "home",
  "car",
  "plane",
  "graduationCap",
  "gift",
  "heart",
  "wallet",
  "smartphone",
  "sparkles",
] as const satisfies readonly GoalIcon[];

export const DEFAULT_GOAL_COLOR: GoalColor = "amber";
export const DEFAULT_GOAL_ICON: GoalIcon = "target";

const GOAL_COLOR_SET = new Set<string>(GOAL_COLORS);
const GOAL_ICON_SET = new Set<string>(GOAL_ICONS);

/** A non-negative integer string with no sign/decimal — the atomic-unit wire form. */
function isAtomicString(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/.test(value);
}

/**
 * Parse a user-entered CCX decimal string into an atomic-unit string, precisely
 * (no float). Rejects empty, signed, non-numeric, over-precision (> 6 dp), and
 * non-positive input. Accepts down to `0.000001`.
 */
export function parseCcxToAtomic(input: string): string | null {
  const trimmed = input.trim();
  if (!/^\d{1,12}(\.\d{1,6})?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = frac.padEnd(6, "0");
  const atomic = BigInt(whole) * BigInt(CCX_ATOMIC_UNITS) + BigInt(fracPadded || "0");
  return atomic > BigInt(0) ? atomic.toString() : null;
}

/** Collapse whitespace, strip control chars (by code point, no control-char regex), trim, cap. */
function sanitizeText(raw: string, max: number): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  let out = "";
  for (const ch of collapsed) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 32 && code !== 127) out += ch;
  }
  return out.slice(0, max);
}

export function sanitizeGoalName(raw: string): string {
  return sanitizeText(raw, GOAL_NAME_MAX);
}

export function sanitizeGoalNote(raw: string): string {
  return sanitizeText(raw, GOAL_NOTE_MAX);
}

export function isGoalColor(value: unknown): value is GoalColor {
  return typeof value === "string" && GOAL_COLOR_SET.has(value);
}

export function isGoalIcon(value: unknown): value is GoalIcon {
  return typeof value === "string" && GOAL_ICON_SET.has(value);
}

export function isGoalContribution(value: unknown): value is GoalContribution {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === "string" &&
    isAtomicString(c.amount) &&
    c.amount !== "0" &&
    typeof c.at === "string" &&
    (c.note === undefined || typeof c.note === "string") &&
    (c.source === "manual" || c.source === "snapshot" || c.source === "deposit") &&
    (c.depositId === undefined || typeof c.depositId === "string")
  );
}

/** Per-item type guard — corrupt records are skipped on read, never fatal. */
export function isGoal(value: unknown): value is Goal {
  if (!value || typeof value !== "object") return false;
  const g = value as Record<string, unknown>;
  return (
    typeof g.id === "string" &&
    typeof g.name === "string" &&
    g.name.length > 0 &&
    isAtomicString(g.target) &&
    g.target !== "0" &&
    (g.deadline === undefined || typeof g.deadline === "string") &&
    (g.icon === undefined || isGoalIcon(g.icon)) &&
    (g.color === undefined || isGoalColor(g.color)) &&
    Array.isArray(g.contributions) &&
    g.contributions.every(isGoalContribution) &&
    (g.status === "active" || g.status === "achieved" || g.status === "archived") &&
    typeof g.createdAt === "string" &&
    (g.achievedAt === undefined || typeof g.achievedAt === "string") &&
    (g.linkedDepositIds === undefined ||
      (Array.isArray(g.linkedDepositIds) &&
        g.linkedDepositIds.every((id) => typeof id === "string")))
  );
}
