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

const DEFAULT_WALLET_ID = "default";

type OpenWalletContextValue = {
  /**
   * Open the unlock dialog. Pass a `targetId` to pre-select (and, for an enrolled
   * wallet, passkey-first unlock) a SPECIFIC wallet — used for in-app switching.
   * Mock mode opens the session immediately (no password).
   */
  openWallet: (targetId?: string) => Promise<void>;
};

const OpenWalletContext = createContext<OpenWalletContextValue | null>(null);

export function useOpenWalletContext() {
  const context = useContext(OpenWalletContext);
  if (!context) {
    throw new Error("Open wallet controls must be used inside OpenWalletProvider");
  }
  return context;
}

type UnlockWalletProviderProps = {
  children: React.ReactNode;
  /**
   * Where to navigate after a successful unlock when there is no `?next=` path.
   * The landing screen passes `/wallet/account` (the cold-start flow); the in-app
   * provider passes `null` so an in-place switch stays on the current page.
   */
  defaultRedirect?: string | null;
  /**
   * When false, the dialog never auto-opens from a `?next=` link on mount (the
   * in-app provider opens only on an explicit switch). Defaults to true (landing).
   */
  autoOpenFromNext?: boolean;
};

/**
 * Renders the unlock + no-wallet dialogs and exposes `openWallet(targetId?)`.
 * Shared by the landing cold-start flow and the in-app wallet switcher, so an
 * in-app switch can unlock a not-yet-cached wallet over the current page without a
 * bounce to the landing route.
 */
export function UnlockWalletProvider({
  children,
  defaultRedirect = "/wallet/account",
  autoOpenFromNext = true,
}: UnlockWalletProviderProps) {
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
  const walletIdRef = useRef<string>(DEFAULT_WALLET_ID);
  // Multi-wallet (#95): the wallets on this device + which one the unlock dialog will
  // open, so the user always knows which password to use (and can pick another).
  const [wallets, setWallets] = useState<WalletSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_WALLET_ID);
  // Passkey-first (smooth switching): auto-trigger the passkey prompt once when the
  // dialog opens targeting a wallet that has an enrollment. A ref so a re-render
  // (e.g. after listWallets resolves) doesn't re-fire the assertion.
  const autoPasskeyArmed = useRef(false);
  const passkeyButtonRef = useRef<HTMLButtonElement>(null);

  // Where to send the user after a successful unlock (in-app switching stays put).
  function resolveRedirect(): string | undefined {
    const next = getSafeNextPath();
    if (next) return next;
    return defaultRedirect ?? undefined;
  }

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
          savePasskeyEnrollment(
            addPasskeyCredential(current, credential, wallet.address),
            walletId,
          );
          setEnrolled(true);
          toast.success("Passkey unlock enabled for this device.");
        } catch (error) {
          // A user cancel is silent; a real failure (e.g. no PRF) explains itself.
          if (!(error instanceof PasskeyError) || error.code !== "cancelled") {
            toast.error(error instanceof Error ? error.message : "Couldn't enable passkey unlock.");
          }
        }
      }
      openSession(wallet, resolveRedirect());
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
      // Make the selected wallet active first (in-app switch may target another).
      if (!env.useMockWallet && selectedId) {
        const activeId = wallets.find((wallet) => wallet.isActive)?.id;
        if (activeId && selectedId !== activeId) {
          await services.wallet.switchWallet(selectedId);
        }
      }
      const wallet = await services.wallet.openWallet({ password: recovered });
      openSession(wallet, resolveRedirect());
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
  // the active one — so the dialog shows which wallet a password will open. When a
  // `targetId` was requested (in-app switch), keep that selection rather than the
  // active one.
  useEffect(() => {
    if (!unlockDialogOpen) return;
    let cancelled = false;
    void services.wallet
      .listWallets()
      .then((list) => {
        if (cancelled) return;
        setWallets(list);
        // Honor an explicit target (in-app switch); otherwise default to active.
        setSelectedId((current) => {
          if (current && list.some((wallet) => wallet.id === current)) return current;
          const active = list.find((wallet) => wallet.isActive) ?? list[0];
          return active ? active.id : current;
        });
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

  // Passkey-first: when the dialog opens for a wallet that has an enrollment and the
  // platform supports it, focus the passkey button so it's the primary action. A
  // disarm flag ensures we focus once per open, not on every re-render.
  useEffect(() => {
    if (!unlockDialogOpen) {
      autoPasskeyArmed.current = false;
      return;
    }
    if (passkeyEnabled && enrolled && passkeyAvailable && !autoPasskeyArmed.current) {
      autoPasskeyArmed.current = true;
      // Focus on the next tick so the dialog's own autofocus doesn't steal it.
      const id = window.setTimeout(() => passkeyButtonRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [unlockDialogOpen, passkeyEnabled, enrolled, passkeyAvailable]);

  useEffect(() => {
    if (!autoOpenFromNext) return;
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
  }, [autoOpenFromNext]);

  async function openWallet(targetId?: string) {
    if (env.useMockWallet) {
      if (targetId) setSelectedId(targetId);
      await unlock();
      return;
    }

    const hasStored = await services.wallet.hasStoredWallet();
    if (!hasStored) {
      setNoWalletDialogOpen(true);
      return;
    }

    // Pre-select the requested wallet (in-app switch) before opening the dialog so
    // the password field + passkey unlock are keyed to it from the first render.
    if (targetId) {
      setSelectedId(targetId);
      walletIdRef.current = targetId;
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
                ref={passkeyButtonRef}
                type="button"
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
                autoFocus={!(passkeyEnabled && enrolled && passkeyAvailable)}
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
              <Button type="submit" variant="outline" disabled={loading}>
                {loading ? "Opening…" : "Open with password"}
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
