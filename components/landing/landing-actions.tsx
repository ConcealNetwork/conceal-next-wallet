"use client";

import { Fingerprint } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { services } from "@/lib/services";
import { useWalletSession } from "@/lib/session/wallet-session";
import { getSafeNextPath } from "@/lib/ui/payment-link";

type OpenWalletContextValue = {
  openWallet: () => Promise<void>;
};

const OpenWalletContext = createContext<OpenWalletContextValue | null>(null);

function useOpenWalletContext() {
  const context = useContext(OpenWalletContext);
  if (!context) {
    throw new Error("Open wallet controls must be used inside OpenWalletProvider");
  }
  return context;
}

/** Renders unlock and no-wallet dialogs for all landing open-wallet buttons. */
export function OpenWalletProvider({ children }: { children: React.ReactNode }) {
  const { openSession } = useWalletSession();
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [noWalletDialogOpen, setNoWalletDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Biometric unlock is a real-mode feature (it gates the wallet password).
  const biometricEnabled = !env.useMockWallet;
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [enableBiometric, setEnableBiometric] = useState(false);

  async function unlock(passwordValue?: string) {
    setLoading(true);
    try {
      const wallet = await services.wallet.openWallet(
        env.useMockWallet ? {} : { password: passwordValue },
      );
      // Opt-in enrollment: the password just verified, so encrypt it now.
      if (biometricEnabled && biometricAvailable && !enrolled && enableBiometric && passwordValue) {
        try {
          setBiometricEnrollment({
            ...(await enrollBiometric(passwordValue)),
            address: wallet.address,
          });
          setEnrolled(true);
          toast.success("Biometric unlock enabled for this device.");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Couldn't enable biometric unlock.");
        }
      }
      openSession(wallet, getSafeNextPath() ?? "/wallet/account");
      setUnlockDialogOpen(false);
      setPassword("");
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
      const wallet = await services.wallet.openWallet({ password: recovered });
      openSession(wallet, getSafeNextPath() ?? "/wallet/account");
      setUnlockDialogOpen(false);
    } catch {
      // Decrypted fine, but the password no longer opens the wallet (changed /
      // re-imported elsewhere) — the enrollment is stale, so drop it.
      clearBiometricEnrollment();
      setEnrolled(false);
      toast.error("Biometric unlock is out of date — unlock with your password to re-enable it.");
    } finally {
      setLoading(false);
    }
  }

  // Reflect biometric availability/enrollment whenever the unlock dialog opens.
  useEffect(() => {
    if (!biometricEnabled || !unlockDialogOpen) return;
    let mounted = true;
    setEnrolled(getBiometricEnrollment() !== null);
    void isBiometricAvailable().then((value) => {
      if (mounted) setBiometricAvailable(value);
    });
    return () => {
      mounted = false;
    };
  }, [biometricEnabled, unlockDialogOpen]);

  useEffect(() => {
    if (!getSafeNextPath()) return;
    void services.wallet
      .hasStoredWallet()
      .then((hasStored) => {
        if (hasStored) setUnlockDialogOpen(true);
      })
      .catch(() => {
        // Real-mode dynamic import can reject (script load failure); the user can
        // still open the wallet manually, so swallow rather than crash the effect.
      });
  }, []);

  async function openWallet() {
    if (env.useMockWallet) {
      await unlock();
      return;
    }

    const hasStored = await services.wallet.hasStoredWallet();
    if (!hasStored) {
      setNoWalletDialogOpen(true);
      return;
    }

    setUnlockDialogOpen(true);
  }

  return (
    <OpenWalletContext.Provider value={{ openWallet }}>
      {children}
      <Dialog open={unlockDialogOpen} onOpenChange={setUnlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open wallet</DialogTitle>
            <DialogDescription>
              Enter your encryption password to unlock the wallet on this device.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void unlock(password);
            }}
          >
            {biometricEnabled && enrolled && biometricAvailable ? (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                disabled={loading}
                onClick={() => void unlockBiometric()}
              >
                <Fingerprint className="size-4" aria-hidden="true" />
                Unlock with biometrics
              </Button>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="landing-open-password">Password</Label>
              <Input
                id="landing-open-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoFocus
              />
              {biometricEnabled && biometricAvailable && !enrolled ? (
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUnlockDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Opening…" : "Open Wallet"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={noWalletDialogOpen} onOpenChange={setNoWalletDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No wallet found</DialogTitle>
            <DialogDescription>
              There is no encrypted wallet on this device yet. Import an existing wallet or create a
              new one.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-3 sm:flex-col sm:space-x-0">
            <Button asChild className="w-full">
              <Link href="/import" onClick={() => setNoWalletDialogOpen(false)}>
                Import wallet
              </Link>
            </Button>
            <Link
              href="/create"
              onClick={() => setNoWalletDialogOpen(false)}
              className="cursor-pointer text-center text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              Create a new one →
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OpenWalletContext.Provider>
  );
}

/** Primary hero CTAs: open the wallet, or go create a new one. */
export function LandingActions() {
  const { openWallet } = useOpenWalletContext();

  return (
    <div className="mt-11 flex flex-wrap items-center gap-x-7 gap-y-4">
      <button
        type="button"
        onClick={() => void openWallet()}
        className="cursor-pointer rounded-full bg-primary px-7 py-4 text-[15px] font-semibold text-primary-foreground transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(255,165,0,0.3)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        Open your wallet
      </button>
      <Link
        href="/create"
        className="cursor-pointer rounded-sm text-[14.5px] font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        Create a new one →
      </Link>
    </div>
  );
}

/** Compact "Open Wallet" pill used in the landing nav. */
export function NavOpenWalletButton() {
  const { openWallet } = useOpenWalletContext();

  return (
    <button
      type="button"
      onClick={() => void openWallet()}
      className="cursor-pointer rounded-full border border-border px-[17px] py-[9px] text-sm font-medium text-foreground transition-colors duration-200 hover:border-primary hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
    >
      Open Wallet
    </button>
  );
}
