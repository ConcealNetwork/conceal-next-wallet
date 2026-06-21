"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "@/lib/ui/toast";
import { useMessages, useWalletInfo } from "@/lib/hooks";
import { canNotify, isOptedIn, notify, selectNewKeys } from "@/lib/notifications/notify";
import { listWatchers } from "@/lib/storage/check-ins-store";
import type { Message } from "@/lib/types";
import { countOverdue, overdueInstanceKeys } from "@/lib/ui/check-ins";

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

/**
 * Surface a nudge when watched contacts are overdue — on first synced load, on
 * message updates, and whenever the tab returns to the foreground.
 *
 * De-dupe is per overdue-instance (contact id + its last-heard basis), not a
 * once-per-load latch, so returning to a backgrounded tab re-evaluates without
 * re-alerting contacts already announced this session. Toasts are the default;
 * OS notifications fire additionally only when opted in + permission granted.
 */
export function useCheckInAlerts(): void {
  const synced = useWalletSynced();
  const messages = useMessages();
  const ready = synced && messages.data !== undefined;
  // Per-session memory of overdue-instances already announced.
  const announcedRef = useRef<Set<string>>(new Set());

  const evaluate = useCallback((data: readonly Message[]) => {
    const nowISO = new Date().toISOString();
    const watchers = listWatchers();
    const fresh = selectNewKeys(overdueInstanceKeys(watchers, data, nowISO), announcedRef.current);
    if (fresh.length === 0) return;
    for (const key of fresh) announcedRef.current.add(key);

    const overdue = countOverdue(watchers, data, nowISO);
    if (overdue > 0) {
      toast.warning(
        `${overdue} check-in${overdue === 1 ? "" : "s"} overdue — you may want to reach out.`,
      );
    }
    if (isOptedIn() && canNotify()) {
      void notify("Check-in overdue", {
        body: `${fresh.length} watched contact${fresh.length === 1 ? " is" : "s are"} overdue — you may want to reach out.`,
        tag: "ccx-check-ins",
        // Scope-relative (no leading slash) so the SW notificationclick handler
        // deep-links under any deploy base path.
        data: { url: "wallet/check-ins" },
      });
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const data = messages.data ?? [];
    evaluate(data);
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") evaluate(data);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [ready, messages.data, evaluate]);
}
