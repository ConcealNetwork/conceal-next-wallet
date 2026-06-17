"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useMessages, useWalletInfo } from "@/lib/hooks";
import { listWatchers } from "@/lib/storage/check-ins-store";
import { countOverdue } from "@/lib/ui/check-ins";

/**
 * True once the wallet has caught up to the network tip. Check-in evaluation is
 * gated on this so an in-progress sync (which hasn't pulled recent messages yet)
 * can't raise a false "overdue".
 */
export function useWalletSynced(): boolean {
  const info = useWalletInfo().data;
  if (info === undefined || info.networkHeight <= 0) return false;
  return info.currentHeight >= info.networkHeight - 1;
}

/** Overdue watched-contact count — 0 until synced. Drives the sidebar badge. */
export function useOverdueCheckInCount(): number {
  const synced = useWalletSynced();
  const messages = useMessages();
  if (!synced || messages.data === undefined) return 0;
  return countOverdue(listWatchers(), messages.data, new Date().toISOString());
}

// Once per app load — a nudge, not a per-navigation nag.
let announced = false;

/** One toast on first synced load if any watched contacts are overdue. */
export function useCheckInAlerts(): void {
  const synced = useWalletSynced();
  const messages = useMessages();
  const ready = synced && messages.data !== undefined;
  useEffect(() => {
    if (announced || !ready) return;
    announced = true;
    const overdue = countOverdue(listWatchers(), messages.data ?? [], new Date().toISOString());
    if (overdue > 0) {
      toast.warning(
        `${overdue} check-in${overdue === 1 ? "" : "s"} overdue — you may want to reach out.`,
      );
    }
  }, [ready, messages.data]);
}
