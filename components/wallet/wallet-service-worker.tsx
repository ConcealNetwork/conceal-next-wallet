"use client";

import { useEffect } from "react";
import { publicAssetPath } from "@/lib/conceal/asset-path";
import { env } from "@/lib/env";

/** Cache-first offline cache for vendored /lib and /workers assets (repeat visits). */
export function WalletServiceWorkerRegister() {
  useEffect(() => {
    if (env.useMockWallet || !("serviceWorker" in navigator)) {
      return;
    }

    const swUrl = publicAssetPath("/service-worker.js");
    const scope = publicAssetPath("/");

    function register() {
      void navigator.serviceWorker.register(swUrl, { scope }).catch((error) => {
        console.warn("Service worker registration failed:", error);
      });
    }

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
