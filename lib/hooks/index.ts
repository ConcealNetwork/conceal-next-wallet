"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { services } from "@/lib/services"
import type { AddressEntryInput } from "@/lib/services/address-book.service"
import type { CreateDepositInput } from "@/lib/services/deposit.service"
import type { SendMessageInput } from "@/lib/services/message.service"
import type { SendTransactionInput } from "@/lib/services/transaction.service"
import type { WalletSettings } from "@/lib/types"

export const queryKeys = {
  wallet: ["wallet"] as const,
  transactions: ["transactions"] as const,
  market: ["market"] as const,
  messages: ["messages"] as const,
  deposits: ["deposits"] as const,
  addressBook: ["address-book"] as const,
  network: ["network"] as const,
  settings: ["settings"] as const,
}

export function useWalletInfo() {
  return useQuery({ queryKey: queryKeys.wallet, queryFn: () => services.wallet.getWalletInfo() })
}

export function useRefreshWallet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => services.wallet.refreshWallet(),
    onSuccess: (wallet) => queryClient.setQueryData(queryKeys.wallet, wallet),
  })
}

export function useTransactions() {
  return useQuery({
    queryKey: queryKeys.transactions,
    queryFn: () => services.transactions.listTransactions(),
  })
}

export function useSendTransaction() {
  return useMutation({ mutationFn: (input: SendTransactionInput) => services.transactions.sendTransaction(input) })
}

export function useMarketData() {
  return useQuery({ queryKey: queryKeys.market, queryFn: () => services.market.getMarketData() })
}

export function useMessages() {
  return useQuery({ queryKey: queryKeys.messages, queryFn: () => services.messages.listMessages() })
}

export function useSendMessage() {
  return useMutation({ mutationFn: (input: SendMessageInput) => services.messages.sendMessage(input) })
}

export function useDeposits() {
  return useQuery({ queryKey: queryKeys.deposits, queryFn: () => services.deposits.listDeposits() })
}

export function useCreateDeposit() {
  return useMutation({ mutationFn: (input: CreateDepositInput) => services.deposits.createDeposit(input) })
}

export function useAddressBook() {
  return useQuery({ queryKey: queryKeys.addressBook, queryFn: () => services.addressBook.listEntries() })
}

export function useCreateAddressEntry() {
  return useMutation({ mutationFn: (input: AddressEntryInput) => services.addressBook.createEntry(input) })
}

export function useNetworkStatus() {
  return useQuery({ queryKey: queryKeys.network, queryFn: () => services.network.getNodeStatus() })
}

export function useWalletSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: () => services.settings.getSettings() })
}

export function useUpdateWalletSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<WalletSettings>) => services.settings.updateSettings(input),
    onSuccess: (settings) => queryClient.setQueryData(queryKeys.settings, settings),
  })
}
