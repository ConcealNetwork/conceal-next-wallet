"use client";

import { useEffect } from "react";
import { createCoalescingThrottle } from "@/lib/hooks/coalescing-throttle";
import { useMutation, useQuery, useQueryClient } from "@/lib/hooks/query-provider";
import { env } from "@/lib/env";
import { services } from "@/lib/services";
import { fetchSmartNodes } from "@/lib/network/smart-nodes";
import {
  marketQueryOptions,
  messagesQueryOptions,
  networkQueryOptions,
  smartNodesQueryOptions,
} from "@/lib/services/query-options";
import type { AddressEntryInput } from "@/lib/services/address-book.service";
import type { CreateDepositInput, WithdrawDepositInput } from "@/lib/services/deposit.service";
import type { SendMessageInput } from "@/lib/services/message.service";
import type { SendTransactionInput } from "@/lib/services/transaction.service";
import type { Message, WalletInfo, WalletSettings } from "@/lib/types";
import { sortMessagesNewestFirst } from "@/lib/messages/conversations";
import { queryKeys } from "@/lib/hooks/query-keys";
import { useWalletSession } from "@/lib/session/wallet-session";

export { queryKeys };

export function useWalletInfo() {
  const { status, walletInfo } = useWalletSession();
  return useQuery({
    queryKey: queryKeys.wallet,
    queryFn: () => services.wallet.getWalletInfo(),
    enabled: status === "open",
    placeholderData: walletInfo ?? undefined,
  });
}

export function useRefreshWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => services.wallet.refreshWallet(),
    onSuccess: (wallet: WalletInfo) => {
      queryClient.setQueryData(queryKeys.wallet, wallet);
      void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
      // exact: don't prefix-match the curated smart-nodes pool (see useSmartNodes).
      void queryClient.invalidateQueries({ queryKey: queryKeys.network, exact: true });
    },
  });
}

/** Invalidate wallet/tx/network queries while blockchain sync updates the runtime wallet. */
export function useWalletLiveSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (env.useMockWallet) return;

    // Sync emits a 'modified' event per scanned block batch (the lastHeight
    // setter). Coalesce those bursts into ~2 invalidations/sec so the refetch +
    // balance recompute + re-render can't saturate the main thread — an
    // unthrottled invalidation here froze the page during long scans.
    const throttle = createCoalescingThrottle(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
      void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
      // exact: don't prefix-match the curated smart-nodes pool (see useSmartNodes).
      void queryClient.invalidateQueries({ queryKey: queryKeys.network, exact: true });
    }, 500);

    // Messages/deposits walk the full tx list — mark stale on sync but don't refetch ~2×/sec.
    const throttleHeavy = createCoalescingThrottle(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.deposits, refetchType: "none" });
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages, refetchType: "none" });
    }, 5000);

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    void import("@/lib/wallet-core/wallet-sync-notifier").then(({ subscribeWalletSync }) => {
      // The effect may have been cleaned up (StrictMode double-mount, or a fast
      // unmount) before this dynamic import resolved — don't subscribe a
      // listener that would then leak and keep firing invalidations post-unmount.
      if (cancelled) return;
      unsubscribe = subscribeWalletSync(() => {
        throttle.trigger();
        throttleHeavy.trigger();
      });
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      throttle.cancel();
      throttleHeavy.cancel();
    };
  }, [queryClient]);
}

export function useTransactions() {
  return useQuery({
    queryKey: queryKeys.transactions,
    queryFn: () => services.transactions.listTransactions(),
  });
}

export function useSendTransaction() {
  return useMutation({
    mutationFn: (input: SendTransactionInput) => services.transactions.sendTransaction(input),
  });
}

export function useMarketData() {
  return useQuery({
    queryKey: queryKeys.market,
    queryFn: () => services.market.getMarketData(),
    ...marketQueryOptions,
  });
}

export function useMessages() {
  return useQuery({
    queryKey: queryKeys.messages,
    queryFn: () => services.messages.listMessages(),
    ...messagesQueryOptions,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SendMessageInput) => services.messages.sendMessage(input),
    onSuccess: (sent) => {
      queryClient.setQueryData<Message[]>(queryKeys.messages, (current) => {
        const list = current ?? [];
        if (list.some((message) => message.id === sent.id)) return list;
        return sortMessagesNewestFirst([...list, sent]);
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages });
      void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
    },
  });
}

export function useMarkMessageRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => services.messages.markRead(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.messages });
      const previous = queryClient.getQueryData<Message[]>(queryKeys.messages);
      queryClient.setQueryData<Message[]>(queryKeys.messages, (current) =>
        (current ?? []).map((message) =>
          message.id === id ? { ...message, unread: false } : message,
        ),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.messages, context.previous);
      }
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Message[]>(queryKeys.messages, (current) =>
        (current ?? []).map((message) =>
          message.id === updated.id ? { ...message, unread: false } : message,
        ),
      );
    },
  });
}

export function useDeposits() {
  return useQuery({
    queryKey: queryKeys.deposits,
    queryFn: () => services.deposits.listDeposits(),
  });
}

export function useCreateDeposit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDepositInput) => services.deposits.createDeposit(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.deposits });
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
      void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
    },
  });
}

export function useWithdrawDeposit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WithdrawDepositInput) => services.deposits.withdrawDeposit(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.deposits });
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
      void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
    },
  });
}

export function useDepositConstraints() {
  return useQuery({
    queryKey: [...queryKeys.deposits, "constraints"] as const,
    queryFn: () => services.deposits.getDepositConstraints(),
  });
}

export function useDepositPreview(amount: number, durationMonths: number, enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.deposits, "preview", amount, durationMonths] as const,
    queryFn: () => services.deposits.previewCreateDeposit({ amount, durationMonths }),
    enabled: enabled && Number.isFinite(amount) && amount >= 1 && durationMonths >= 1,
    staleTime: 30_000,
  });
}

export function useAddressBook() {
  return useQuery({
    queryKey: queryKeys.addressBook,
    queryFn: () => services.addressBook.listEntries(),
  });
}

export function useCreateAddressEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddressEntryInput) => services.addressBook.createEntry(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.addressBook });
    },
  });
}

export function useUpdateAddressEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AddressEntryInput }) =>
      services.addressBook.updateEntry(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.addressBook });
    },
  });
}

export function useDeleteAddressEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => services.addressBook.deleteEntry(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.addressBook });
    },
  });
}

export function useNetworkStatus() {
  return useQuery({
    queryKey: queryKeys.network,
    queryFn: () => services.network.getNodeStatus(),
    ...networkQueryOptions,
  });
}

/** Smart-node pool list for the Network page only — one fetch per visit, no background refresh. */
export function useSmartNodes(activeNodeUrl: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.network, "smart-nodes", activeNodeUrl] as const,
    queryFn: () => {
      if (!activeNodeUrl) throw new Error("useSmartNodes requires an active node URL");
      return fetchSmartNodes(activeNodeUrl);
    },
    enabled: Boolean(activeNodeUrl),
    ...smartNodesQueryOptions,
  });
}

export function useWalletSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: () => services.settings.getSettings() });
}

export function useUpdateWalletSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<WalletSettings>) => services.settings.updateSettings(input),
    onSuccess: (settings: WalletSettings) => {
      queryClient.setQueryData(queryKeys.settings, settings);
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
      void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
      // exact: don't prefix-match the curated smart-nodes pool (see useSmartNodes).
      void queryClient.invalidateQueries({ queryKey: queryKeys.network, exact: true });
    },
  });
}

export function useOptimizeWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => services.settings.optimizeWallet(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
      void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
    },
  });
}

export function useResetAndRescan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => services.settings.resetAndRescan(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings });
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
      void queryClient.invalidateQueries({ queryKey: queryKeys.deposits });
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages });
      // exact: don't prefix-match the curated smart-nodes pool (see useSmartNodes).
      void queryClient.invalidateQueries({ queryKey: queryKeys.network, exact: true });
    },
  });
}
