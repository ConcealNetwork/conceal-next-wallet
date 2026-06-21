import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #111 regression: a React #185 (Maximum update depth) was seen in real mode around the
 * deposit-create → account transition. This renders the REAL AccountPage under simulated
 * real-mode polling (currentHeight climbing each poll while networkHeight stays ahead, so
 * the wallet is "syncing" and the balance cards/banner re-render), plus the shell's
 * useWalletLiveSync (which invalidates the history lists as the height advances). If any
 * component re-renders in a cycle, React logs #185 to console.error — we assert it doesn't.
 */

// Real-mode behaviour: the wallet poll is only active when NOT mock.
vi.mock("@/lib/env", async (orig) => {
  const actual = (await orig()) as { env: Record<string, unknown> };
  return { env: { ...actual.env, useMockWallet: false } };
});
vi.mock("@/lib/session/wallet-session", () => ({
  useWalletSession: () => ({ status: "open", walletInfo: undefined }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/wallet/deposits",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

let heightCalls = 0;
const ccx = (n: number) => ({ atomic: Math.round(n * 1e6) });
function walletInfo() {
  // currentHeight climbs each poll; networkHeight stays ahead → isSyncing true.
  heightCalls += 1;
  return {
    address: "ccx7test",
    viewOnly: false,
    balanceTotal: ccx(100 + heightCalls),
    available: ccx(60 + heightCalls),
    dust: ccx(0),
    pending: ccx(0),
    incomingPending: ccx(0),
    lockedDeposits: ccx(40),
    withdrawable: ccx(0),
    currentHeight: 1000 + heightCalls,
    networkHeight: 2000,
  };
}
const market = {
  price: { value: 0.05 },
  change24hPct: 1.2,
  marketCap: 1,
  volume24h: 1,
  high24h: 1,
  low24h: 1,
  history: Array.from({ length: 12 }, (_, i) => ({ price: 0.05 + i * 0.001 })),
};
const deposit = {
  id: "d1",
  txHash: "h1",
  globalOutputIndex: 0,
  amount: ccx(40),
  status: "active" as const,
  durationMonths: 3,
  apr: 6,
  interest: ccx(1),
  unlocksInDays: 29,
  progressPct: 10,
  address: "ccx7test",
};
const tx = {
  id: "t1",
  hash: "h1",
  type: "deposit" as const,
  amount: ccx(40),
  address: "ccx7test",
  timestamp: "2026-06-20T00:00:00.000Z",
  blockHeight: 1000,
  confirmations: 5,
};

vi.mock("@/lib/services", () => ({
  services: {
    wallet: {
      getWalletInfo: () => Promise.resolve(walletInfo()),
      refreshWallet: () => Promise.resolve(walletInfo()),
      listWallets: () => Promise.resolve([{ id: "default", label: "Wallet", isActive: true }]),
    },
    transactions: { listTransactions: () => Promise.resolve([tx]) },
    market: { getMarketData: () => Promise.resolve(market) },
    deposits: {
      listDeposits: () => Promise.resolve([deposit]),
      getDepositConstraints: () =>
        Promise.resolve({
          maxDepositAmount: 50,
          isDepositDisabled: false,
          isWalletSyncing: true,
          hasPendingDeposit: false,
        }),
    },
    network: { getNetworkStatus: () => Promise.resolve({}) },
  },
}));

import AccountPage from "@/app/(wallet)/wallet/account/page";
import DepositsPageClient from "@/app/(wallet)/wallet/deposits/deposits-page-client";
import { RightRailProvider } from "@/components/layout/right-rail";
import { useWalletLiveSync } from "@/lib/hooks";
import { I18nProvider } from "@/lib/i18n/i18n-provider";

function Harness({ children }: { children: React.ReactNode }) {
  useWalletLiveSync(); // shell behaviour: invalidate lists as scanned height advances
  return <>{children}</>;
}

function renderUnderSync(node: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <RightRailProvider>
          <Harness>{node}</Harness>
        </RightRailProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

async function pumpPolls() {
  // Advance through several wallet-poll cycles (2.5s each while syncing), flushing refetch
  // microtasks so currentHeight climbs and useWalletLiveSync invalidates the lists.
  for (let i = 0; i < 6; i += 1) await vi.advanceTimersByTimeAsync(2600);
}

function loopError(errorSpy: ReturnType<typeof vi.spyOn>) {
  return errorSpy.mock.calls.find((args: unknown[]) =>
    String(args[0]).match(/Maximum update depth|#185/),
  );
}

describe("#111 — account render loop under real-mode sync", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.useFakeTimers();
    heightCalls = 0;
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    errorSpy.mockRestore();
    vi.useRealTimers();
  });

  it("account page: no Maximum update depth across several sync polls", async () => {
    renderUnderSync(<AccountPage />);
    await pumpPolls();
    const err = loopError(errorSpy);
    expect(err, `render loop: ${String(err?.[0])}`).toBeUndefined();
  });

  it("deposits page: no Maximum update depth across several sync polls", async () => {
    renderUnderSync(<DepositsPageClient />);
    await pumpPolls();
    const err = loopError(errorSpy);
    expect(err, `render loop: ${String(err?.[0])}`).toBeUndefined();
  });
});
