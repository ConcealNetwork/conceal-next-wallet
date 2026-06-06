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

describe("ImportKeysForm — engine parity", () => {
  // setup.ts doesn't register RTL auto-cleanup, so isolate renders explicitly.
  afterEach(cleanup);

  beforeEach(() => {
    importWallet.mockReset().mockResolvedValue({ address: "ccx7test", balance: { atomic: 0 } });
    openSession.mockReset();
  });

  it("full import (default): hides Address (engine derives it), shows Spend key", () => {
    render(<ImportKeysForm />);
    // Engine ignores `address` for full imports, so the field shouldn't be shown/required.
    expect(screen.queryByLabelText("Address")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Spend key")).toBeInTheDocument();
  });

  it("view-only import: shows Address (engine needs it), hides Spend key", () => {
    render(<ImportKeysForm />);
    fireEvent.click(screen.getByLabelText("View-only wallet"));
    // Engine recovers the public keys from the address in view-only mode.
    expect(screen.getByLabelText("Address")).toBeInTheDocument();
    expect(screen.queryByLabelText("Spend key")).not.toBeInTheDocument();
  });

  it("passes the chosen scan height to the engine (no forced genesis rescan)", async () => {
    render(<ImportKeysForm />);
    fireEvent.change(screen.getByLabelText("Spend key"), { target: { value: "spendkey" } });
    fireEvent.change(screen.getByLabelText("View key"), { target: { value: "viewkey" } });
    fireEvent.change(screen.getByLabelText("Import height"), { target: { value: "1500000" } });
    fireEvent.change(screen.getByLabelText("Encryption password"), { target: { value: "pw" } });
    // The form has a single submit button; its label varies by env (mock vs real).
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(importWallet).toHaveBeenCalledTimes(1));
    expect(importWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "keys",
        viewOnly: false,
        privateSpendKey: "spendkey",
        privateViewKey: "viewkey",
        scanHeight: 1500000,
      }),
    );
  });
});
