"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { services } from "@/lib/services"
import { useWalletSession } from "@/lib/session/wallet-session"

function useOpenWallet() {
  const router = useRouter()
  const { openSession } = useWalletSession()

  return async function openWallet() {
    const wallet = await services.wallet.openWallet("mock-wallet")
    openSession(wallet)
    router.push("/wallet/account")
  }
}

/** Primary hero CTAs: open the mock wallet, or go create a new one. */
export function LandingActions() {
  const openWallet = useOpenWallet()

  return (
    <div className="mt-11 flex flex-wrap items-center gap-x-7 gap-y-4">
      <button
        type="button"
        onClick={openWallet}
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
  )
}

/** Compact "Open Wallet" pill used in the landing nav. */
export function NavOpenWalletButton() {
  const openWallet = useOpenWallet()

  return (
    <button
      type="button"
      onClick={openWallet}
      className="cursor-pointer rounded-full border border-border px-[17px] py-[9px] text-sm font-medium text-foreground transition-colors duration-200 hover:border-primary hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
    >
      Open Wallet
    </button>
  )
}
