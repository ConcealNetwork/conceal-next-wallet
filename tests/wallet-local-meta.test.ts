import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPasskeyEnrollment,
  DEFAULT_WALLET_ID,
  getPasskeyEnrollment,
  type PasskeyEnrollment,
  savePasskeyEnrollment,
} from "@/lib/auth/biometric-store";
import { goalsStore } from "@/lib/storage/goals-store";
import {
  dismissPulse,
  listDismissed,
  resetPulseDismissed,
} from "@/lib/storage/pulse-dismiss-store";
import { clearWalletLocalMeta } from "@/lib/storage/wallet-local-meta";

const LEGACY_WATCHERS_KEY = "ccx-check-in-watchers";

function credential(id: string) {
  return {
    credentialId: id,
    label: "Device",
    encrypted: { iv: "aXY", ciphertext: `ci-${id}` },
    createdAt: "2026-06-18T00:00:00.000Z",
  };
}

beforeEach(() => {
  clearPasskeyEnrollment();
  clearPasskeyEnrollment("wallet-b");
  resetPulseDismissed();
  localStorage.removeItem(LEGACY_WATCHERS_KEY);
  vi.restoreAllMocks();
});

describe("clearWalletLocalMeta", () => {
  it("clears passkeys and goals for the target wallet only", async () => {
    function enrollment(address: string, credId: string): PasskeyEnrollment {
      return {
        version: 2,
        address,
        credentials: [credential(credId)],
      };
    }
    savePasskeyEnrollment(enrollment("ccx7default", "cred-a"), DEFAULT_WALLET_ID);
    savePasskeyEnrollment(enrollment("ccx7other", "cred-b"), "wallet-b");

    const clearGoals = vi.spyOn(goalsStore, "clear").mockResolvedValue(undefined);

    await clearWalletLocalMeta(DEFAULT_WALLET_ID);

    expect(clearGoals).toHaveBeenCalledWith(DEFAULT_WALLET_ID);
    expect(getPasskeyEnrollment(DEFAULT_WALLET_ID)).toBeNull();
    expect(getPasskeyEnrollment("wallet-b")?.credentials).toHaveLength(1);
  });

  it("purges legacy pulse watchers and optionally dismissals", async () => {
    localStorage.setItem(LEGACY_WATCHERS_KEY, "[]");
    dismissPulse("tx-1");

    await clearWalletLocalMeta("wallet-b", { pulseDismissals: true });

    expect(localStorage.getItem(LEGACY_WATCHERS_KEY)).toBeNull();
    expect(listDismissed().size).toBe(0);
  });

  it("leaves pulse dismissals when pulseDismissals is omitted", async () => {
    dismissPulse("tx-2");
    await clearWalletLocalMeta("wallet-b");
    expect(listDismissed().has("tx-2")).toBe(true);
  });

  it("clears scheduled payments for the target wallet only", async () => {
    localStorage.setItem(
      "ccx-scheduled-payments",
      JSON.stringify([
        {
          id: "a",
          walletId: "wallet-a",
          label: "A",
          address: "ccx7a",
          amount: "1",
          cadence: "monthly",
          anchorDate: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "b",
          walletId: "wallet-b",
          label: "B",
          address: "ccx7b",
          amount: "1",
          cadence: "monthly",
          anchorDate: "2026-01-01T00:00:00.000Z",
        },
      ]),
    );
    vi.spyOn(goalsStore, "clear").mockResolvedValue(undefined);
    await clearWalletLocalMeta("wallet-a");
    const remaining = JSON.parse(localStorage.getItem("ccx-scheduled-payments") ?? "[]");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].walletId).toBe("wallet-b");
  });
});
