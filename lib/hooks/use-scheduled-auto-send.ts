"use client";

import { useEffect, useRef } from "react";
import { env } from "@/lib/env";
import { useWalletInfo } from "@/lib/hooks";
import { queryKeys } from "@/lib/hooks/query-keys";
import { useQueryClient } from "@/lib/hooks/query-provider";
import { services } from "@/lib/services";
import { useWalletSession } from "@/lib/session/wallet-session";
import { listSchedules, markSchedulePaid } from "@/lib/storage/scheduled-payments-store";
import { schedulesToAutoSend } from "@/lib/ui/scheduled-payments";
import { toast } from "@/lib/ui/toast";

/**
 * Scheduled-payment AUTO-SEND engine (#92 phase 2). While the wallet is open + unlocked
 * (real mode, spendable), this fires armed (`autoSend`) schedules the moment they come due —
 * no per-fire prompt; consent was given once at arming. Delivery rides the durable outbound
 * queue (phase 1), so a dropped connection still completes the send.
 *
 * SAFETY — advance BEFORE sending. Each due instance is `markSchedulePaid` (which advances
 * its next-due) BEFORE `sendTransaction`, so a re-tick, a tab refocus, or a reload/crash can
 * never re-fire the same instance: the worst case on a send failure is a MISSED payment (the
 * user gets an error toast and can send manually), never a double-send. An in-flight set +
 * a re-entrancy guard close the within-tick window; the persisted advance closes the cross-
 * tick / reload window. Real mode + non-view-only only — mock never auto-sends real funds.
 */
const AUTO_SEND_POLL_MS = 30_000;

export function useScheduledAutoSend(): void {
  const { status } = useWalletSession();
  const viewOnly = useWalletInfo().data?.viewOnly ?? false;
  const queryClient = useQueryClient();
  const inFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (status !== "open" || env.useMockWallet || viewOnly) return;
    let active = true;
    let ticking = false;

    const tick = async () => {
      if (ticking) return; // re-entrancy: the 30s timer + a tab refocus can overlap
      ticking = true;
      try {
        const now = new Date().toISOString();
        for (const schedule of schedulesToAutoSend(listSchedules(), now)) {
          if (!active) break;
          if (inFlight.current.has(schedule.id)) continue;
          const amount = Number(schedule.amount);
          if (!Number.isFinite(amount) || amount <= 0) continue;

          inFlight.current.add(schedule.id);
          // Advance FIRST (persisted) — see the safety note above.
          markSchedulePaid(schedule.id, now);
          try {
            await services.transactions.sendTransaction({
              address: schedule.address,
              amount,
              ...(schedule.paymentId ? { paymentId: schedule.paymentId } : {}),
            });
            toast.success(`Auto-sent ${schedule.amount} CCX — ${schedule.label}`);
          } catch {
            toast.error(`Auto-send failed for “${schedule.label}”. Send it manually.`);
          } finally {
            inFlight.current.delete(schedule.id);
            void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
            void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
            void queryClient.invalidateQueries({ queryKey: queryKeys.queuedTransactions });
          }
        }
      } finally {
        ticking = false;
      }
    };

    void tick();
    const timer = setInterval(() => void tick(), AUTO_SEND_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status, viewOnly, queryClient]);
}
