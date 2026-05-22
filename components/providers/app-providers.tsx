"use client"

import { Toaster } from "sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { WalletQueryProvider } from "@/lib/hooks/query-provider"
import { WalletSessionProvider } from "@/lib/session/wallet-session"

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <WalletQueryProvider>
      <WalletSessionProvider>
        <TooltipProvider>
          {children}
          <Toaster richColors position="top-right" toastOptions={{ className: "bg-zinc-900 text-white" }} />
        </TooltipProvider>
      </WalletSessionProvider>
    </WalletQueryProvider>
  )
}
