"use client";

import { useEffect } from "react";
import { useOverdueCheckInCount } from "@/lib/hooks/use-check-ins";
import { useDueReminderCount } from "@/lib/hooks/use-due-reminders";
import { clearAppBadge, updateAppBadge } from "@/lib/notifications/app-badge";

/**
 * Mirror the count of *actionable* items (overdue check-ins + due payment
 * reminders) on the installed-app icon via the Badging API. Both source counts
 * are already computed by the app; this hook only forwards their sum.
 *
 * Progressive enhancement: `updateAppBadge` feature-detects + swallows failures,
 * so on browsers without the API (or in mock mode, where the counts are 0) it's
 * a no-op. The badge is cleared on unmount (e.g. wallet lock / navigation away
 * from the shell) so a stale count never lingers on the icon.
 */
export function useAppBadge(): void {
  const overdueCheckIns = useOverdueCheckInCount();
  const dueReminders = useDueReminderCount();
  const total = overdueCheckIns + dueReminders;

  useEffect(() => {
    updateAppBadge(total);
  }, [total]);

  useEffect(() => clearAppBadge, []);
}
