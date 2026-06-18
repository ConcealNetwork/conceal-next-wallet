"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { canNotify, isOptedIn, notify, selectNewKeys } from "@/lib/notifications/notify";
import { listSchedules } from "@/lib/storage/scheduled-payments-store";
import { countDue, dueInstanceKeys } from "@/lib/ui/scheduled-payments";

/**
 * On wallet open — and again whenever the tab returns to the foreground —
 * surface reminders for any *due* recurring payments. It only reminds; nothing
 * is ever sent automatically.
 *
 * De-dupe is per due-instance (schedule id + its next-due date), not a
 * once-per-load latch, so returning to a backgrounded tab re-evaluates without
 * re-alerting items already announced this session. Toasts are the default
 * surface; OS notifications fire additionally only when the user has opted in
 * and granted permission.
 */
export function useDuePaymentReminders(): void {
  // Per-session memory of due-instances already announced. A ref (not state) so
  // re-checks don't trigger re-renders; lives for the lifetime of the mount.
  const announcedRef = useRef<Set<string>>(new Set());

  const evaluate = useCallback(() => {
    const schedules = listSchedules();
    const nowISO = new Date().toISOString();
    const fresh = selectNewKeys(dueInstanceKeys(schedules, nowISO), announcedRef.current);
    if (fresh.length === 0) return;
    for (const key of fresh) announcedRef.current.add(key);

    const due = countDue(schedules, nowISO);
    if (due > 0) {
      toast.info(
        `${due} scheduled payment${due === 1 ? " is" : "s are"} due. Open “Scheduled” to send.`,
      );
    }
    // Additive OS notification — only when opted in + permission granted.
    if (isOptedIn() && canNotify()) {
      void notify("Scheduled payment due", {
        body: `${fresh.length} reminder${fresh.length === 1 ? " is" : "s are"} due. Open the wallet to send.`,
        tag: "ccx-scheduled-payments",
      });
    }
  }, []);

  useEffect(() => {
    evaluate();
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") evaluate();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [evaluate]);
}
