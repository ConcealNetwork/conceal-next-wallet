"use client";

import { useEffect, useRef } from "react";
import { env } from "@/lib/env";
import { useWalletInfo, useWallets } from "@/lib/hooks";
import { queryKeys } from "@/lib/hooks/query-keys";
import { useQueryClient } from "@/lib/hooks/query-provider";
import { canNotify, notify } from "@/lib/notifications/notify";
import { services } from "@/lib/services";
import { useWalletSession } from "@/lib/session/wallet-session";
import {
  listSchedules,
  markSchedulePaidIfDue,
  setScheduleAutoSend,
} from "@/lib/storage/scheduled-payments-store";
import { schedulesToAutoSend } from "@/lib/ui/scheduled-payments";
import { toast } from "@/lib/ui/toast";

/**
 * Scheduled-payment AUTO-SEND engine (#92 phase 2). While the wallet is open + unlocked
 * (real mode, spendable), this fires armed (`autoSend`) schedules belonging to the ACTIVE
 * wallet the moment they come due — no per-fire prompt; consent was given once at arming.
 * Delivery rides the durable outbound queue (phase 1).
 *
 * NO DOUBLE-SEND, three layers (#92 phase-2 review — Gemini/GLM):
 *   1. A cross-tab Web Lock (`navigator.locks`) so only ONE tab runs the tick at a time.
 *   2. `markSchedulePaidIfDue` — an atomic re-read + re-check + advance against the freshest
 *      localStorage, run IMMEDIATELY before the send; if it returns false (already advanced
 *      by a racing context, or no longer due) we skip. This closes the stale-iteration window
 *      and is the compare-and-swap the lock-less fallback relies on.
 *   3. The persisted advance bounds reload/crash: a re-fire would find the instance not due.
 * Advancing BEFORE the send means the worst case on failure is a MISSED payment (surfaced via
 * a toast AND an OS notification so an unattended user isn't left silent), never a double-send.
 * Active-wallet-scoped, real-mode + non-view-only only, and gated until wallet info loads
 * (so a view-only wallet can't slip through while `viewOnly` is still undefined).
 */
const AUTO_SEND_POLL_MS = 30_000;

export function useScheduledAutoSend(): void {
  const { status } = useWalletSession();
  const walletInfo = useWalletInfo();
  const activeWalletId = useWallets().data?.find((w) => w.isActive)?.id;
  const queryClient = useQueryClient();
  const inFlight = useRef<Set<string>>(new Set());

  // Only run once wallet info has LOADED and the wallet is spendable — `viewOnly` is
  // undefined mid-load, so gating on `data` presence avoids a premature fire.
  const ready = status === "open" && !env.useMockWallet && walletInfo.data?.viewOnly === false;

  useEffect(() => {
    if (!ready) return;
    let active = true;
    let ticking = false;

    const runTick = async () => {
      if (ticking) return; // intra-tab re-entrancy (also the lock-less fallback guard)
      ticking = true;
      try {
        const now = new Date().toISOString();
        for (const schedule of schedulesToAutoSend(listSchedules(), now, activeWalletId)) {
          if (!active) break;
          if (inFlight.current.has(schedule.id)) continue;

          const amount = Number(schedule.amount);
          if (!Number.isFinite(amount) || amount <= 0) {
            // Unsendable amount would retry forever — disarm and tell the user.
            setScheduleAutoSend(schedule.id, false);
            toast.error(`Auto-send turned off for “${schedule.label}”: invalid amount.`);
            continue;
          }

          inFlight.current.add(schedule.id);
          try {
            // Atomic advance-IF-still-due (CAS) — skip if a racing context already fired it.
            if (!markSchedulePaidIfDue(schedule.id, now)) continue;
            try {
              await services.transactions.sendTransaction({
                address: schedule.address,
                amount,
                ...(schedule.paymentId ? { paymentId: schedule.paymentId } : {}),
              });
              toast.success(`Auto-sent ${schedule.amount} CCX — ${schedule.label}`);
            } catch {
              toast.error(`Auto-send failed for “${schedule.label}”. Send it manually.`);
              // Persistent signal for an unattended user — a missed payment needs attention.
              if (canNotify()) {
                void notify("Auto-send failed", {
                  body: `Couldn't auto-send “${schedule.label}”. Open the wallet to send it.`,
                  tag: `ccx-autosend-fail-${schedule.id}`,
                  data: { url: "wallet/scheduled" },
                });
              }
            } finally {
              void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
              void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
              void queryClient.invalidateQueries({ queryKey: queryKeys.queuedTransactions });
            }
          } finally {
            inFlight.current.delete(schedule.id);
          }
        }
      } finally {
        ticking = false;
      }
    };

    // Cross-tab mutual exclusion: only the tab that wins the lock runs the tick.
    const tick = () => {
      if (typeof navigator !== "undefined" && navigator.locks) {
        return navigator.locks.request("ccx-auto-send", { ifAvailable: true }, async (lock) => {
          if (lock) await runTick();
        });
      }
      return runTick();
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
  }, [ready, activeWalletId, queryClient]);
}
