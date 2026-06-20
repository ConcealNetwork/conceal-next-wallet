"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { publicAssetPath } from "@/lib/conceal/asset-path";
import { env } from "@/lib/env";
import { useI18n } from "@/lib/i18n/i18n-provider";

/**
 * Registers the cache-first offline service worker (vendored /lib + /workers,
 * precached app shell) and surfaces a "new version available" prompt.
 *
 * The SW no longer auto-activates on install (see service-worker.js): when an
 * update finishes installing while a worker already controls the page, we show a
 * Sonner action toast. Tapping "Reload" posts {type:"SKIP_WAITING"} to the
 * waiting worker; once it takes control (`controllerchange`) we reload exactly
 * once so the page picks up the fresh, content-hashed chunks.
 */
export function WalletServiceWorkerRegister() {
  const { t } = useI18n();
  // Keep the latest translator reachable from the once-only effect without
  // re-running registration when the locale changes.
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (env.useMockWallet || !("serviceWorker" in navigator)) {
      return;
    }

    const swUrl = publicAssetPath("/service-worker.js");
    const scope = publicAssetPath("/");

    // Reload once when the new worker takes control, never in a loop.
    let reloading = false;
    function onControllerChange() {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    }
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    function promptUpdate(worker: ServiceWorker) {
      const translate = tRef.current;
      toast(translate("sw.updateAvailable"), {
        // Sticky: the user decides when to reload — don't auto-dismiss it.
        duration: Number.POSITIVE_INFINITY,
        action: {
          label: translate("sw.reload"),
          onClick: () => worker.postMessage({ type: "SKIP_WAITING" }),
        },
      });
    }

    function watchInstalling(registration: ServiceWorkerRegistration) {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        // `installed` + an existing controller = an UPDATE is waiting (a fresh
        // install with no prior controller is the first load — nothing to prompt).
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          promptUpdate(installing);
        }
      });
    }

    function register() {
      navigator.serviceWorker
        .register(swUrl, { scope })
        .then((registration) => {
          // An update may already be waiting from a previous page load.
          if (registration.waiting && navigator.serviceWorker.controller) {
            promptUpdate(registration.waiting);
          }
          registration.addEventListener("updatefound", () => watchInstalling(registration));
        })
        .catch((error) => {
          console.warn("Service worker registration failed:", error);
        });
    }

    if (document.readyState === "complete") {
      register();
      return () => {
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      };
    }

    window.addEventListener("load", register, { once: true });
    return () => {
      window.removeEventListener("load", register);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
