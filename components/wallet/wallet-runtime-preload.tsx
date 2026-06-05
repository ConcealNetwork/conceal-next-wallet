"use client";

import { useEffect } from "react";
import { ensureWalletRuntimeLibs, isWalletRuntimeReady } from "@/lib/conceal/init";
import { env } from "@/lib/env";

/** Warm core crypto globals (biginteger, nacl, concealjs) while the user reads the landing page. */
export function WalletRuntimePreload() {
  useEffect(() => {
    if (env.useMockWallet || isWalletRuntimeReady()) {
      return;
    }

    function preload() {
      void ensureWalletRuntimeLibs().catch((error) => {
        console.warn("Wallet runtime preload failed:", error);
      });
    }

    if (typeof requestIdleCallback === "function") {
      const idleId = requestIdleCallback(preload, { timeout: 4000 });
      return () => cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(preload, 1500);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return null;
}
