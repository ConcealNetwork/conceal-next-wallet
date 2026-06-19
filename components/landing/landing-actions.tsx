"use client";

import { Check, Fingerprint } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState } from "react";
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
  addPasskeyCredential,
  clearPasskeyEnrollment,
  getPasskeyEnrollment,
  hasPasskeyEnrollment,
  savePasskeyEnrollment,
} from "@/lib/auth/biometric-store";
import {
  enrollPasskeyCredential,
  isPasskeyUnlockAvailable,
  PasskeyError,
  unlockWithPasskey,
} from "@/lib/auth/webauthn-prf";
import { env } from "@/lib/env";
import { services } from "@/lib/services";
import { useWalletSession } from "@/lib/session/wallet-session";
import type { WalletSummary } from "@/lib/types";
import { getSafeNextPath } from "@/lib/ui/payment-link";
import { truncateAddress } from "@/lib/utils";

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

  // Passkey unlock is a real-mode feature (it gates the wallet password).
  const passkeyEnabled = !env.useMockWallet;
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [enablePasskey, setEnablePasskey] = useState(false);
  // Active wallet id for per-wallet passkey keying (#95). Tracks the SELECTED wallet
  // the dialog will open; defaults to the default wallet id until loaded.
  const walletIdRef = useRef<string>("default");
  // Multi-wallet (#95): the wallets on this device + which one the unlock dialog will
  // open, so the user always knows which password to use (and can pick another).
  const [wallets, setWallets] = useState<WalletSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("default");

  async function unlock(passwordValue?: string) {
    setLoading(true);
    try {
      // Open the SELECTED wallet: make it active first if the user picked another.
      if (!env.useMockWallet && selectedId) {
        const activeId = wallets.find((wallet) => wallet.isActive)?.id;
        if (activeId && selectedId !== activeId) {
          await services.wallet.switchWallet(selectedId);
        }
        walletIdRef.current = selectedId;
      }
      const wallet = await services.wallet.openWallet(
        env.useMockWallet ? {} : { password: passwordValue },
      );
      // Opt-in enrollment: the password just verified, so encrypt it now.
      if (passkeyEnabled && passkeyAvailable && enablePasskey && passwordValue) {
        try {
          const walletId = walletIdRef.current;
          const current = getPasskeyEnrollment(walletId);
          const credential = await enrollPasskeyCredential(
            passwordValue,
            current?.credentials ?? [],
          );
          savePasskeyEnrollment(addPasskeyCredential(current, credential, wallet.address), walletId);
          setEnrolled(true);
          toast.success("Passkey unlock enabled for this device.");
        } catch (error) {
          // A user cancel is silent; a real failure (e.g. no PRF) explains itself.
          if (!(error instanceof PasskeyError) || error.code !== "cancelled") {
            toast.error(error instanceof Error ? error.message : "Couldn't enable passkey unlock.");
          }
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

  async function unlockPasskey() {
    const walletId = walletIdRef.current;
    const enrollment = getPasskeyEnrollment(walletId);
    if (!enrollment) return;
    setLoading(true);
    let recovered: string;
    try {
      recovered = await unlockWithPasskey(enrollment);
    } catch (error) {
      // Assertion cancelled / failed — keep the enrollment, fall back to manual.
      // A user cancel is silent; other failures explain themselves.
      if (!(error instanceof PasskeyError) || error.code !== "cancelled") {
        toast.error(error instanceof Error ? error.message : "Passkey unlock failed.");
      }
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
      clearPasskeyEnrollment(walletId);
      setEnrolled(false);
      toast.error("Passkey unlock is out of date — unlock with your password to re-enable it.");
    } finally {
      setLoading(false);
    }
  }

  // Load the wallets on this device when the dialog opens, defaulting the selection to
  // the active one — so the dialog shows which wallet a password will open.
  useEffect(() => {
    if (!unlockDialogOpen) return;
    let cancelled = false;
    void services.wallet
      .listWallets()
      .then((list) => {
        if (cancelled) return;
        setWallets(list);
        const active = list.find((wallet) => wallet.isActive) ?? list[0];
        if (active) setSelectedId(active.id);
      })
      .catch(() => {
        // Listing can fail before the engine loads; the single-wallet unlock still works.
      });
    return () => {
      cancelled = true;
    };
  }, [unlockDialogOpen]);

  // Reflect passkey availability/enrollment for the SELECTED wallet (per-wallet keyed).
  useEffect(() => {
    if (!passkeyEnabled || !unlockDialogOpen) return;
    setPasskeyAvailable(isPasskeyUnlockAvailable());
    walletIdRef.current = selectedId;
    setEnrolled(hasPasskeyEnrollment(selectedId));
  }, [passkeyEnabled, unlockDialogOpen, selectedId]);

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
              {wallets.length > 1
                ? "Choose a wallet, then enter its encryption password."
                : "Enter your encryption password to unlock the wallet on this device."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void unlock(password);
            }}
          >
            {wallets.length > 1 ? (
              <div className="space-y-1.5">
                <Label>Wallet</Label>
                <div className="space-y-1">
                  {wallets.map((wallet) => (
                    <button
                      key={wallet.id}
                      type="button"
                      onClick={() => setSelectedId(wallet.id)}
                      className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                        wallet.id === selectedId
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-secondary"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {wallet.label}
                        </span>
                        {wallet.address ? (
                          <span className="block truncate font-mono text-[11px] text-muted-foreground">
                            {truncateAddress(wallet.address, 6, 4)}
                          </span>
                        ) : null}
                      </span>
                      {wallet.id === selectedId ? (
                        <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {passkeyEnabled && enrolled && passkeyAvailable ? (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                disabled={loading}
                onClick={() => void unlockPasskey()}
              >
                <Fingerprint className="size-4" aria-hidden="true" />
                Unlock with a passkey
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
              {passkeyEnabled && passkeyAvailable && !enrolled ? (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={enablePasskey}
                    onChange={(event) => setEnablePasskey(event.target.checked)}
                  />
                  Enable passkey unlock (Touch ID, security key…) on this device
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
