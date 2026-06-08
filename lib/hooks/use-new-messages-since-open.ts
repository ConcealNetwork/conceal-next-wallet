"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@/lib/hooks/query-provider";
import { queryKeys } from "@/lib/hooks/query-keys";
import { countReceivedMessages } from "@/lib/messages/conversations";
import { services } from "@/lib/services";
import { useWalletSession } from "@/lib/session/wallet-session";
import {
  acknowledgeMessages,
  messageNavBadgeDelta,
  recordMessageCountAtSync,
} from "@/lib/ui/message-nav-badge";

function useWalletInfo() {
  const { status } = useWalletSession();
  return useQuery({
    queryKey: queryKeys.wallet,
    queryFn: () => services.wallet.getWalletInfo(),
    enabled: status === "open",
  });
}

function useMessages() {
  return useQuery({
    queryKey: queryKeys.messages,
    queryFn: () => services.messages.listMessages(),
  });
}

function useWalletSynced(): boolean {
  const wallet = useWalletInfo();
  const info = wallet.data;
  if (info === undefined || info.networkHeight <= 0) return false;
  return info.currentHeight >= info.networkHeight - 1;
}

/** +N nav badge when received messages increase after the wallet is synced. */
export function useNewMessagesSinceOpen(): number {
  const messages = useMessages();
  const pathname = usePathname();
  const isSynced = useWalletSynced();
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
  const messages = useMessages();
  return () => {
    if (messages.data !== undefined) {
      acknowledgeMessages(countReceivedMessages(messages.data));
    }
  };
}

export function usePrefetchMessagesForBadge() {
  useMessages();
  useWalletInfo();
}
