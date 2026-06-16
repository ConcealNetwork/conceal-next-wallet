"use client";

import { EyeOff } from "lucide-react";
import { useWalletViewOnly } from "@/lib/hooks";
import { walletCopy } from "@/lib/ui/wallet-copy";

/**
 * Amber sibling of {@link WalletSyncingBanner}. Renders only for watch-only
 * wallets, explaining why spend actions are unavailable. A syncing view-only
 * wallet shows both banners stacked (orange sync + amber view-only).
 */
export function ViewOnlyBanner() {
  const viewOnly = useWalletViewOnly();
  if (!viewOnly) return null;

  return (
    <div
      className="mb-4 flex items-start gap-3 rounded-xl border border-wallet-amber/30 bg-wallet-amber/10 px-4 py-3 text-sm text-foreground"
      role="status"
      data-testid="view-only-banner"
    >
      <EyeOff className="mt-0.5 size-4 shrink-0 text-wallet-amber" aria-hidden="true" />
      <div>
        <p className="font-semibold">{walletCopy.viewOnlyBannerTitle}</p>
        <p className="text-muted-foreground">{walletCopy.viewOnlyBannerBody}</p>
      </div>
    </div>
  );
}
