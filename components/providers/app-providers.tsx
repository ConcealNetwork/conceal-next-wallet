"use client";

import { Toaster } from "sonner";
import { WalletServiceWorkerRegister } from "@/components/wallet/wallet-service-worker";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WalletQueryProvider } from "@/lib/hooks/query-provider";
import { WalletSessionProvider } from "@/lib/session/wallet-session";
import { TickerPreferenceProvider } from "@/lib/ui/ticker-preference-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <WalletQueryProvider>
      <WalletSessionProvider>
        <TickerPreferenceProvider>
          <WalletServiceWorkerRegister />
          <TooltipProvider>
            {children}
            <Toaster
              richColors
              position="top-right"
              toastOptions={{ className: "bg-popover text-popover-foreground" }}
            />
          </TooltipProvider>
        </TickerPreferenceProvider>
      </WalletSessionProvider>
    </WalletQueryProvider>
  );
}
