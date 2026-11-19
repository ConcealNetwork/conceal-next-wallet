// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useQueuedTransactions } from "@/lib/hooks";
import { queryKeys } from "@/lib/hooks/query-keys";
import { services } from "@/lib/services";
import type { QueuedTransaction } from "@/lib/types";

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const refreshed = (key: readonly string[]) =>
    invalidate.mock.calls.some(
      ([filters]) => JSON.stringify(filters?.queryKey) === JSON.stringify(key),
    );
  return { wrapper, refreshed };
}

const row = { id: "intent-1" } as QueuedTransaction;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("queue rows changing refreshes balances and lists", () => {
  it("refreshes deposits, transactions, wallet and optimize status when a row leaves", async () => {
    const list = vi
      .spyOn(services.transactions, "listQueuedTransactions")
      .mockResolvedValueOnce([row])
      .mockResolvedValue([]);
    const { wrapper, refreshed } = setup();
    const { result } = renderHook(() => useQueuedTransactions(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([row]));
    expect(refreshed(queryKeys.deposits)).toBe(false);

    await act(() => result.current.refetch());

    await waitFor(() => expect(refreshed(queryKeys.deposits)).toBe(true));
    expect(refreshed(queryKeys.transactions)).toBe(true);
    expect(refreshed(queryKeys.wallet)).toBe(true);
    expect(refreshed(queryKeys.optimizationStatus)).toBe(true);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("refreshes when a hung row is marked sent", async () => {
    vi.spyOn(services.transactions, "listQueuedTransactions")
      .mockResolvedValueOnce([{ ...row, state: "hung" }])
      .mockResolvedValue([{ ...row, state: "sent" }]);
    const { wrapper, refreshed } = setup();
    const { result } = renderHook(() => useQueuedTransactions(), { wrapper });
    await waitFor(() => expect(result.current.data?.[0]?.state).toBe("hung"));

    await act(() => result.current.refetch());

    await waitFor(() => expect(refreshed(queryKeys.deposits)).toBe(true));
  });

  it("does not refresh when the rows stay the same", async () => {
    vi.spyOn(services.transactions, "listQueuedTransactions").mockResolvedValue([row]);
    const { wrapper, refreshed } = setup();
    const { result } = renderHook(() => useQueuedTransactions(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([row]));

    await act(() => result.current.refetch());

    expect(refreshed(queryKeys.deposits)).toBe(false);
  });
});
