"use client";

import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useWalletSession } from "@/lib/session/wallet-session";
import { cn } from "@/lib/utils";

export function LegalBackNav({ className }: { className?: string }) {
  const router = useRouter();
  const { status, walletInfo } = useWalletSession();
  const sessionOpen = status === "open" || walletInfo !== null;
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    setCanGoBack(window.history.length > 1);
  }, []);

  const fallbackHref = sessionOpen ? "/wallet/account" : "/";
  const label = canGoBack ? "Back" : sessionOpen ? "Back to wallet" : "Back to home";

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
        "sticky top-4 z-30 mb-6 ml-auto w-fit rounded-xl bg-background/80 py-1 pl-2 backdrop-blur-sm",
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
