// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWalletLiveSync } from "@/lib/hooks";
import { queryKeys } from "@/lib/hooks/query-keys";
import { services } from "@/lib/services";
import type { WalletInfo } from "@/lib/types";

vi.mock("@/lib/session/wallet-session", () => ({
  useWalletSession: () => ({ status: "open", walletInfo: undefined }),
}));

const ccx = (atomic: number) => ({ atomic });

function info(overrides: Partial<WalletInfo> = {}): WalletInfo {
  return {
    address: "ccx7test",
    viewOnly: false,
    balanceTotal: ccx(100),
    available: ccx(100),
    dust: ccx(0),
    pending: ccx(0),
    incomingPending: ccx(0),
    lockedDeposits: ccx(0),
    withdrawable: ccx(0),
    creationHeight: 1,
    currentHeight: 500,
    networkHeight: 500,
    ...overrides,
  };
}

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const refreshedTxs = () =>
    invalidate.mock.calls.some(
      ([filters]) => JSON.stringify(filters?.queryKey) === JSON.stringify(queryKeys.transactions),
    );
  const poll = () => act(() => queryClient.refetchQueries({ queryKey: queryKeys.wallet }));
  return { wrapper, refreshedTxs, poll, queryClient };
}

async function pollOnce(next: WalletInfo) {
  const getInfo = vi
    .spyOn(services.wallet, "getWalletInfo")
    .mockResolvedValueOnce(info())
    .mockResolvedValue(next);
  const { wrapper, refreshedTxs, poll, queryClient } = setup();
  renderHook(() => useWalletLiveSync(), { wrapper });
  await waitFor(() => expect(queryClient.getQueryData(queryKeys.wallet)).toBeDefined());
  expect(refreshedTxs()).toBe(false);
  await poll();
  await waitFor(() => expect(getInfo).toHaveBeenCalledTimes(2));
  return refreshedTxs;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("open pages refresh when the wallet changes", () => {
  it("refreshes the lists when the scanned height advances", async () => {
    const refreshedTxs = await pollOnce(info({ currentHeight: 501 }));
    await waitFor(() => expect(refreshedTxs()).toBe(true));
  });

  it("refreshes the lists when a mempool payment arrives at the same height", async () => {
    const refreshedTxs = await pollOnce(info({ incomingPending: ccx(5) }));
    await waitFor(() => expect(refreshedTxs()).toBe(true));
  });

  it("refreshes the lists when a send is relayed at the same height", async () => {
    const refreshedTxs = await pollOnce(info({ available: ccx(40), pending: ccx(60) }));
    await waitFor(() => expect(refreshedTxs()).toBe(true));
  });

  it("does not refresh when nothing changed", async () => {
    const refreshedTxs = await pollOnce(info());
    expect(refreshedTxs()).toBe(false);
  });
});
