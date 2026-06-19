"use client";

import { PanelRightOpen } from "lucide-react";
import { toast } from "sonner";
import { Footer } from "@/components/layout/footer";
import { GlobalHeader } from "@/components/layout/global-header";
import { RightRailProvider, useRightRailContent } from "@/components/layout/right-rail";
import { Sidebar } from "@/components/layout/sidebar";
import { useSidebarCollapse } from "@/components/layout/sidebar-collapse";
import { useWalletDisconnect } from "@/components/wallet/open-wallet-form";
import { StorageWarningBanner } from "@/components/wallet/storage-warning-banner";
import { UnlockWalletProvider } from "@/components/wallet/unlock-wallet-provider";
import { useWalletLiveSync, useWalletSettings } from "@/lib/hooks";
import { NetworkTelemetryProvider } from "@/lib/hooks/network-telemetry-provider";
import { useCheckInAlerts } from "@/lib/hooks/use-check-ins";
import { useDuePaymentReminders } from "@/lib/hooks/use-due-reminders";
import { useIdleLock } from "@/lib/hooks/use-idle-lock";
import { usePrefetchMessagesForBadge } from "@/lib/hooks/use-new-messages-since-open";
import { cn } from "@/lib/utils";

export function WalletShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebarCollapse();
  useWalletLiveSync();
  usePrefetchMessagesForBadge();
  useDuePaymentReminders();
  useCheckInAlerts();

  // Auto-lock: after the configured idle window, drop the in-memory session and
  // bounce to the unlock screen. Disabled when autoLockMinutes is 0.
  const autoLockMinutes = useWalletSettings().data?.autoLockMinutes ?? 0;
  const disconnect = useWalletDisconnect();
  useIdleLock(autoLockMinutes * 60_000, () => {
    toast.info("Locked due to inactivity.");
    disconnect();
  });

  return (
    // In-app unlock dialog for SMOOTH wallet switching: switching to a not-yet-cached
    // wallet opens this dialog (passkey-first when enrolled) over the current page,
    // rather than bouncing to the landing route. `defaultRedirect={null}` keeps the
    // user on the current page after unlock; it never auto-opens from `?next=`.
    <UnlockWalletProvider defaultRedirect={null} autoOpenFromNext={false}>
      <NetworkTelemetryProvider>
        <RightRailProvider>
          <WalletShellLayout collapsed={collapsed}>{children}</WalletShellLayout>
        </RightRailProvider>
      </NetworkTelemetryProvider>
    </UnlockWalletProvider>
  );
}

/**
 * Reads the registered rail content and lays out [main | rail] when a page has
 * registered content. Without content the main keeps its centered max-width
 * exactly as before. The rail is a fixed ~320px column visible only ≥ xl
 * (1280px); below xl it is hidden and main goes full width (stage 3 turns the
 * small-screen rail into a drawer). The collapse pin shrinks the column to a
 * narrow expand strip so the user can reclaim the width without leaving the page.
 */
function WalletShellLayout({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: React.ReactNode;
}) {
  const { content: rail, collapsed: railCollapsed } = useRightRailContent();
  const hasRail = rail !== null;

  return (
    <div className="flex min-h-screen flex-col text-foreground">
      <GlobalHeader />
      <Sidebar />
      <main
        className={cn(
          "flex min-h-0 flex-1 flex-col transition-[padding] duration-300 ease-in-out motion-reduce:transition-none",
          collapsed ? "lg:pl-[64px]" : "lg:pl-[260px]",
        )}
      >
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                "mx-auto w-full flex-1 px-4 py-8 transition-[max-width] duration-300 ease-in-out motion-reduce:transition-none sm:px-6 lg:px-8",
                collapsed ? "max-w-[1360px]" : "max-w-[1200px]",
              )}
            >
              <StorageWarningBanner />
              {children}
            </div>
          </div>
          {hasRail ? (
            railCollapsed ? (
              <RailCollapsedStrip />
            ) : (
              <aside
                aria-label="Context panel"
                className="w-[320px] shrink-0 overflow-y-auto border-l border-border/70 bg-[hsl(var(--chrome))] max-[1199px]:hidden"
              >
                <div className="px-7 pb-12 pt-8">{rail}</div>
              </aside>
            )
          ) : null}
        </div>
        <Footer collapsed={collapsed} />
      </main>
    </div>
  );
}

/** Narrow expand strip shown when the user collapses the rail column. */
function RailCollapsedStrip() {
  const { setCollapsed } = useRightRailContent();
  return (
    <aside
      aria-label="Context panel"
      className="w-12 shrink-0 border-l border-border/70 bg-[hsl(var(--chrome))] max-[1199px]:hidden"
    >
      <div className="flex justify-center pt-8">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand panel"
          title="Expand panel"
          className="grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PanelRightOpen className="size-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
