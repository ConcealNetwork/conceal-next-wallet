"use client";

import { useEffect, useRef } from "react";
import { env } from "@/lib/env";
import { canNotify, notify } from "@/lib/notifications/notify";
import { detectWalletChanges, type WalletBaseline } from "@/lib/notifications/wallet-change-detect";
import { isWatchOtherWalletsEnabled } from "@/lib/notifications/watch-wallets";
import { services } from "@/lib/services";
import { useWalletSession } from "@/lib/session/wallet-session";
import { ccxToNumber, formatCcx, stripTickerSuffix } from "@/lib/utils";

/**
 * Background-watch the user's UNLOCKED non-active wallets (#108). While the wallet session
 * is open AND the "watch other wallets" opt-in is on, this polls
 * `services.wallet.syncSecondaryWallets()` on a slow timer (and on tab refocus), diffs the
 * result against a per-wallet baseline, and fires a notification when funds or a message
 * arrive on a wallet the user isn't currently viewing.
 *
 * Gating is two-layered, mirroring the existing reminder hooks: the SYNC runs whenever the
 * opt-in is on (so switching to a watched wallet is instant + current), but a NOTIFICATION
 * fires only when {@link canNotify} (OS permission granted). The first observation of a
 * wallet seeds the baseline silently — only positive changes are announced. Nothing is ever
 * sent; this is read-only sync + notify.
 *
 * Real mode only: mock mode has no background sync, and a stale opt-in flag must not drive
 * empty no-op polls. Re-entrancy is guarded (the 45s timer + a tab-refocus can otherwise
 * overlap), and notifications are re-checked against teardown right before they fire so a
 * lock mid-tick never surfaces a wallet label + amount after the user locked.
 */
const WATCH_POLL_MS = 45_000;

export function useSecondaryWalletWatch(): void {
  const { status } = useWalletSession();
  // Per-session baseline of each watched wallet's last-seen balance + message count. A ref
  // (not state) so a sync never triggers a re-render; lives for the mount's lifetime.
  const baselineRef = useRef<Map<string, WalletBaseline>>(new Map());

  useEffect(() => {
    if (status !== "open") return;
    if (env.useMockWallet) return; // no real background sync in mock mode
    let active = true;
    let ticking = false; // re-entrancy guard: timer + visibilitychange can overlap

    const tick = async () => {
      // Gate the whole loop on the opt-in: with it off, we never spin up secondary scans.
      if (ticking || !isWatchOtherWalletsEnabled()) return;
      ticking = true;
      try {
        let statuses: Awaited<ReturnType<typeof services.wallet.syncSecondaryWallets>>;
        try {
          statuses = await services.wallet.syncSecondaryWallets();
        } catch {
          return; // best-effort — a failed batch sync simply skips this tick
        }
        if (!active) return;

        const { notices, next } = detectWalletChanges(baselineRef.current, statuses);
        baselineRef.current = next;
        // Re-check teardown + permission immediately before announcing: a lock between the
        // sync and here must not fire a notification revealing a wallet after the user locked.
        if (!active || !canNotify()) return;

        for (const notice of notices) {
          const label = notice.label || "another wallet";
          if (notice.kind === "funds") {
            const amount = stripTickerSuffix(
              formatCcx(ccxToNumber({ atomic: notice.deltaAtomic ?? 0 })),
            );
            void notify(`Received ${amount} CCX in ${label}`, {
              body: `Funds arrived in your “${label}” wallet.`,
              tag: `ccx-wallet-funds-${notice.id}`,
              data: { url: "wallet" },
            });
          } else {
            void notify(`New message in ${label}`, {
              body: `A message arrived in your “${label}” wallet.`,
              tag: `ccx-wallet-message-${notice.id}`,
              data: { url: "wallet/messages" },
            });
          }
        }
      } finally {
        ticking = false;
      }
    };

    void tick();
    const timer = setInterval(() => void tick(), WATCH_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status]);
}
