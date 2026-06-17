"use client";

import { toast } from "sonner";
import { Footer } from "@/components/layout/footer";
import { Sidebar } from "@/components/layout/sidebar";
import { useSidebarCollapse } from "@/components/layout/sidebar-collapse";
import { useWalletDisconnect } from "@/components/wallet/open-wallet-form";
import { StorageWarningBanner } from "@/components/wallet/storage-warning-banner";
import { useWalletLiveSync, useWalletSettings } from "@/lib/hooks";
import { NetworkTelemetryProvider } from "@/lib/hooks/network-telemetry-provider";
import { useDuePaymentReminders } from "@/lib/hooks/use-due-reminders";
import { useIdleLock } from "@/lib/hooks/use-idle-lock";
import { usePrefetchMessagesForBadge } from "@/lib/hooks/use-new-messages-since-open";
import { cn } from "@/lib/utils";

export function WalletShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebarCollapse();
  useWalletLiveSync();
  usePrefetchMessagesForBadge();
  useDuePaymentReminders();

  // Auto-lock: after the configured idle window, drop the in-memory session and
  // bounce to the unlock screen. Disabled when autoLockMinutes is 0.
  const autoLockMinutes = useWalletSettings().data?.autoLockMinutes ?? 0;
  const disconnect = useWalletDisconnect();
  useIdleLock(autoLockMinutes * 60_000, () => {
    toast.info("Locked due to inactivity.");
    disconnect();
  });

  return (
    <NetworkTelemetryProvider>
      <div className="text-foreground">
        <Sidebar />
        <main
          className={cn(
            "flex min-h-screen flex-col transition-[padding] duration-300 ease-in-out motion-reduce:transition-none",
            collapsed ? "lg:pl-[64px]" : "lg:pl-[260px]",
          )}
        >
          <div
            className={cn(
              "mx-auto w-full flex-1 px-4 py-8 transition-[max-width] duration-300 ease-in-out motion-reduce:transition-none sm:px-6 lg:px-8",
              collapsed ? "max-w-[1360px]" : "max-w-[1200px]",
            )}
          >
            <StorageWarningBanner />
            {children}
          </div>
          <Footer collapsed={collapsed} />
        </main>
      </div>
    </NetworkTelemetryProvider>
  );
}
