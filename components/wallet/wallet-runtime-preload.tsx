"use client";

import { useEffect } from "react";
import { ensureWalletRuntimeLibs, isWalletRuntimeReady } from "@/lib/conceal/init";
import { env } from "@/lib/env";

/**
 * Warm the legacy crypto globals (biginteger, nacl, concealjs) while the user reads
 * the landing page — but ONLY for the `wallet-core` engine. The default SDK engine
 * imports conceal-lib-js as a module and never touches these `window` globals, so
 * preloading them there is wasted work (and surfaced a spurious load warning).
 */
export function WalletRuntimePreload() {
  useEffect(() => {
    if (env.useMockWallet || env.walletEngine !== "wallet-core" || isWalletRuntimeReady()) {
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
