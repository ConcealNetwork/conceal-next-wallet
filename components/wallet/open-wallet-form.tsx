"use client";

import { Fingerprint } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  clearBiometricEnrollment,
  getBiometricEnrollment,
  setBiometricEnrollment,
} from "@/lib/auth/biometric-store";
import {
  enrollBiometric,
  isBiometricAvailable,
  unlockWithBiometric,
} from "@/lib/auth/webauthn-prf";
import { env } from "@/lib/env";
import { useQueryClient } from "@/lib/hooks/query-provider";
import { services } from "@/lib/services";
import { useWalletSession } from "@/lib/session/wallet-session";
import { clearAllTxNotes } from "@/lib/storage/tx-notes";
import { resetMessageNavBadge } from "@/lib/ui/message-nav-badge";
import { getSafeNextPath } from "@/lib/ui/payment-link";

export function OpenWalletForm() {
  const { openSession } = useWalletSession();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [storedWallet, setStoredWallet] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [enableBiometric, setEnableBiometric] = useState(false);

  // Biometric unlock is a real-mode feature (it gates the wallet password).
  const biometricEnabled = !env.useMockWallet;

  useEffect(() => {
    let mounted = true;
    void services.wallet.hasStoredWallet().then((stored) => {
      if (mounted) setStoredWallet(stored);
    });
    if (biometricEnabled) {
      setEnrolled(getBiometricEnrollment() !== null);
      void isBiometricAvailable().then((value) => {
        if (mounted) setBiometricAvailable(value);
      });
    }
    return () => {
      mounted = false;
    };
  }, [biometricEnabled]);

  function finishUnlock(wallet: Awaited<ReturnType<typeof services.wallet.openWallet>>) {
    openSession(wallet, getSafeNextPath() ?? "/wallet/account");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const wallet = await services.wallet.openWallet({ password });
      // Opt-in enrollment: the password just verified, so encrypt it now.
      if (biometricEnabled && biometricAvailable && !enrolled && enableBiometric) {
        try {
          setBiometricEnrollment({ ...(await enrollBiometric(password)), address: wallet.address });
          toast.success("Biometric unlock enabled for this device.");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Couldn't enable biometric unlock.");
        }
      }
      finishUnlock(wallet);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open wallet.");
    } finally {
      setLoading(false);
    }
  }

  async function unlockBiometric() {
    const enrollment = getBiometricEnrollment();
    if (!enrollment) return;
    setLoading(true);
    let recovered: string;
    try {
      recovered = await unlockWithBiometric(enrollment);
    } catch (error) {
      // Assertion cancelled / failed — keep the enrollment, fall back to manual.
      toast.error(error instanceof Error ? error.message : "Biometric unlock failed.");
      setLoading(false);
      return;
    }
    try {
      finishUnlock(await services.wallet.openWallet({ password: recovered }));
    } catch {
      // Decrypted fine, but the password no longer opens the wallet (e.g. it was
      // changed/re-imported elsewhere) — the enrollment is stale, so drop it.
      clearBiometricEnrollment();
      setEnrolled(false);
      toast.error("Biometric unlock is out of date — unlock with your password to re-enable it.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="mx-auto mt-6 flex max-w-sm flex-col gap-3" onSubmit={submit}>
      {storedWallet && (
        <p className="text-center text-sm text-muted-foreground">
          Encrypted wallet found on this device. Enter your password to unlock and sync with the
          blockchain.
        </p>
      )}
      {biometricEnabled && enrolled && biometricAvailable ? (
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          disabled={loading}
          onClick={unlockBiometric}
        >
          <Fingerprint className="size-4" aria-hidden="true" />
          Unlock with biometrics
        </Button>
      ) : null}
      {env.useMockWallet ? null : (
        <div className="space-y-2">
          <Label htmlFor="open-password">Wallet password</Label>
          <Input
            id="open-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {biometricAvailable && !enrolled ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={enableBiometric}
                onChange={(event) => setEnableBiometric(event.target.checked)}
              />
              Enable biometric unlock on this device
            </label>
          ) : null}
        </div>
      )}
      <Button type="submit" disabled={loading}>
        {loading ? "Opening…" : "Open Wallet"}
      </Button>
    </form>
  );
}

/** Remove the local biometric enrollment (stale after delete / password change). */
export function forgetBiometricEnrollment(): void {
  clearBiometricEnrollment();
}

export function useWalletDisconnect() {
  const { closeSession } = useWalletSession();
  const queryClient = useQueryClient();

  return function disconnect() {
    void (async () => {
      try {
        await services.wallet.disconnect?.();
        queryClient.clear();
        resetMessageNavBadge();
        closeSession();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to disconnect wallet.");
      }
    })();
  };
}

export function useWalletDelete() {
  const { closeSession } = useWalletSession();
  const queryClient = useQueryClient();

  return function deleteWallet() {
    void (async () => {
      try {
        await services.wallet.deleteStoredWallet();
        clearBiometricEnrollment();
        queryClient.clear();
        resetMessageNavBadge();
        closeSession();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete wallet.");
      }
    })();
  };
}

/**
 * Panic wipe: erase everything local. Deletes the wallet + all wallet-engine
 * state (via the service), then clears mode-agnostic browser data — transaction
 * notes and React Query cache — and returns to the open-wallet screen.
 */
export function usePanicWipe() {
  const { closeSession } = useWalletSession();
  const queryClient = useQueryClient();

  return function panicWipe() {
    void (async () => {
      // Best-effort: attempt every wipe step independently, then ALWAYS drop the
      // session and in-memory cache — a partial failure must never leave the user
      // authenticated with stale data on screen.
      let failed = false;
      try {
        await services.wallet.panicWipe();
      } catch {
        failed = true;
      }
      try {
        await clearAllTxNotes();
      } catch {
        failed = true;
      }
      // Mode-agnostic local prefs (ticker, view toggles, cached market data, …).
      // In real mode the engine already clears localStorage; doing it here too
      // makes the mock wipe equally complete and is idempotent.
      try {
        window.localStorage.clear();
      } catch {
        failed = true;
      }
      queryClient.clear();
      resetMessageNavBadge();
      closeSession();
      if (failed) {
        toast.error("Some local data could not be erased — please try again.");
      }
    })();
  };
}
