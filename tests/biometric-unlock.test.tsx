import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real mode so the passkey path is active (it's gated off in mock).
vi.mock("@/lib/env", () => ({
  env: { useMockWallet: false, persistWalletSession: false },
}));

const openSession = vi.fn();
vi.mock("@/lib/session/wallet-session", () => ({
  useWalletSession: () => ({ openSession }),
}));

const { hasStoredWallet, openWallet } = vi.hoisted(() => ({
  hasStoredWallet: vi.fn().mockResolvedValue(true),
  openWallet: vi.fn().mockResolvedValue({ address: "ccx7test" }),
}));
vi.mock("@/lib/services", () => ({
  services: { wallet: { hasStoredWallet, openWallet } },
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

function openUnlockDialog() {
  render(
    <OpenWalletProvider>
      <NavOpenWalletButton />
    </OpenWalletProvider>,
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
});
