"use client";

import { useEffect, useRef } from "react";
import { publicAssetPath } from "@/lib/conceal/asset-path";
import { env } from "@/lib/env";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { toast } from "@/lib/ui/toast";

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
    // Never register the SW in dev: in real-mode `next dev` it cache-firsts the Turbopack chunks,
    // so source edits / HMR stop reflecting until you manually unregister it (and stale renders
    // survive a `.next` nuke). The production static export (NODE_ENV=production) still registers;
    // the forced-mock e2e is already gated off by `useMockWallet`, and the offline-PWA e2e runs a
    // real production build. Cordova WebView has no PWA SW — skip registration there too.
    if (
      process.env.NODE_ENV !== "production" ||
      env.useMockWallet ||
      process.env.NEXT_PUBLIC_CORDOVA === "true" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    const swUrl = publicAssetPath("/service-worker.js");
    const scope = publicAssetPath("/");

    let cancelled = false;
    // Only reload once the user ACCEPTS the update (we posted SKIP_WAITING).
    // Without this gate the SW's first-install activate → clients.claim() fires
    // `controllerchange` and would reload an untouched first-time session.
    let reloadRequested = false;
    let reloaded = false;
    // De-dupe: don't stack a second toast for a worker we already prompted for.
    let promptedWorker: ServiceWorker | null = null;

    function onControllerChange() {
      if (!reloadRequested || reloaded) return;
      reloaded = true;
      window.location.reload();
    }
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    function promptUpdate(worker: ServiceWorker) {
      if (cancelled || promptedWorker === worker) return;
      promptedWorker = worker;
      const translate = tRef.current;
      toast(translate("sw.updateAvailable"), {
        // Stable id so Sonner coalesces rather than stacking duplicate prompts.
        id: "sw-update",
        // Sticky: the user decides when to reload — don't auto-dismiss it.
        duration: Number.POSITIVE_INFINITY,
        action: {
          label: translate("sw.reload"),
          onClick: () => {
            reloadRequested = true;
            worker.postMessage({ type: "SKIP_WAITING" });
          },
        },
      });
    }

    function watchInstalling(worker: ServiceWorker | null) {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        // `installed` + an existing controller = an UPDATE is waiting (a fresh
        // install with no prior controller is the first load — nothing to prompt).
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          promptUpdate(worker);
        }
      });
    }

    function register() {
      navigator.serviceWorker
        .register(swUrl, { scope })
        .then((registration) => {
          if (cancelled) return;
          // An update may already be waiting, or mid-install, when we register.
          if (registration.waiting && navigator.serviceWorker.controller) {
            promptUpdate(registration.waiting);
          }
          watchInstalling(registration.installing);
          registration.addEventListener("updatefound", () =>
            watchInstalling(registration.installing),
          );
        })
        .catch((error) => {
          console.warn("Service worker registration failed:", error);
        });
    }

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", register);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
