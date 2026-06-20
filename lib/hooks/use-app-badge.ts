"use client";

import { useEffect, useState } from "react";
import { useOverdueCheckInCount } from "@/lib/hooks/use-check-ins";
import { useDueReminderCount } from "@/lib/hooks/use-due-reminders";
import { clearAppBadge, updateAppBadge } from "@/lib/notifications/app-badge";

/** How often to re-evaluate the counts so the badge can't drift stale. */
const BADGE_REFRESH_MS = 60_000;

/**
 * Mirror the count of *actionable* items (overdue check-ins + due payment
 * reminders) on the installed-app icon via the Badging API. Both source counts
 * are already computed by the app; this hook only forwards their sum.
 *
 * Progressive enhancement: `updateAppBadge` feature-detects + swallows failures,
 * so it no-ops where the Badging API is absent. A slow timer + a refocus tick
 * force a re-evaluation so an item crossing its overdue/due deadline while the
 * tab sits open still updates the badge (the overdue count is render-derived and
 * has no state of its own). The badge is cleared on unmount (wallet lock /
 * navigation away from the shell) so a stale count never lingers on the icon.
 */
export function useAppBadge(): void {
  const [, setTick] = useState(0);
  const overdueCheckIns = useOverdueCheckInCount();
  const dueReminders = useDueReminderCount();
  const total = overdueCheckIns + dueReminders;

  // Force a re-render (→ both counts recompute against a fresh clock) on a slow
  // cadence and on refocus. Increment guarantees a render even when a count is
  // unchanged (React would bail on an equal setState value).
  useEffect(() => {
    const bump = () => setTick((tick) => tick + 1);
    const timer = setInterval(bump, BADGE_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") bump();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    updateAppBadge(total);
  }, [total]);

  // Clear the badge when the shell unmounts (explicit cleanup-only effect).
  useEffect(() => () => clearAppBadge(), []);
}
