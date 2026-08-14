"use client";

import { useEffect, useState } from "react";
import { getActiveWalletId } from "@/lib/auth/active-wallet-id";
import { useWallets } from "@/lib/hooks";
import { useWalletSession } from "@/lib/session/wallet-session";

/**
 * Resolved active wallet id from the registry (real SDK) or mock list — same
 * source as goals/passkey keying. Re-resolves when `activeSwitchId` changes.
 */
export function useActiveWalletId(): { walletId: string | null; loading: boolean } {
  const { status } = useWalletSession();
  const activeSwitchId = useWallets().data?.find((w) => w.isActive)?.id;
  const [walletId, setWalletId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== "open") {
      setWalletId(null);
      setLoading(false);
      return;
    }
    if (activeSwitchId === undefined) {
      setLoading(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getActiveWalletId().then((id) => {
      if (!cancelled) {
        setWalletId(id);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [status, activeSwitchId]);

  return { walletId, loading };
}
