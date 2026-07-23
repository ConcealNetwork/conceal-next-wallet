"use client";

import { useOpenWalletContext } from "@/components/wallet/unlock-wallet-provider";
import { getActiveWalletId } from "@/lib/auth/active-wallet-id";
import { clearPasskeyEnrollment } from "@/lib/auth/biometric-store";
import { queryKeys } from "@/lib/hooks/query-keys";
import { useQueryClient } from "@/lib/hooks/query-provider";
import { services } from "@/lib/services";
import { useWalletSession } from "@/lib/session/wallet-session";
import { clearAllGoals, goalsStore } from "@/lib/storage/goals-store";
import { clearAllTxNotes } from "@/lib/storage/tx-notes";
import { resetNavBadges } from "@/lib/ui/nav-badge-store";
import { toast } from "@/lib/ui/toast";

// The unlock UI (password + biometric enroll/unlock + multi-wallet picker) lives in
// the shared `UnlockWalletProvider` (components/wallet/unlock-wallet-provider.tsx),
// mounted on the landing AND inside the wallet shell so an in-app switch can unlock a
// not-yet-cached wallet over the current page. This module keeps the shared session
// controls used across the wallet.

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
        resetNavBadges();
        closeSession();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to disconnect wallet.");
      }
    })();
  };
}

/**
 * Switch the active wallet — SMOOTHLY (#smooth-wallet-switch).
 *
 *   - If the target is ALREADY unlocked (cached in memory), `switchWallet` returns
 *     its {@link WalletInfo}: we open the session IN PLACE (no route change, no
 *     password) and refresh the wallet-scoped queries — instant.
 *   - If it returns `null` (not cached), we open the shared in-app unlock dialog
 *     targeting that wallet (passkey-first when it has an enrollment) over the
 *     current page — NO bounce to the landing route.
 *
 * Mock mode always returns WalletInfo (the session never closes), so it takes the
 * instant path.
 */
export function useSwitchWalletFlow() {
  const { openSession } = useWalletSession();
  const queryClient = useQueryClient();
  const { openWallet } = useOpenWalletContext();

  return function switchWallet(id: string) {
    void (async () => {
      try {
        const info = await services.wallet.switchWallet(id);
        resetNavBadges();
        if (info) {
          // Target already unlocked (or mock) → swap the session in place, no route
          // change (omit redirectTo so the user stays on the current page).
          // `openSession` cancels in-flight fetches + invalidates all wallet-scoped
          // queries so balances/txs/messages reflect the now-active wallet.
          openSession(info);
          await queryClient.refetchQueries({ queryKey: queryKeys.wallets });
          return;
        }
        // Not cached → unlock the target in place via the shared dialog (passkey-first
        // when enrolled). Cancel in-flight fetches first, then drop the cache so the
        // previous wallet's balances/txs don't linger; successful unlock calls
        // `openSession`, which reloads everything for the newly opened wallet.
        await queryClient.cancelQueries();
        queryClient.removeQueries();
        await openWallet(id);
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
        await goalsStore.clear(walletId).catch(() => {});
        queryClient.clear();
        resetNavBadges();
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
      try {
        await clearAllGoals();
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
      resetNavBadges();
      closeSession();
      if (failed) {
        toast.error("Some local data could not be erased — please try again.");
      }
    })();
  };
}
