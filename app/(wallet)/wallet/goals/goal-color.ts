import {
  Car,
  Gift,
  GraduationCap,
  Heart,
  Home,
  Laptop,
  type LucideIcon,
  PiggyBank,
  Plane,
  Smartphone,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react";
import type { GoalColor, GoalIcon } from "@/lib/goals/goal";

/**
 * GoalColor token → a Tailwind text-colour class. The progress ring + accents use
 * `currentColor`, so the colour is set once on the element. amber/incoming/deposit
 * map to the wallet theme; the rest use Tailwind's palette.
 */
export const GOAL_COLOR_TEXT: Record<GoalColor, string> = {
  amber: "text-primary",
  incoming: "text-wallet-incoming",
  deposit: "text-wallet-deposit",
  violet: "text-violet-400",
  rose: "text-rose-400",
  sky: "text-sky-400",
  slate: "text-slate-400",
};

/** Soft background tint for the icon chip, per colour token. */
export const GOAL_COLOR_BG: Record<GoalColor, string> = {
  amber: "bg-primary/10 text-primary",
  incoming: "bg-wallet-incoming/10 text-wallet-incoming",
  deposit: "bg-wallet-deposit/10 text-wallet-deposit",
  violet: "bg-violet-400/10 text-violet-400",
  rose: "bg-rose-400/10 text-rose-400",
  sky: "bg-sky-400/10 text-sky-400",
  slate: "bg-slate-400/10 text-slate-400",
};

export const GOAL_ICON_COMPONENT: Record<GoalIcon, LucideIcon> = {
  target: Target,
  piggyBank: PiggyBank,
  laptop: Laptop,
  home: Home,
  car: Car,
  plane: Plane,
  graduationCap: GraduationCap,
  gift: Gift,
  heart: Heart,
  wallet: Wallet,
  smartphone: Smartphone,
  sparkles: Sparkles,
};
