import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real mode so the passkey path is active (it's gated off in mock).
vi.mock("@/lib/env", () => ({
  env: { useMockWallet: false, persistWalletSession: false },
}));

// Per-wallet passkey keying (#95): resolve a fixed active id so the unlock flow
// doesn't pull the SDK engine into this jsdom suite.
vi.mock("@/lib/auth/active-wallet-id", () => ({
  getActiveWalletId: vi.fn().mockResolvedValue("default"),
}));

const openSession = vi.fn();
vi.mock("@/lib/session/wallet-session", () => ({
  useWalletSession: () => ({ openSession }),
}));

const { hasStoredWallet, openWallet, listWallets, switchWallet } = vi.hoisted(() => ({
  hasStoredWallet: vi.fn().mockResolvedValue(true),
  openWallet: vi.fn().mockResolvedValue({ address: "ccx7test" }),
  listWallets: vi.fn().mockResolvedValue([{ id: "default", label: "Main wallet", isActive: true }]),
  switchWallet: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/services", () => ({
  services: { wallet: { hasStoredWallet, openWallet, listWallets, switchWallet } },
}));

const { getPasskeyEnrollment, hasPasskeyEnrollment } = vi.hoisted(() => ({
  getPasskeyEnrollment: vi.fn().mockReturnValue(null),
  hasPasskeyEnrollment: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/auth/biometric-store", () => ({
  getPasskeyEnrollment,
  hasPasskeyEnrollment,
  savePasskeyEnrollment: vi.fn(),
  clearPasskeyEnrollment: vi.fn(),
  addPasskeyCredential: vi.fn((_existing, credential) => ({
    version: 2,
    credentials: [credential],
  })),
}));

vi.mock("@/lib/auth/webauthn-prf", () => {
  class PasskeyError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    isPasskeyUnlockAvailable: vi.fn().mockReturnValue(true),
    enrollPasskeyCredential: vi
      .fn()
      .mockResolvedValue({ credentialId: "c", label: "This device", encrypted: {}, createdAt: "" }),
    unlockWithPasskey: vi.fn().mockResolvedValue("recovered-password"),
    PasskeyError,
  };
});

vi.mock("@/lib/ui/payment-link", () => ({ getSafeNextPath: () => undefined }));

import { NavOpenWalletButton, OpenWalletProvider } from "@/components/landing/landing-actions";
import { I18nProvider } from "@/lib/i18n/i18n-provider";

function openUnlockDialog() {
  render(
    <I18nProvider>
      <OpenWalletProvider>
        <NavOpenWalletButton />
      </OpenWalletProvider>
    </I18nProvider>,
  );
  fireEvent.click(screen.getAllByRole("button", { name: "Open Wallet" })[0]);
}

describe("OpenWalletProvider unlock dialog — passkey (real mode)", () => {
  beforeEach(() => {
    getPasskeyEnrollment.mockReturnValue(null);
    hasPasskeyEnrollment.mockReturnValue(false);
    openSession.mockClear();
  });
  afterEach(cleanup);

  it("offers to enable passkey unlock when available and not enrolled", async () => {
    openUnlockDialog();
    // The dialog opens and, once availability resolves, offers passkey enrollment
    // (the previous bug: the option was missing entirely at login).
    await waitFor(() => expect(screen.getByText(/enable passkey unlock/i)).toBeInTheDocument());
  });

  it("offers a passkey unlock button when already enrolled", async () => {
    hasPasskeyEnrollment.mockReturnValue(true);
    getPasskeyEnrollment.mockReturnValue({
      version: 2,
      address: "ccx7test",
      credentials: [
        {
          credentialId: "c",
          label: "This device",
          encrypted: { iv: "x", ciphertext: "y" },
          createdAt: "",
        },
      ],
    });
    openUnlockDialog();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /unlock with a passkey/i })).toBeInTheDocument(),
    );
  });

  // #113: the cold-start picker must pre-select the ACTIVE/last-used wallet, not the
  // default one. Regression for selectedId seeding to "default" (always in the list),
  // which made the dialog always pre-select the default wallet.
  it("pre-selects the active wallet, not the default, on cold start", async () => {
    listWallets.mockResolvedValueOnce([
      { id: "default", label: "Funding", address: "ccx7funding", isActive: false },
      { id: "w2", label: "Savings", address: "ccx7savings", isActive: true },
    ]);
    openUnlockDialog();

    const savings = await screen.findByRole("button", { name: /Savings/ });
    const funding = screen.getByRole("button", { name: /Funding/ });
    // The selected option carries the primary border/background; the other does not.
    await waitFor(() => expect(savings.className).toContain("border-primary"));
    expect(funding.className).not.toContain("border-primary");
  });

  // #113 review (Codex): seeding selectedId="" must never reach the passkey store as an
  // empty key — the pre-resolve window has to fall back to the default wallet id, or an
  // enrollment lands under "ccx-biometric-enrollment:" and is unfindable on next unlock.
  it("never probes the passkey store with an empty wallet id (falls back to default)", async () => {
    openUnlockDialog();
    await waitFor(() => expect(hasPasskeyEnrollment).toHaveBeenCalled());
    expect(hasPasskeyEnrollment).not.toHaveBeenCalledWith("");
    expect(hasPasskeyEnrollment).toHaveBeenCalledWith("default");
  });
});
