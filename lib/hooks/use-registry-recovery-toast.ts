"use client";

import { useEffect, useRef } from "react";
import { useWallets } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { services } from "@/lib/services";
import { useWalletSession } from "@/lib/session/wallet-session";
import { toast } from "@/lib/ui/toast";

/** One-shot toast when the real-SDK wallet registry was rebuilt from storage envelopes. */
export function useRegistryRecoveryToast() {
  const { t } = useI18n();
  const { status } = useWalletSession();
  const { data: wallets } = useWallets();
  const shown = useRef(false);

  useEffect(() => {
    if (status !== "open" || !wallets || shown.current) return;
    if (services.wallet.takeRegistryRecoveryNotice()) {
      toast.info(t("toast.walletsIndexRecovered"), { id: "wallets-index-recovered" });
      shown.current = true;
    }
  }, [status, wallets, t]);
}
