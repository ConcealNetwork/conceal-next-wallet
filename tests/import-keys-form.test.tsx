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
const HEX64_B = "b".repeat(64);
const PASSWORD = "ConcealTest1!";

function submitButton() {
  return screen.getByRole("button", { name: walletCopy.importWallet });
}

/** Fill a full-mode import with valid keys + matching passwords. */
function fillValidFullImport({ height = "1500000" }: { height?: string } = {}) {
  fireEvent.change(screen.getByLabelText("Spend key"), { target: { value: HEX64 } });
  fireEvent.change(screen.getByLabelText("View key"), { target: { value: HEX64_B } });
  fireEvent.change(screen.getByLabelText("Import height"), { target: { value: height } });
  fireEvent.change(screen.getByLabelText("Encryption password"), { target: { value: PASSWORD } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: PASSWORD } });
}

describe("ImportKeysForm", () => {
  // setup.ts doesn't register RTL auto-cleanup, so isolate renders explicitly.
  afterEach(cleanup);

  beforeEach(() => {
    importWallet.mockReset().mockResolvedValue({ address: "ccx7test", balance: { atomic: 0 } });
    openSession.mockReset();
  });

  it("full import (default): hides Address (engine derives it), shows Spend key", () => {
    render(<ImportKeysForm />);
    expect(screen.queryByLabelText("Address")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Spend key")).toBeInTheDocument();
  });

  it("view-only toggle: shows Address (engine needs it), hides Spend key", () => {
    render(<ImportKeysForm />);
    fireEvent.click(screen.getByRole("button", { name: "View-only" }));
    expect(screen.getByLabelText("Address")).toBeInTheDocument();
    expect(screen.queryByLabelText("Spend key")).not.toBeInTheDocument();
  });

  it("keeps submit disabled until keys and passwords are valid", () => {
    render(<ImportKeysForm />);
    expect(submitButton()).toBeDisabled();

    // A too-short spend key is not a valid 64-hex key.
    fireEvent.change(screen.getByLabelText("Spend key"), { target: { value: "abc" } });
    fireEvent.change(screen.getByLabelText("Encryption password"), { target: { value: PASSWORD } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: PASSWORD } });
    expect(submitButton()).toBeDisabled();
    expect(screen.getByText("Spend key must be 64 hexadecimal characters.")).toBeInTheDocument();
  });

  it("keeps submit disabled when the passwords do not match", () => {
    render(<ImportKeysForm />);
    fillValidFullImport();
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "different" } });
    expect(submitButton()).toBeDisabled();
    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
  });

  it("submits valid keys and passes the chosen scan height (no forced genesis rescan)", async () => {
    render(<ImportKeysForm />);
    fillValidFullImport({ height: "1500000" });
    expect(submitButton()).toBeEnabled();
    fireEvent.click(submitButton());

    await waitFor(() => expect(importWallet).toHaveBeenCalledTimes(1));
    expect(importWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "keys",
        viewOnly: false,
        privateSpendKey: HEX64,
        privateViewKey: HEX64_B,
        scanHeight: 1500000,
      }),
    );
  });
});
