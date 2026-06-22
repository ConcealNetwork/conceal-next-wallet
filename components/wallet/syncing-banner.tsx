"use client";

import { useWalletSyncStatus } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function WalletSyncingBanner({ hint }: { hint?: string }) {
  const { t } = useI18n();
  const { isSyncing, info, syncPct } = useWalletSyncStatus();
  if (!isSyncing || !info) return null;

  return (
    <div
      className="mb-4 flex items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground"
      role="status"
      aria-live="polite"
    >
      <span className="relative flex size-2.5 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
        <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
      </span>
      <span>
        {t("syncBanner.line", {
          current: info.currentHeight.toLocaleString(),
          network: info.networkHeight.toLocaleString(),
          pct: syncPct,
        })}
        {hint ? ` — ${hint}` : null}
      </span>
    </div>
  );
}
