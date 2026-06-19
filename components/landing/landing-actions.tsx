"use client";

import Link from "next/link";
import {
  UnlockWalletProvider,
  useOpenWalletContext,
} from "@/components/wallet/unlock-wallet-provider";

// The unlock UI (password + biometric enroll/unlock + multi-wallet picker) lives in
// the shared `UnlockWalletProvider` (components/wallet/unlock-wallet-provider.tsx),
// reused by both the landing cold-start flow and the in-app wallet switcher. This
// module wires the landing-specific provider defaults + the hero/nav CTAs.

/** Landing cold-start unlock provider: auto-opens from `?next=`, redirects into the wallet. */
export function OpenWalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <UnlockWalletProvider defaultRedirect="/wallet/account" autoOpenFromNext>
      {children}
    </UnlockWalletProvider>
  );
}

/** Primary hero CTAs: open the wallet, or go create a new one. */
export function LandingActions() {
  const { openWallet } = useOpenWalletContext();

  return (
    <div className="mt-11 flex flex-wrap items-center gap-x-7 gap-y-4">
      <button
        type="button"
        onClick={() => void openWallet()}
        className="cursor-pointer rounded-full bg-primary px-7 py-4 text-[15px] font-semibold text-primary-foreground transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(255,165,0,0.3)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        Open your wallet
      </button>
      <Link
        href="/create"
        className="cursor-pointer rounded-sm text-[14.5px] font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        Create a new one →
      </Link>
    </div>
  );
}

/** Compact "Open Wallet" pill used in the landing nav. */
export function NavOpenWalletButton() {
  const { openWallet } = useOpenWalletContext();

  return (
    <button
      type="button"
      onClick={() => void openWallet()}
      className="cursor-pointer rounded-full border border-border px-[17px] py-[9px] text-sm font-medium text-foreground transition-colors duration-200 hover:border-primary hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
    >
      Open Wallet
    </button>
  );
}
