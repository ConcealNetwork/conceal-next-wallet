"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { env } from "@/lib/env";
import type { WalletInfo } from "@/lib/types";

type WalletStatus = "locked" | "open";

type PersistedSession = {
  status: WalletStatus;
  walletInfo: WalletInfo | null;
};

type WalletSessionContextValue = {
  status: WalletStatus;
  walletInfo: WalletInfo | null;
  isHydrated: boolean;
  openSession: (walletInfo: WalletInfo) => void;
  closeSession: () => void;
};

const STORAGE_KEY = "conceal-next-wallet-session";

const WalletSessionContext = createContext<WalletSessionContextValue | null>(null);

export function WalletSessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<WalletStatus>("locked");
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

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

  const openSession = useCallback((nextWalletInfo: WalletInfo) => {
    setStatus("open");
    setWalletInfo(nextWalletInfo);
    if (env.persistWalletSession) {
      const nextSession: PersistedSession = { status: "open", walletInfo: nextWalletInfo };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
    }
  }, []);

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
