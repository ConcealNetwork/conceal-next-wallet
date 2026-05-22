"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"
import { useWalletSession } from "@/lib/session/wallet-session"

export function WalletGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { status, isHydrated } = useWalletSession()

  useEffect(() => {
    if (isHydrated && status !== "open") {
      router.replace("/")
    }
  }, [isHydrated, router, status])

  if (!isHydrated || status !== "open") {
    return <div className="grid min-h-screen place-items-center text-zinc-400">Loading wallet...</div>
  }

  return children
}

export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { status, isHydrated } = useWalletSession()

  useEffect(() => {
    if (isHydrated && status === "open" && !pathname.startsWith("/terms") && !pathname.startsWith("/privacy")) {
      router.replace("/wallet/account")
    }
  }, [isHydrated, pathname, router, status])

  if (!isHydrated) {
    return <div className="grid min-h-screen place-items-center text-zinc-400">Loading...</div>
  }

  return children
}
