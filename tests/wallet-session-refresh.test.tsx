import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/hooks/query-keys";
import { useWalletSession, WalletSessionProvider } from "@/lib/session/wallet-session";
import type { WalletInfo } from "@/lib/types";

type SessionApi = ReturnType<typeof useWalletSession>;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/auth/active-wallet-id", () => ({
  getActiveWalletId: () => Promise.resolve("default"),
}));

vi.mock("@/lib/auth/biometric-store", () => ({
  getPasskeyEnrollment: () => null,
  clearPasskeyEnrollment: vi.fn(),
}));

vi.mock("@/lib/hooks/use-storage-health", () => ({
  requestPersistentStorage: () => Promise.resolve(false),
}));

vi.mock("@/lib/env", () => ({
  env: { persistWalletSession: false, useMockWallet: true },
}));

function wallet(address: string): WalletInfo {
  return {
    address,
    viewOnly: false,
    balanceTotal: { atomic: 0 },
    available: { atomic: 0 },
    dust: { atomic: 0 },
    pending: { atomic: 0 },
    lockedDeposits: { atomic: 0 },
    withdrawable: { atomic: 0 },
    creationHeight: 0,
    currentHeight: 0,
    networkHeight: 0,
  };
}

function Probe({ onReady }: { onReady: (api: SessionApi) => void }) {
  const session = useWalletSession();
  onReady(session);
  return null;
}

describe("openSession in-place unlock refresh", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it("cancels in-flight queries and invalidates the full cache after open", async () => {
    const cancelQueries = vi.spyOn(queryClient, "cancelQueries");
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    queryClient.setQueryData(queryKeys.wallet, wallet("ccx7old"));
    queryClient.setQueryData(queryKeys.transactions, [{ hash: "old-tx" }]);

    let api: SessionApi | undefined;
    render(
      <QueryClientProvider client={queryClient}>
        <WalletSessionProvider>
          <Probe
            onReady={(session) => {
              api = session;
            }}
          />
        </WalletSessionProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(api).toBeDefined());
    const next = wallet("ccx7new");
    api?.openSession(next);

    await waitFor(() => {
      expect(api?.walletInfo?.address).toBe("ccx7new");
      expect(queryClient.getQueryData(queryKeys.wallet)).toEqual(next);
    });
    expect(cancelQueries).toHaveBeenCalled();
    expect(invalidateQueries).toHaveBeenCalledWith();
  });
});
