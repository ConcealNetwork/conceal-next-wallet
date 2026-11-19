// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCreateDeposit, useOptimizeWallet, useWithdrawDeposit } from "@/lib/hooks";
import { queryKeys } from "@/lib/hooks/query-keys";
import { services } from "@/lib/services";
import type { Deposit, OptimizeWalletResult, Transaction } from "@/lib/types";

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const refreshedQueue = () =>
    invalidate.mock.calls.some(
      ([filters]) =>
        JSON.stringify(filters?.queryKey) === JSON.stringify(queryKeys.queuedTransactions),
    );
  return { wrapper, refreshedQueue };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("spend hooks refresh the outbound queue card", () => {
  it("after a deposit is created or parked", async () => {
    vi.spyOn(services.deposits, "createDeposit").mockResolvedValue({ queued: "auto" } as Deposit);
    const { wrapper, refreshedQueue } = setup();
    const { result } = renderHook(() => useCreateDeposit(), { wrapper });

    await act(() => result.current.mutateAsync({ amount: 1, durationMonths: 1 }));

    expect(refreshedQueue()).toBe(true);
  });

  it("after a withdrawal is sent or parked", async () => {
    vi.spyOn(services.deposits, "withdrawDeposit").mockResolvedValue({
      queued: "hung",
    } as Transaction);
    const { wrapper, refreshedQueue } = setup();
    const { result } = renderHook(() => useWithdrawDeposit(), { wrapper });

    await act(() => result.current.mutateAsync({ txHash: "h", globalOutputIndex: 0 }));

    expect(refreshedQueue()).toBe(true);
  });

  it("after an optimize is sent or parked", async () => {
    vi.spyOn(services.settings, "optimizeWallet").mockResolvedValue({
      queued: "auto",
    } as OptimizeWalletResult);
    const { wrapper, refreshedQueue } = setup();
    const { result } = renderHook(() => useOptimizeWallet(), { wrapper });

    await act(() => result.current.mutateAsync());

    expect(refreshedQueue()).toBe(true);
  });
});
