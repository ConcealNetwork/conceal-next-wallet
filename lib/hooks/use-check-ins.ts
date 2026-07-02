"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAddressBook, useMessages, useWalletInfo } from "@/lib/hooks";
import { usePulseDismissed } from "@/lib/hooks/use-pulse-dismissed";
import { buildPulseRows, countRedPulses } from "@/lib/messages/pulse-rows";
import { canNotify, isOptedIn, notify, selectNewKeys } from "@/lib/notifications/notify";
import { toast } from "@/lib/ui/toast";

/**
 * True once the wallet has caught up to the network tip.
 */
export function useWalletSynced(): boolean {
  const info = useWalletInfo().data;
  if (info === undefined || info.networkHeight <= 0) return false;
  return info.currentHeight >= info.networkHeight - 1;
}

/** Red-phase received pulses — sidebar badge. */
export function useOverdueCheckInCount(): number {
  const synced = useWalletSynced();
  const messages = useMessages();
  const addressBook = useAddressBook();
  const [dismissed] = usePulseDismissed();
  if (!synced || messages.data === undefined) return 0;
  const rows = buildPulseRows(messages.data, addressBook.data ?? [], dismissed, Date.now());
  return countRedPulses(rows);
}

/** Toast when a contact's pulse enters the overdue (post-grace) phase. */
export function useCheckInAlerts(): void {
  const synced = useWalletSynced();
  const messages = useMessages();
  const addressBook = useAddressBook();
  const ready = synced && messages.data !== undefined;
  const announcedRef = useRef<Set<string>>(new Set());
  const [dismissed] = usePulseDismissed();

  const evaluate = useCallback(() => {
    const data = messages.data ?? [];
    const rows = buildPulseRows(data, addressBook.data ?? [], dismissed, Date.now());
    const overdue = rows.filter((row) => row.phase === "overdue");
    const fresh = selectNewKeys(
      overdue.map((row) => row.messageId),
      announcedRef.current,
    );
    if (fresh.length === 0) return;
    for (const key of fresh) announcedRef.current.add(key);
    toast.warning(
      `${fresh.length} pulse${fresh.length === 1 ? "" : "s"} past grace — you may want to reach out.`,
    );
    if (isOptedIn() && canNotify()) {
      void notify("Pulse overdue", {
        body: `${fresh.length} contact${fresh.length === 1 ? "" : "s"} past their pulse grace window.`,
        tag: "ccx-pulse",
        data: { url: "wallet/check-ins" },
      });
    }
  }, [messages.data, addressBook.data, dismissed]);

  useEffect(() => {
    if (!ready) return;
    evaluate();
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") evaluate();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [ready, evaluate]);
}
