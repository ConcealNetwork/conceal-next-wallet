"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { queryKeys } from "@/lib/hooks/query-keys";
import { useQuery } from "@/lib/hooks/query-provider";
import { useWalletSynced } from "@/lib/hooks/use-check-ins";
import { countReceivedMessages } from "@/lib/messages/conversations";
import { countReceivedPulses } from "@/lib/messages/pulse-rows";
import { services } from "@/lib/services";
import { messagesQueryOptions } from "@/lib/services/query-options";
import { useWalletSession } from "@/lib/session/wallet-session";
import type { Message } from "@/lib/types";
import { messageNavBadge, type NavBadgeStore, pulseNavBadge } from "@/lib/ui/nav-badge-store";

function useMessagesList(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.messages,
    queryFn: () => services.messages.listMessages(),
    enabled,
    ...messagesQueryOptions,
  });
}

type SinceOpenConfig = {
  store: NavBadgeStore;
  pagePath: string;
  count: (messages: readonly Message[]) => number;
};

function useNewSinceOpen({ store, pagePath, count }: SinceOpenConfig): number {
  const isSynced = useWalletSynced();
  const messages = useMessagesList(isSynced);
  const pathname = usePathname();
  const total = count(messages.data ?? []);

  useEffect(() => {
    if (!isSynced || messages.data === undefined) return;
    store.recordAtSync(total);
  }, [isSynced, total, messages.data, store]);

  useEffect(() => {
    if (pathname === pagePath && messages.data !== undefined) {
      store.acknowledge(total);
    }
  }, [pathname, pagePath, total, messages.data, store]);

  if (!isSynced) return 0;
  return store.delta(total);
}

function useAckSinceOpen(config: Pick<SinceOpenConfig, "store" | "count">): () => void {
  const isSynced = useWalletSynced();
  const messages = useMessagesList(isSynced);
  const { store, count } = config;
  return () => {
    if (messages.data !== undefined) {
      store.acknowledge(count(messages.data));
    }
  };
}

/** +N nav badge when received messages increase after the wallet is synced. */
export function useNewMessagesSinceOpen(): number {
  return useNewSinceOpen({
    store: messageNavBadge,
    pagePath: "/wallet/messages",
    count: countReceivedMessages,
  });
}

export function useAcknowledgeMessagesSinceOpen(): () => void {
  return useAckSinceOpen({ store: messageNavBadge, count: countReceivedMessages });
}

/** +N nav badge when received status pulses increase after the wallet is synced. */
export function useNewPulsesSinceOpen(): number {
  return useNewSinceOpen({
    store: pulseNavBadge,
    pagePath: "/wallet/check-ins",
    count: countReceivedPulses,
  });
}

export function useAcknowledgePulsesSinceOpen(): () => void {
  return useAckSinceOpen({ store: pulseNavBadge, count: countReceivedPulses });
}

/** Warm the message list for nav badges only after sync. */
export function usePrefetchMessagesForBadge() {
  const { status } = useWalletSession();
  const isSynced = useWalletSynced();
  useMessagesList(status === "open" && isSynced);
}
