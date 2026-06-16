"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  useEffect(() => {
    void services.wallet.hasStoredWallet().then(setStoredWallet);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const wallet = await services.wallet.openWallet({ password });
      openSession(wallet, getSafeNextPath() ?? "/wallet/account");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open wallet.");
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
        </div>
      )}
      <Button type="submit" disabled={loading}>
        {loading ? "Opening…" : "Open Wallet"}
      </Button>
    </form>
  );
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
