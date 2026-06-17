import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real mode so the biometric path is active (it's gated off in mock).
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

const { getBiometricEnrollment } = vi.hoisted(() => ({
  getBiometricEnrollment: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/auth/biometric-store", () => ({
  getBiometricEnrollment,
  hasBiometricEnrollment: () => getBiometricEnrollment() !== null,
  setBiometricEnrollment: vi.fn(),
  clearBiometricEnrollment: vi.fn(),
}));

vi.mock("@/lib/auth/webauthn-prf", () => ({
  isBiometricAvailable: vi.fn().mockResolvedValue(true),
  enrollBiometric: vi.fn().mockResolvedValue({ credentialId: "c", encrypted: {} }),
  unlockWithBiometric: vi.fn().mockResolvedValue("recovered-password"),
}));

vi.mock("@/lib/ui/payment-link", () => ({ getSafeNextPath: () => undefined }));

import {
  NavOpenWalletButton,
  OpenWalletProvider,
} from "@/components/landing/landing-actions";

function openUnlockDialog() {
  render(
    <OpenWalletProvider>
      <NavOpenWalletButton />
    </OpenWalletProvider>,
  );
  fireEvent.click(screen.getAllByRole("button", { name: "Open Wallet" })[0]);
}

describe("OpenWalletProvider unlock dialog — biometric (real mode)", () => {
  beforeEach(() => {
    getBiometricEnrollment.mockReturnValue(null);
    openSession.mockClear();
  });
  afterEach(cleanup);

  it("offers to enable biometric unlock when available and not enrolled", async () => {
    openUnlockDialog();
    // The dialog opens and, once availability resolves, offers biometric
    // enrollment (this is the bug: the option was missing entirely).
    await waitFor(() =>
      expect(screen.getByText(/enable biometric unlock/i)).toBeInTheDocument(),
    );
  });

  it("offers a biometric unlock button when already enrolled", async () => {
    getBiometricEnrollment.mockReturnValue({ credentialId: "c", encrypted: {}, address: "ccx7test" });
    openUnlockDialog();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /unlock with biometrics/i })).toBeInTheDocument(),
    );
  });
});
