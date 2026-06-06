import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture what the form hands to the engine, and stub the session redirect.
const importWallet = vi.fn();
const openSession = vi.fn();

vi.mock("@/lib/services", () => ({
  services: { wallet: { importWallet: (input: unknown) => importWallet(input) } },
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

  it("cannot advance past Keys until a valid 64-hex key is entered", () => {
    render(<ImportKeysForm />);
    clickContinue(); // → Keys
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Spend key"), { target: { value: "abc" } });
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Spend key"), { target: { value: HEX64 } });
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
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
