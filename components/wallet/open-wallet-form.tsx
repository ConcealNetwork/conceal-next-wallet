"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getActiveWalletId } from "@/lib/auth/active-wallet-id";
import { clearPasskeyEnrollment } from "@/lib/auth/biometric-store";
import { env } from "@/lib/env";
import { queryKeys } from "@/lib/hooks/query-keys";
import { useQueryClient } from "@/lib/hooks/query-provider";
import { services } from "@/lib/services";
import { useWalletSession } from "@/lib/session/wallet-session";
import { clearAllTxNotes } from "@/lib/storage/tx-notes";
import { resetMessageNavBadge } from "@/lib/ui/message-nav-badge";

// The unlock UI (password + biometric enroll/unlock) lives in
// `OpenWalletProvider` (components/landing/landing-actions.tsx) — the dialog the
// landing "Open your wallet" buttons actually drive. This module keeps the
// shared session controls used across the wallet.

/** Remove the active wallet's biometric enrollment (stale after delete / password change). */
export function forgetBiometricEnrollment(): void {
  void getActiveWalletId().then((walletId) => clearPasskeyEnrollment(walletId));
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

/**
 * Switch the active wallet (#95). Real mode: the engine closes the session on
 * switch (keys are never kept), so we clear local session + cache and bounce to
 * the open-wallet screen — which auto-opens the unlock dialog for the now-active
 * wallet (via the `next` path, mirroring the landing reload flow). Mock mode keeps
 * the session open (the mock unlock takes no password), so we just refresh.
 */
export function useSwitchWalletFlow() {
  const { closeSession } = useWalletSession();
  const queryClient = useQueryClient();
  const router = useRouter();

  return function switchWallet(id: string) {
    void (async () => {
      try {
        await services.wallet.switchWallet(id);
        resetMessageNavBadge();
        if (env.useMockWallet) {
          // Mock: the session stays open (mock unlock takes no password) — refresh
          // the wallet list + all wallet-scoped data to reflect the new active wallet.
          await queryClient.invalidateQueries({ queryKey: queryKeys.wallets });
          await queryClient.refetchQueries({ queryKey: queryKeys.wallets });
          await queryClient.invalidateQueries();
          return;
        }
        // Real: the engine session is closed; re-unlock the target wallet via the
        // landing unlock dialog (auto-opened by the `next` path).
        queryClient.clear();
        closeSession();
        router.replace(`/?next=${encodeURIComponent("/wallet/account")}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to switch wallet.");
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
        // Resolve the active id BEFORE deletion — deleteStoredWallet reassigns
        // active to a survivor, so we must clear the enrollment for the wallet
        // actually being removed.
        const walletId = await getActiveWalletId();
        await services.wallet.deleteStoredWallet();
        clearPasskeyEnrollment(walletId);
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
