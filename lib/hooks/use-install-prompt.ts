"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimal shape of the Chrome `beforeinstallprompt` event. The real DOM lib type
 * isn't shipped (the event is still behind a spec behind flags in TypeScript's
 * `lib.dom`), so declare just the surface we use.
 */
export interface BeforeInstallPromptEvent {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallPrompt {
  /** A `beforeinstallprompt` event has fired and `promptInstall()` can trigger it. */
  canInstall: boolean;
  /** App is running in a standalone display (already installed / added to home screen). */
  isStandalone: boolean;
  /** iOS Safari — no `beforeinstallprompt`; install is manual (Share → Add to Home Screen). */
  isIOS: boolean;
  /** Show the browser install prompt; returns true if the user accepted. */
  promptInstall: () => Promise<boolean>;
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const standaloneMedia =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(display-mode: standalone)").matches
      : false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standaloneMedia || iosStandalone;
}

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPhone|iPad|iPod covers iOS Safari; the MSStream guard excludes Windows Phone
  // UA spoofing (Edge used to advertise "iPhone" in its UA). iOS never fires
  // `beforeinstallprompt`, so we hint the manual Add to Home Screen flow instead.
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/.test(ua) && !/MSStream/.test(ua);
}

/**
 * PWA install affordance. Chrome fires `beforeinstallprompt` once engagement
 * heuristics are met; we stash it so a user gesture (the "Install app" button)
 * can call `prompt()` later. Installing the PWA is the most reliable trigger for
 * `navigator.storage.persist()` to be granted — installing earns persistence.
 *
 * SSR/static-export safe: all listener registration lives inside `useEffect`, and
 * the initial state is `false`/`false` until the effect runs on the client.
 */
export function useInstallPrompt(): InstallPrompt {
  const [canInstall, setCanInstall] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setIsStandalone(detectStandalone());
    setIsIOS(detectIOS());

    function onBeforeInstallPrompt(event: Event) {
      // Prevent the default mini-infobar so we control the prompt timing.
      event.preventDefault();
      deferredRef.current = event as unknown as BeforeInstallPromptEvent;
      setCanInstall(true);
    }

    function onAppInstalled() {
      deferredRef.current = null;
      setCanInstall(false);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const event = deferredRef.current;
    if (!event) return false;
    try {
      await event.prompt();
      const choice = await event.userChoice;
      // The event is single-use once prompted.
      deferredRef.current = null;
      setCanInstall(false);
      return choice.outcome === "accepted";
    } catch {
      return false;
    }
  }, []);

  return { canInstall, isStandalone, isIOS, promptInstall };
}
