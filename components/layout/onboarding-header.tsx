import { Wallet } from "lucide-react";
import Link from "next/link";

import { BackNav } from "@/components/layout/back-nav";

/** Minimal top bar for the onboarding routes (/create, /import). Mirrors the
 *  sidebar wordmark and links home; the back control sits opposite it. */
export function OnboardingHeader() {
  return (
    <header className="border-b border-border/60 bg-[hsl(var(--chrome))]/40">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="Conceal Wallet — home"
          className="flex items-center gap-3 rounded-xl transition-opacity duration-200 hover:opacity-80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Wallet className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="whitespace-nowrap text-lg font-bold text-foreground">Conceal Wallet</span>
        </Link>
        <BackNav />
      </div>
    </header>
  );
}
