import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "@/components/layout/sidebar";
import { I18nProvider } from "@/lib/i18n/i18n-provider";
import { ThemeProvider } from "@/lib/ui/theme-provider";
import { AmountText, FilterTabs, StatCard, TransactionRow } from "@/components/wallet/common";
import { ccxAmount } from "@/lib/utils";

const push = vi.fn();
let pathname = "/wallet/account";
const closeSession = vi.fn();
const { disconnect } = vi.hoisted(() => ({
  disconnect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/session/wallet-session", () => ({
  useWalletSession: () => ({ closeSession }),
}));

vi.mock("@/lib/services", () => ({
  services: {
    wallet: {
      disconnect,
    },
  },
}));

describe("wallet components", () => {
  beforeEach(() => {
    pathname = "/wallet/account";
    closeSession.mockClear();
    disconnect.mockClear();
  });

  it("renders StatCard content", () => {
    // The CCX ticker renders in its own span (brand colour), so the amount
    // spans two nodes — assert on combined text content.
    const { container } = render(
      <StatCard label="Total Balance" value="1250.50 CCX" detail="Ready" />,
    );
    expect(screen.getByText("Total Balance")).toBeInTheDocument();
    expect(container).toHaveTextContent("1250.50 CCX");
  });

  it("colors AmountText by sign or transaction type", () => {
    render(
      <>
        <AmountText amount="+10 CCX" type="receive" />
        <AmountText amount="-5 CCX" type="send" />
        <AmountText amount="+2 CCX" type="deposit" />
      </>,
    );
    // The tone class lives on the amount wrapper; the ticker is a nested span,
    // so match on the number text node (getByText reads direct text only).
    expect(screen.getByText("+10", { exact: false })).toHaveClass("text-wallet-incoming");
    expect(screen.getByText("-5", { exact: false })).toHaveClass("text-wallet-outgoing");
    expect(screen.getByText("+2", { exact: false })).toHaveClass("text-wallet-deposit");
  });

  it("renders a transaction row", () => {
    render(
      <TransactionRow
        transaction={{
          id: "tx-test",
          hash: "8c3f6fbb51e79ff33f90bb1a41635e27f9d67a2acaa55fc5b5a968c9d42f011a",
          type: "receive",
          amount: ccxAmount(100),
          address: "ccx7abcdefghijklmnopqrstuvwxyz",
          timestamp: "2026-05-22T00:00:00.000Z",
          blockHeight: 1_971_325,
          confirmations: 12,
        }}
      />,
    );
    expect(screen.getByText("Receive")).toBeInTheDocument();
    expect(screen.getByText(/12 conf/)).toBeInTheDocument();
    expect(screen.getByText("+100.00", { exact: false })).toBeInTheDocument();
  });

  it("changes FilterTabs active item", () => {
    const onChange = vi.fn();
    render(<FilterTabs tabs={["All", "Sent"]} active="All" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Sent" }));
    expect(onChange).toHaveBeenCalledWith("Sent");
  });

  it("marks the active sidebar route and disconnects", async () => {
    pathname = "/wallet/send";
    // Sidebar reads the new-messages badge via useQuery, so it needs a client.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <ThemeProvider>
            <Sidebar />
          </ThemeProvider>
        </I18nProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("link", { name: /Send/ })).toHaveClass("bg-primary");
    fireEvent.click(screen.getByRole("button", { name: /Disconnect/ }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Disconnect" }),
    );
    await waitFor(() => {
      expect(disconnect).toHaveBeenCalled();
      expect(closeSession).toHaveBeenCalled();
    });
  });
});
