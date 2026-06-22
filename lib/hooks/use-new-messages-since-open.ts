"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useWalletSynced } from "@/lib/hooks/use-check-ins";
import { useQuery } from "@/lib/hooks/query-provider";
import { queryKeys } from "@/lib/hooks/query-keys";
import { countReceivedMessages } from "@/lib/messages/conversations";
import { services } from "@/lib/services";
import { messagesQueryOptions } from "@/lib/services/query-options";
import { useWalletSession } from "@/lib/session/wallet-session";
import {
  acknowledgeMessages,
  messageNavBadgeDelta,
  recordMessageCountAtSync,
} from "@/lib/ui/message-nav-badge";

function useMessages(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.messages,
    queryFn: () => services.messages.listMessages(),
    enabled,
    ...messagesQueryOptions,
  });
}

/** +N nav badge when received messages increase after the wallet is synced. */
export function useNewMessagesSinceOpen(): number {
  const isSynced = useWalletSynced();
  const messages = useMessages(isSynced);
  const pathname = usePathname();
  const count = countReceivedMessages(messages.data ?? []);

  useEffect(() => {
    if (!isSynced || messages.data === undefined) return;
    recordMessageCountAtSync(count);
  }, [isSynced, count, messages.data]);

  useEffect(() => {
    if (pathname === "/wallet/messages" && messages.data !== undefined) {
      acknowledgeMessages(count);
    }
  }, [pathname, count, messages.data]);

  if (!isSynced) return 0;
  return messageNavBadgeDelta(count);
}

export function useAcknowledgeMessagesSinceOpen(): () => void {
  const isSynced = useWalletSynced();
  const messages = useMessages(isSynced);
  return () => {
    if (messages.data !== undefined) {
      acknowledgeMessages(countReceivedMessages(messages.data));
    }
  };
}

/** Warm the message list for the nav badge only after sync — avoids scanning all txs during block scans. */
export function usePrefetchMessagesForBadge() {
  const { status } = useWalletSession();
  const isSynced = useWalletSynced();
  useMessages(status === "open" && isSynced);
}
