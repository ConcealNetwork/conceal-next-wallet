"use client";

import { Footer } from "@/components/layout/footer";
import { GlobalHeader } from "@/components/layout/global-header";
import { RightRailProvider, useRightRailContent } from "@/components/layout/right-rail";
import { Sidebar } from "@/components/layout/sidebar";
import { useSidebarCollapse } from "@/components/layout/sidebar-collapse";
import { useWalletDisconnect } from "@/components/wallet/open-wallet-form";
import { StorageWarningBanner } from "@/components/wallet/storage-warning-banner";
import { UnlockWalletProvider } from "@/components/wallet/unlock-wallet-provider";
import { useWalletLiveSync, useWalletSettings, useWalletSyncStatus } from "@/lib/hooks";
import { NetworkTelemetryProvider } from "@/lib/hooks/network-telemetry-provider";
import { useAppBadge } from "@/lib/hooks/use-app-badge";
import { useCheckInAlerts } from "@/lib/hooks/use-check-ins";
import { useDuePaymentReminders } from "@/lib/hooks/use-due-reminders";
import { useIdleLock } from "@/lib/hooks/use-idle-lock";
import { usePrefetchMessagesForBadge } from "@/lib/hooks/use-new-messages-since-open";
import { useSecondaryWalletWatch } from "@/lib/hooks/use-secondary-wallet-watch";
import { useSyncWakeLock } from "@/lib/hooks/use-sync-wake-lock";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { toast } from "@/lib/ui/toast";
import { cn } from "@/lib/utils";

export function WalletShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { collapsed } = useSidebarCollapse();
  useWalletLiveSync();
  usePrefetchMessagesForBadge();
  useDuePaymentReminders();
  useCheckInAlerts();
  // Background-sync + notify for funds/messages arriving on UNLOCKED non-active wallets.
  useSecondaryWalletWatch();
  // Mirror actionable counts (overdue check-ins + due reminders) on the app icon.
  useAppBadge();
  // Keep the screen awake during long syncs so a scan doesn't stall on sleep.
  useSyncWakeLock(useWalletSyncStatus().isSyncing);

  // Auto-lock: after the configured idle window, drop the in-memory session and
  // bounce to the unlock screen. Disabled when autoLockMinutes is 0.
  const autoLockMinutes = useWalletSettings().data?.autoLockMinutes ?? 0;
  const disconnect = useWalletDisconnect();
  useIdleLock(autoLockMinutes * 60_000, () => {
    toast.info(t("toast.lockedInactivity"));
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
 * small-screen rail into a drawer). The rail toggle in the global header
 * collapses the column away fully, handing the width back to the main content.
 * Like the left sidebar, the rail scrolls independently of the page body.
 */
function WalletShellLayout({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const { content: rail, collapsed: railCollapsed } = useRightRailContent();
  const railOpen = rail !== null && !railCollapsed;

  return (
    <div className="flex min-h-screen flex-col text-foreground">
      <GlobalHeader />
      <Sidebar />
      {/* The rail mirrors the left sidebar: a fixed, full-height, INDEPENDENT
          column (header → bottom edge) rather than a flex child of <main>, so it
          no longer couples to the content scroll or sits under the footer. <main>
          clears it with right padding at the rail's ≥1200px breakpoint. */}
      {railOpen ? (
        <aside
          aria-label={t("shell.contextPanelAria")}
          className="fixed bottom-0 right-0 top-14 z-30 w-[380px] overflow-y-auto border-l border-border/70 bg-[hsl(var(--chrome))] max-[1199px]:hidden"
        >
          <div className="px-7 pb-12 pt-8">{rail}</div>
        </aside>
      ) : null}
      <main
        className={cn(
          "flex min-h-0 flex-1 flex-col transition-[padding] duration-300 ease-in-out motion-reduce:transition-none",
          collapsed ? "lg:pl-[64px]" : "lg:pl-[260px]",
          railOpen && "min-[1200px]:pr-[380px]",
        )}
      >
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              // `@container` so page grids can size to the ACTUAL content width
              // (which shrinks when the right rail is open) via `@`-breakpoints,
              // instead of the viewport — otherwise cards/charts smush when both
              // the sidebar and rail are open.
              "@container mx-auto w-full flex-1 px-4 py-8 transition-[max-width] duration-300 ease-in-out motion-reduce:transition-none sm:px-6 lg:px-8",
              collapsed ? "max-w-[1360px]" : "max-w-[1200px]",
            )}
          >
            <StorageWarningBanner />
            {children}
          </div>
        </div>
        <Footer collapsed={collapsed} />
      </main>
    </div>
  );
}
