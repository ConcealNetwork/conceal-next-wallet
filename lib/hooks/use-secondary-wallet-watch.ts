"use client";

import { useEffect, useRef } from "react";
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
 */
const WATCH_POLL_MS = 45_000;

export function useSecondaryWalletWatch(): void {
  const { status } = useWalletSession();
  // Per-session baseline of each watched wallet's last-seen balance + message count. A ref
  // (not state) so a sync never triggers a re-render; lives for the mount's lifetime.
  const baselineRef = useRef<Map<string, WalletBaseline>>(new Map());

  useEffect(() => {
    if (status !== "open") return;
    let active = true;

    const tick = async () => {
      // Gate the whole loop on the opt-in: with it off, we never spin up secondary scans.
      if (!isWatchOtherWalletsEnabled()) return;
      let statuses: Awaited<ReturnType<typeof services.wallet.syncSecondaryWallets>>;
      try {
        statuses = await services.wallet.syncSecondaryWallets();
      } catch {
        return; // best-effort — a failed batch sync simply skips this tick
      }
      if (!active) return;

      const { notices, next } = detectWalletChanges(baselineRef.current, statuses);
      baselineRef.current = next;
      if (!canNotify()) return; // synced + baseline updated; just don't announce

      for (const notice of notices) {
        if (notice.kind === "funds") {
          const amount = stripTickerSuffix(
            formatCcx(ccxToNumber({ atomic: notice.deltaAtomic ?? 0 })),
          );
          void notify(`Received ${amount} CCX in ${notice.label}`, {
            body: `Funds arrived in your “${notice.label}” wallet.`,
            tag: `ccx-wallet-funds-${notice.id}`,
            data: { url: "wallet" },
          });
        } else {
          void notify(`New message in ${notice.label}`, {
            body: `A message arrived in your “${notice.label}” wallet.`,
            tag: `ccx-wallet-message-${notice.id}`,
            data: { url: "wallet/messages" },
          });
        }
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
