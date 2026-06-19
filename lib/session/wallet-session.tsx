"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getActiveWalletId } from "@/lib/auth/active-wallet-id";
import { clearPasskeyEnrollment, getPasskeyEnrollment } from "@/lib/auth/biometric-store";
import { env } from "@/lib/env";
import { queryKeys } from "@/lib/hooks/query-keys";
import { useQueryClient } from "@/lib/hooks/query-provider";
import { requestPersistentStorage } from "@/lib/hooks/use-storage-health";
import type { WalletInfo } from "@/lib/types";
import { resetMessageNavBadge } from "@/lib/ui/message-nav-badge";

type WalletStatus = "locked" | "open";

type PersistedSession = {
  status: WalletStatus;
  walletInfo: WalletInfo | null;
};

type WalletSessionContextValue = {
  status: WalletStatus;
  walletInfo: WalletInfo | null;
  isHydrated: boolean;
  /** Pass `redirectTo` (e.g. `/wallet/account`) to navigate after session state commits. */
  openSession: (walletInfo: WalletInfo, redirectTo?: string) => void;
  closeSession: () => void;
};

const STORAGE_KEY = "conceal-next-wallet-session";

const WalletSessionContext = createContext<WalletSessionContextValue | null>(null);

export function WalletSessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<WalletStatus>("locked");
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);

  useEffect(() => {
    if (env.persistWalletSession) {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as PersistedSession;
          setStatus(parsed.status);
          setWalletInfo(parsed.walletInfo);
        } catch {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (env.persistWalletSession && isHydrated && status === "open") {
      resetMessageNavBadge();
    }
  }, [isHydrated, status]);

  /** Navigate only after `status === "open"` is committed (avoids WalletGuard bounce on static export). */
  useEffect(() => {
    if (status !== "open" || pendingRedirect === null) {
      return;
    }
    const target = pendingRedirect;
    setPendingRedirect(null);
    router.push(target);
  }, [pendingRedirect, router, status]);

  const openSession = useCallback(
    (nextWalletInfo: WalletInfo, redirectTo?: string) => {
      resetMessageNavBadge();
      // Opening the wallet is a user gesture — request durable storage now so the
      // browser is less likely to evict the encrypted wallet (best-effort).
      void requestPersistentStorage();
      // Drop the ACTIVE wallet's passkey enrollment if it's bound to a different
      // address (the wallet at this id was re-imported / re-created) so a stale
      // ciphertext can't recover the previous wallet's password. Per-wallet keyed
      // (#95), so resolving the active id is async/best-effort.
      void getActiveWalletId().then((walletId) => {
        const enrollment = getPasskeyEnrollment(walletId);
        if (enrollment?.address && enrollment.address !== nextWalletInfo.address) {
          clearPasskeyEnrollment(walletId);
        }
      });
      setStatus("open");
      setWalletInfo(nextWalletInfo);
      queryClient.setQueryData(queryKeys.wallet, nextWalletInfo);
      if (env.persistWalletSession) {
        const nextSession: PersistedSession = { status: "open", walletInfo: nextWalletInfo };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
      }
      if (redirectTo) {
        setPendingRedirect(redirectTo);
      }
    },
    [queryClient],
  );

  const closeSession = useCallback(() => {
    setStatus("locked");
    setWalletInfo(null);
    window.localStorage.removeItem(STORAGE_KEY);
    router.push("/");
  }, [router]);

  const value = useMemo(
    () => ({ status, walletInfo, isHydrated, openSession, closeSession }),
    [closeSession, isHydrated, openSession, status, walletInfo],
  );

  return <WalletSessionContext.Provider value={value}>{children}</WalletSessionContext.Provider>;
}

export function useWalletSession() {
  const context = useContext(WalletSessionContext);
  if (!context) {
    throw new Error("useWalletSession must be used inside WalletSessionProvider");
  }
  return context;
}
