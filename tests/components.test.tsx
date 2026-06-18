import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "@/components/layout/sidebar";
import { CopyButton, FilterTabs, StatCard } from "@/components/wallet/common";
import { I18nProvider } from "@/lib/i18n/i18n-provider";
import { ThemeProvider } from "@/lib/ui/theme-provider";

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

  it("changes FilterTabs active item", () => {
    const onChange = vi.fn();
    render(<FilterTabs tabs={["All", "Sent"]} active="All" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Sent" }));
    expect(onChange).toHaveBeenCalledWith("Sent");
  });

  it("announces a successful copy to screen readers", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<CopyButton value="ccx7abc" label="Copy address" />);

    // The live region is present but silent until a copy succeeds.
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("");

    fireEvent.click(screen.getByRole("button", { name: "Copy address" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("ccx7abc"));
    await waitFor(() => expect(status).toHaveTextContent("Copied to clipboard"));
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
