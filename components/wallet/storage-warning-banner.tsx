"use client";

import { DatabaseBackup, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { queryKeys } from "@/lib/hooks/query-keys";
import { useQueryClient } from "@/lib/hooks/query-provider";
import { useInstallPrompt } from "@/lib/hooks/use-install-prompt";
import { requestPersistentStorage, useStorageHealth } from "@/lib/hooks/use-storage-health";
import { toast } from "@/lib/ui/toast";

const COPY = {
  "low-space":
    "This browser is low on storage. Back up your wallet now so you can restore it if the data is evicted.",
  "not-persisted":
    "This browser hasn't granted persistent storage, so it may clear the wallet automatically. Ask the browser to keep it on this device, and back up your recovery phrase to be safe.",
} as const;

// Per-session dismissal: re-warn next session (a seed-loss risk shouldn't be
// silenced forever), but don't nag on every navigation once acknowledged.
const DISMISS_KEY = "ccx-storage-warning-dismissed";

function readDismissed(): boolean {
  try {
    return typeof sessionStorage !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Amber banner prompting a backup when the browser's storage is at risk —
 * durable storage was denied, or the quota is nearly full (see `useStorageHealth`).
 * Rendered globally in the wallet shell; hidden when storage is healthy, on the
 * export page itself, or once dismissed for the session.
 *
 * For the not-persisted case it also offers "Keep on this device", which requests
 * durable storage from a user gesture (`navigator.storage.persist()`) — the gesture
 * gives the best chance of a grant (Chrome decides on engagement heuristics; Firefox
 * prompts). On a grant the re-probe flips storage to healthy and the banner hides.
 *
 * Installing the PWA is the most reliable engagement heuristic Chrome uses to grant
 * `persist()`, so the not-persisted case also offers "Install app" via
 * `useInstallPrompt` when the browser is ready (and a manual Add-to-Home-Screen hint
 * on iOS, which has no install prompt). Hidden once standalone (already installed).
 */
export function StorageWarningBanner() {
  const { data } = useStorageHealth();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { canInstall, isStandalone, isIOS, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [requesting, setRequesting] = useState(false);
  const [installing, setInstalling] = useState(false);

  if (!data || data === "none" || dismissed || pathname === "/wallet/export") {
    return null;
  }

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // non-fatal — dismissal just won't persist across reloads
    }
    setDismissed(true);
  }

  async function keepOnDevice() {
    setRequesting(true);
    try {
      const granted = await requestPersistentStorage();
      // Re-probe so the banner reflects the new state (hides on a grant).
      await queryClient.invalidateQueries({ queryKey: queryKeys.storageHealth });
      if (granted) {
        toast.success("This browser will now keep your wallet — it won't auto-clear it.");
      } else {
        toast.info(
          "Your browser didn't grant persistent storage. Back up your recovery phrase to be safe.",
        );
      }
    } finally {
      setRequesting(false);
    }
  }

  async function installApp() {
    setInstalling(true);
    try {
      const ok = await promptInstall();
      if (ok) {
        // Installing earns persistence — re-probe so the banner reflects it (hides on a grant).
        await queryClient.invalidateQueries({ queryKey: queryKeys.storageHealth });
        toast.success("Installed — your browser will keep the wallet.");
      }
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div
      className="mb-4 flex items-start gap-3 rounded-xl border border-wallet-amber/30 bg-wallet-amber/10 px-4 py-3 text-sm text-foreground"
      role="status"
      data-testid="storage-warning-banner"
    >
      <DatabaseBackup className="mt-0.5 size-4 shrink-0 text-wallet-amber" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Back up your wallet</p>
        <p className="text-muted-foreground">{COPY[data]}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          {data === "not-persisted" ? (
            <button
              type="button"
              onClick={() => void keepOnDevice()}
              disabled={requesting}
              className="cursor-pointer font-semibold text-wallet-amber underline-offset-4 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {requesting ? "Requesting…" : "Keep on this device"}
            </button>
          ) : null}
          {data === "not-persisted" && !isStandalone ? (
            canInstall ? (
              <button
                type="button"
                onClick={() => void installApp()}
                disabled={installing}
                className="cursor-pointer font-semibold text-wallet-amber underline-offset-4 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                {installing ? "Installing…" : "Install app"}
              </button>
            ) : isIOS ? (
              <span className="text-muted-foreground">
                On iOS: Share → Add to Home Screen to keep your wallet.
              </span>
            ) : null
          ) : null}
          <Link
            href="/wallet/export"
            className="inline-block font-semibold text-wallet-amber underline-offset-4 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            Back up now →
          </Link>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss storage warning"
        className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
