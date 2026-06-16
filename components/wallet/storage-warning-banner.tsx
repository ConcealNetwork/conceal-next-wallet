"use client";

import { DatabaseBackup, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useStorageHealth } from "@/lib/hooks/use-storage-health";

const COPY = {
  "low-space":
    "This browser is low on storage. Back up your wallet now so you can restore it if the data is evicted.",
  "not-persisted":
    "This browser hasn't granted persistent storage, so it may clear the wallet automatically. Back up your recovery phrase to be safe.",
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
 */
export function StorageWarningBanner() {
  const { data } = useStorageHealth();
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(readDismissed);

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
        <Link
          href="/wallet/export"
          className="mt-1 inline-block font-semibold text-wallet-amber underline-offset-4 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          Back up now →
        </Link>
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
