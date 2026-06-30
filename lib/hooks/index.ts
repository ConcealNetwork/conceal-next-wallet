"use client";

import { useEffect, useRef } from "react";
import { env } from "@/lib/env";
import { queryKeys } from "@/lib/hooks/query-keys";
import { useMutation, useQuery, useQueryClient } from "@/lib/hooks/query-provider";
import { sortMessagesNewestFirst } from "@/lib/messages/conversations";
import { fetchSmartNodes } from "@/lib/network/smart-nodes";
import { services } from "@/lib/services";
import type { AddressEntryInput } from "@/lib/services/address-book.service";
import type { CreateDepositInput, WithdrawDepositInput } from "@/lib/services/deposit.service";
import type { SendMessageInput } from "@/lib/services/message.service";
import {
  marketQueryOptions,
  messagesQueryOptions,
  networkQueryOptions,
  optimizationStatusQueryOptions,
  smartNodesQueryOptions,
} from "@/lib/services/query-options";
import type { SendTransactionInput } from "@/lib/services/transaction.service";
import { useWalletSession } from "@/lib/session/wallet-session";
import type { Message, WalletInfo, WalletSettings, WalletSummary } from "@/lib/types";
import { isWalletSyncing, walletSyncPercent } from "@/lib/ui/wallet-sync";

export { queryKeys };

// Live-refresh cadence (#112). Under the SDK engine nothing pushes a sync event to the
// query cache and `getWalletInfo` only syncs on demand, so an open page never reflected
// freshly-mined data (deposits, incoming tx, messages) until the user navigated,
// refocused, mutated, or switched wallets. Fix: poll only the CHEAP wallet query (which
// drives the on-demand sync and observes the chain tip) — fast while catching up, slow
// once synced — and invalidate the history-derived lists only when the scanned height
// actually advances (see `useWalletLiveSync`). Never poll the heavy lists on a blind
// timer: deposits/messages walk the full tx history, so a 14k-tx wallet would re-map
// every few seconds for nothing. Disabled in mock mode. `[whileSyncing, whenSynced]` ms.
const WALLET_POLL = [2500, 20000] as const;

/** Refetch cadence given the wallet's sync state: faster mid-scan, slower when synced. */
export function syncAwareInterval(
  info: WalletInfo | undefined,
  intervals: readonly [number, number],
): number {
  return isWalletSyncing(info) ? intervals[0] : intervals[1];
}

/**
 * Stable `refetchInterval` for the wallet query (a module-level reference, so a parent
 * re-render can't churn the polling timer). Polls while the wallet is open; `false` in
 * mock mode (no real chain to sync). Background polling is paused separately (#67).
 */
function walletPollInterval(query: { state: { data: WalletInfo | undefined } }): number | false {
  return env.useMockWallet ? false : syncAwareInterval(query.state.data, WALLET_POLL);
}

export function useWalletInfo() {
  const { status, walletInfo } = useWalletSession();
  return useQuery({
    queryKey: queryKeys.wallet,
    queryFn: () => services.wallet.getWalletInfo(),
    enabled: status === "open",
    placeholderData: walletInfo ?? undefined,
    // Poll so balance, sync banner, and newly-mined state stay live (#112). Pause when
    // the tab is hidden — background sync + notifications are tracked separately (#67).
    refetchInterval: walletPollInterval,
    refetchIntervalInBackground: false,
  });
}

export function useWalletSyncStatus() {
  const wallet = useWalletInfo();
  const info = wallet.data;
  return {
    info,
    isSyncing: isWalletSyncing(info),
    syncPct: walletSyncPercent(info),
  };
}

/** True when the open wallet is watch-only (no spend key) — drives view-only UI. */
export function useWalletViewOnly(): boolean {
  return useWalletInfo().data?.viewOnly ?? false;
}

// --- multi-wallet (#95) ----------------------------------------------------

/** The wallets registered on this device, with the active one flagged. */
export function useWallets() {
  const { status } = useWalletSession();
  return useQuery({
    queryKey: queryKeys.wallets,
    queryFn: () => services.wallet.listWallets(),
    enabled: status === "open",
  });
}

/** Rename a wallet (label only) and refresh the list. */
export function useRenameWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      services.wallet.renameWallet(id, label),
    onSuccess: (_result, { id, label }) => {
      queryClient.setQueryData<WalletSummary[]>(queryKeys.wallets, (current) =>
        (current ?? []).map((wallet) => (wallet.id === id ? { ...wallet, label } : wallet)),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallets });
    },
  });
}

/** Delete a wallet by id (erases its keyspace) and refresh the list. */
export function useDeleteWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => services.wallet.deleteWallet(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallets });
    },
  });
}

export function useRefreshWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => services.wallet.refreshWallet(),
    onSuccess: (wallet: WalletInfo) => {
      queryClient.setQueryData(queryKeys.wallet, wallet);
      void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
    },
  });
}

/** Invalidate wallet/tx/network queries while blockchain sync updates the runtime wallet. */
export function useWalletLiveSync() {
  const queryClient = useQueryClient();

  // Engine-agnostic open-page refresh (#112): when the scanned height advances (a block
  // scanned in), refetch the history-derived lists so a freshly-mined deposit / incoming
  // tx / message appears without a manual refresh. Driven off the polled wallet height
  // (useWalletInfo, WALLET_POLL) — NOT a blind list timer — so the heavy lists re-map
  // only when something actually changed. The poll cadence (≥2.5s) self-throttles this:
  // `liveHeight` can't change faster than the wallet query refetches, so there's no
  // burst to coalesce and no risk of a 14k-tx re-walk storm. The SDK engine's runtime
  // emits no sync events, so this polled-height watch is what keeps the lists live.
  const liveHeight = useWalletInfo().data?.currentHeight;
  const lastHeightRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (liveHeight === undefined) return;
    const previous = lastHeightRef.current;
    lastHeightRef.current = liveHeight;
    if (previous === undefined || liveHeight <= previous) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
    void queryClient.invalidateQueries({ queryKey: queryKeys.deposits });
    void queryClient.invalidateQueries({ queryKey: queryKeys.messages });
    void queryClient.invalidateQueries({ queryKey: queryKeys.optimizationStatus });
  }, [liveHeight, queryClient]);
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

/** Durable outbound queue (#92). Polls so retry/mine transitions surface without a refresh. */
export function useQueuedTransactions() {
  return useQuery({
    queryKey: queryKeys.queuedTransactions,
    queryFn: () => services.transactions.listQueuedTransactions(),
    refetchInterval: 8000,
  });
}

export function useCancelQueuedTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => services.transactions.cancelQueuedTransaction(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.queuedTransactions });
      // Cancelling a pending entry frees its reserved inputs + clears its optimistic row.
      void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
    },
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.addressBook });
    },
  });
}

export function useFillOutboundPid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { recipientAddress: string; paymentId: string }) =>
      services.addressBook.fillOutboundPid(input.recipientAddress, input.paymentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.addressBook });
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
  const { status } = useWalletSession();
  return useQuery({
    queryKey: queryKeys.network,
    queryFn: () => services.network.getNodeStatus(),
    enabled: status === "open",
    ...networkQueryOptions,
  });
}

/**
 * Smart-node pool list (Network page + Settings node selector) — one fetch per visit, no
 * background refresh. The query key carries `activeNodeUrl` only to re-stamp `isActive`, so
 * keep the previous list as placeholder across a node switch — otherwise the consumer (the
 * node selector) would briefly see `undefined` and the card would flash out then back in.
 */
export function useSmartNodes(activeNodeUrl: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.network, "smart-nodes", activeNodeUrl] as const,
    queryFn: () => {
      if (!activeNodeUrl) throw new Error("useSmartNodes requires an active node URL");
      return fetchSmartNodes(activeNodeUrl);
    },
    enabled: Boolean(activeNodeUrl),
    placeholderData: (previous) => previous,
    ...smartNodesQueryOptions,
  });
}

export function useWalletSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: () => services.settings.getSettings() });
}

export function useOptimizationStatus() {
  const { status } = useWalletSession();
  return useQuery({
    queryKey: queryKeys.optimizationStatus,
    queryFn: () => services.settings.getOptimizationStatus(),
    enabled: status === "open",
    ...optimizationStatusQueryOptions,
  });
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.optimizationStatus });
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
