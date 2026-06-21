"use client";

import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useI18n } from "@/lib/i18n/i18n-provider";
import { useWalletSession } from "@/lib/session/wallet-session";
import { cn } from "@/lib/utils";

/** Back control shared by the legal and onboarding shells. Goes back in history
 *  when possible, otherwise falls back to the wallet (if a session is open) or
 *  the landing page. `sticky` pins it to the top-right (legal); onboarding sits
 *  it inline in the header. */
export function BackNav({ className, sticky = false }: { className?: string; sticky?: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const { status, walletInfo } = useWalletSession();
  const sessionOpen = status === "open" || walletInfo !== null;
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    setCanGoBack(window.history.length > 1);
  }, []);

  const fallbackHref = sessionOpen ? "/wallet/account" : "/";
  const label = canGoBack
    ? t("nav.back")
    : sessionOpen
      ? t("nav.backToWallet")
      : t("nav.backToHome");

  function handleBack() {
    if (canGoBack) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }

  return (
    <div
      className={cn(
        "w-fit rounded-xl",
        sticky && "sticky top-4 z-30 mb-6 ml-auto bg-background/80 py-1 pl-2 backdrop-blur-sm",
        className,
      )}
    >
      <button
        type="button"
        onClick={handleBack}
        aria-label={label}
        className="group inline-flex cursor-pointer flex-row-reverse items-center gap-2.5 rounded-sm text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex size-9 items-center justify-center rounded-full border border-border bg-secondary/95 shadow-sm transition-colors duration-200 group-hover:border-primary/40 group-hover:bg-primary/10 group-hover:text-primary">
          <Undo2 className="size-4" aria-hidden="true" />
        </span>
        <span className="hidden sm:inline">{label}</span>
      </button>
    </div>
  );
}
