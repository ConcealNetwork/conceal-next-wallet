"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { env } from "@/lib/env";
import { services } from "@/lib/services";
import { marketQueryOptions, networkQueryOptions } from "@/lib/services/query-options";
import type { AddressEntryInput } from "@/lib/services/address-book.service";
import type { CreateDepositInput, WithdrawDepositInput } from "@/lib/services/deposit.service";
import type { SendMessageInput } from "@/lib/services/message.service";
import type { SendTransactionInput } from "@/lib/services/transaction.service";
import type { WalletSettings } from "@/lib/types";

export const queryKeys = {
  wallet: ["wallet"] as const,
  transactions: ["transactions"] as const,
  market: ["market"] as const,
  messages: ["messages"] as const,
  deposits: ["deposits"] as const,
  addressBook: ["address-book"] as const,
  network: ["network"] as const,
  settings: ["settings"] as const,
};

export function useWalletInfo() {
  return useQuery({ queryKey: queryKeys.wallet, queryFn: () => services.wallet.getWalletInfo() });
}

export function useRefreshWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => services.wallet.refreshWallet(),
    onSuccess: (wallet) => {
      queryClient.setQueryData(queryKeys.wallet, wallet);
      void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
      void queryClient.invalidateQueries({ queryKey: queryKeys.network });
    },
  });
}

/** Invalidate wallet/tx/network queries while blockchain sync updates the runtime wallet. */
export function useWalletLiveSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (env.useMockWallet) return;

    let unsubscribe: (() => void) | undefined;

    void import("@/lib/wallet-core/wallet-sync-notifier").then(({ subscribeWalletSync }) => {
      unsubscribe = subscribeWalletSync(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
        void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
        void queryClient.invalidateQueries({ queryKey: queryKeys.deposits });
        void queryClient.invalidateQueries({ queryKey: queryKeys.network });
      });
    });

    return () => unsubscribe?.();
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
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SendMessageInput) => services.messages.sendMessage(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages });
      void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
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
  return useMutation({
    mutationFn: (input: AddressEntryInput) => services.addressBook.createEntry(input),
  });
}

export function useNetworkStatus() {
  return useQuery({
    queryKey: queryKeys.network,
    queryFn: () => services.network.getNodeStatus(),
    ...networkQueryOptions,
  });
}

export function useWalletSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: () => services.settings.getSettings() });
}

export function useUpdateWalletSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<WalletSettings>) => services.settings.updateSettings(input),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.settings, settings);
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
      void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
      void queryClient.invalidateQueries({ queryKey: queryKeys.network });
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
      void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
      void queryClient.invalidateQueries({ queryKey: queryKeys.network });
    },
  });
}
