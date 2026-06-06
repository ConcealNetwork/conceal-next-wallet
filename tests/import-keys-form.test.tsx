import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture what the form hands to the engine, and stub the session redirect.
const importWallet = vi.fn();
const openSession = vi.fn();

vi.mock("@/lib/services", () => ({
  services: {
    wallet: {
      importWallet: (input: unknown) => importWallet(input),
      previewKeys: () =>
        Promise.resolve({ address: "ccx7sampleADDR", viewKey: "deadbeefviewkey" }),
    },
    network: { getNodeStatus: () => Promise.resolve({ networkHeight: 2_000_000 }) },
  },
}));
vi.mock("@/lib/session/wallet-session", () => ({
  useWalletSession: () => ({ openSession }),
}));

import { ImportKeysForm } from "@/app/(onboarding)/onboarding-actions";
import { walletCopy } from "@/lib/ui/wallet-copy";

const HEX64 = "a".repeat(64);
const PASSWORD = "ConcealTest1!";

const clickContinue = () => fireEvent.click(screen.getByRole("button", { name: "Continue" }));

describe("ImportKeysForm wizard", () => {
  // setup.ts doesn't register RTL auto-cleanup, so isolate renders explicitly.
  afterEach(cleanup);

  beforeEach(() => {
    importWallet.mockReset().mockResolvedValue({ address: "ccx7test", balance: { atomic: 0 } });
    openSession.mockReset();
  });

  it("starts on the Type step with Full / View-only choice cards", () => {
    render(<ImportKeysForm />);
    expect(screen.getByRole("button", { name: /Full wallet/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /View-only/ })).toBeInTheDocument();
    // keys live on a later step
    expect(screen.queryByLabelText("Spend key")).not.toBeInTheDocument();
  });

  it("full path: the Keys step shows Spend key, not Address", () => {
    render(<ImportKeysForm />);
    clickContinue(); // Full wallet is the default selection
    expect(screen.getByLabelText("Spend key")).toBeInTheDocument();
    expect(screen.queryByLabelText("Address")).not.toBeInTheDocument();
  });

  it("view-only path: the Keys step shows Address, not Spend key", () => {
    render(<ImportKeysForm />);
    fireEvent.click(screen.getByRole("button", { name: /View-only/ }));
    clickContinue();
    expect(screen.getByLabelText("Address")).toBeInTheDocument();
    expect(screen.queryByLabelText("Spend key")).not.toBeInTheDocument();
  });

  it("keeps the view key behind an Advanced link in full mode", () => {
    render(<ImportKeysForm />);
    clickContinue(); // → Keys (full wallet)
    expect(screen.queryByLabelText("View key")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /separate view key/i }));
    expect(screen.getByLabelText("View key")).toBeInTheDocument();
  });

  it("always shows the view key in view-only mode (it can't be derived)", () => {
    render(<ImportKeysForm />);
    fireEvent.click(screen.getByRole("button", { name: /View-only/ }));
    clickContinue();
    expect(screen.getByLabelText("View key")).toBeInTheDocument();
  });

  it("cannot advance past Keys until a valid 64-hex key is entered", () => {
    render(<ImportKeysForm />);
    clickContinue(); // → Keys
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Spend key"), { target: { value: "abc" } });
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Spend key"), { target: { value: HEX64 } });
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("derives and shows the address once a valid spend key is entered", async () => {
    render(<ImportKeysForm />);
    clickContinue(); // → Keys
    fireEvent.change(screen.getByLabelText("Spend key"), { target: { value: HEX64 } });
    await waitFor(() => expect(screen.getByText(/ccx7sampleADDR/)).toBeInTheDocument());
    expect(screen.getByText("These keys control")).toBeInTheDocument();
  });

  it("walks the full flow and submits keys + password + chosen scan height", async () => {
    render(<ImportKeysForm />);
    clickContinue(); // → Keys
    fireEvent.change(screen.getByLabelText("Spend key"), { target: { value: HEX64 } });
    clickContinue(); // → History

    // use the advanced exact-height path for a deterministic value
    fireEvent.click(screen.getByRole("button", { name: /exact block height/i }));
    fireEvent.change(screen.getByLabelText("Exact block height"), { target: { value: "1500000" } });
    clickContinue(); // → Secure

    const importBtn = screen.getByRole("button", { name: walletCopy.importWallet });
    expect(importBtn).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: PASSWORD } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: PASSWORD } });
    expect(importBtn).toBeEnabled();
    fireEvent.click(importBtn);

    await waitFor(() => expect(importWallet).toHaveBeenCalledTimes(1));
    expect(importWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "keys",
        viewOnly: false,
        privateSpendKey: HEX64,
        scanHeight: 1500000,
      }),
    );
  });
});
