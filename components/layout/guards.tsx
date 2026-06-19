"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useWalletSession } from "@/lib/session/wallet-session";

function RouteLoading({ label }: { label: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 text-muted-foreground">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-12" />
          <div className="flex-1 space-y-3">
            <p className="text-sm font-medium text-foreground">{label}</p>
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-2 w-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function WalletGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, walletInfo, isHydrated } = useWalletSession();
  const sessionOpen = status === "open" || walletInfo !== null;

  useEffect(() => {
    if (isHydrated && !sessionOpen) {
      const search = typeof window !== "undefined" ? window.location.search : "";
      const target = `${pathname}${search}`;
      router.replace(
        target === "/" || target === "" ? "/" : `/?next=${encodeURIComponent(target)}`,
      );
    }
  }, [isHydrated, pathname, router, sessionOpen]);

  if (!isHydrated || !sessionOpen) {
    return <RouteLoading label="Loading wallet..." />;
  }

  return children;
}

export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, isHydrated } = useWalletSession();

  useEffect(() => {
    // Multi-wallet (#95): an open session may legitimately visit create/import to
    // ADD another wallet, so don't bounce those routes. Legal pages are always
    // reachable. Any other onboarding route returns an open session to the wallet.
    const allowedWhileOpen =
      pathname.startsWith("/terms") ||
      pathname.startsWith("/privacy") ||
      pathname.startsWith("/create") ||
      pathname.startsWith("/import");
    if (isHydrated && status === "open" && !allowedWhileOpen) {
      router.replace("/wallet/account");
    }
  }, [isHydrated, pathname, router, status]);

  if (!isHydrated) {
    return <RouteLoading label="Loading..." />;
  }

  return children;
}
