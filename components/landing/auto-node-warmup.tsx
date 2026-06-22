"use client";

import { useEffect } from "react";
import { env } from "@/lib/env";

/**
 * Side-effect-only: on the wallet-open screen, kick off a one-time probe of the official + community
 * nodes and cache the FASTEST healthy one (real mode only) — so by the time the user unlocks, the
 * runtime syncs from the fastest node instead of the single hardcoded default (see
 * `lib/network/auto-node.ts` + the `nodeUrlFromRaw` precedence). Renders nothing.
 *
 * Deliberately mounted on the landing PAGE, NOT inside `OpenWalletProvider`, so unit tests that
 * render the provider directly (e.g. the biometric-unlock test) never fire a network probe. The
 * probe module is lazy-imported behind the mock-mode gate, so mock builds don't load it at all.
 * `refreshAutoNode` is idempotent per session and fully best-effort (never throws).
 */
export function AutoNodeWarmup() {
  useEffect(() => {
    if (env.useMockWallet) return;
    void import("@/lib/network/auto-node").then(({ refreshAutoNode }) => refreshAutoNode());
  }, []);
  return null;
}
