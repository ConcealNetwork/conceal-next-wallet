"use client";

import { toast } from "sonner";
import { clearPasskeyEnrollment } from "@/lib/auth/biometric-store";
import { useQueryClient } from "@/lib/hooks/query-provider";
import { services } from "@/lib/services";
import { useWalletSession } from "@/lib/session/wallet-session";
import { clearAllTxNotes } from "@/lib/storage/tx-notes";
import { resetMessageNavBadge } from "@/lib/ui/message-nav-badge";

// The unlock UI (password + biometric enroll/unlock) lives in
// `OpenWalletProvider` (components/landing/landing-actions.tsx) — the dialog the
// landing "Open your wallet" buttons actually drive. This module keeps the
// shared session controls used across the wallet.

/** Remove the local biometric enrollment (stale after delete / password change). */
export function forgetBiometricEnrollment(): void {
  clearPasskeyEnrollment();
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
        clearPasskeyEnrollment();
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
