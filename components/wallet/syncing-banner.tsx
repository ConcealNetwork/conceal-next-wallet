"use client";

import { useWalletSyncStatus } from "@/lib/hooks";

export function WalletSyncingBanner({ hint }: { hint?: string }) {
  const { isSyncing, info, syncPct } = useWalletSyncStatus();
  if (!isSyncing || !info) return null;

  return (
    <div
      className="mb-4 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground"
      role="status"
    >
      Syncing blockchain… block {info.currentHeight.toLocaleString()} /{" "}
      {info.networkHeight.toLocaleString()} ({syncPct}%)
      {hint ? ` — ${hint}` : null}
    </div>
  );
}
