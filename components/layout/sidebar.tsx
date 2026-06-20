"use client";

import {
  BarChart3,
  BookOpen,
  CalendarClock,
  Coins,
  Download,
  Gift,
  HeartPulse,
  Home,
  LineChart,
  LogOut,
  Mail,
  Network,
  Plus,
  QrCode,
  Send,
  Settings,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavMessageBadge } from "@/components/layout/nav-message-badge";
import { useSidebarCollapse } from "@/components/layout/sidebar-collapse";
import { WalletAvatar } from "@/components/layout/wallet-switcher";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useWalletDisconnect } from "@/components/wallet/open-wallet-form";
import { useWallets } from "@/lib/hooks";
import {
  useAcknowledgeMessagesSinceOpen,
  useNewMessagesSinceOpen,
} from "@/lib/hooks/use-new-messages-since-open";
import { useOverdueCheckInCount } from "@/lib/hooks/use-check-ins";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { walletCopy } from "@/lib/ui/wallet-copy";
import { cn } from "@/lib/utils";

// `canCreate` marks items whose page has a create flow (add contact, new
// deposit, add reminder, compose message, watch a check-in) — the sidebar shows
// a trailing "+" affordance on those rows when expanded.
type NavItem = { href: string; labelKey: string; icon: LucideIcon; canCreate?: boolean };
type NavSectionDef = { label: string; items: NavItem[] };

// Nav is grouped into labeled sections (issue #122, stage 1). The section
// HEADERS are hardcoded English for now — a later #84 chunk localizes them (no
// new i18n keys yet, so the locale-parity test stays green). Each ITEM keeps its
// `t(labelKey)` accessible name so every locale still translates the links.
const NAV_SECTIONS: NavSectionDef[] = [
  {
    label: "Wallet",
    items: [
      { href: "/wallet/account", labelKey: "nav.account", icon: Home },
      { href: "/wallet/transactions", labelKey: "nav.transactions", icon: WalletCards },
      { href: "/wallet/send", labelKey: "nav.send", icon: Send },
      { href: "/wallet/receive", labelKey: "nav.receive", icon: QrCode },
      {
        href: "/wallet/address-book",
        labelKey: "nav.addressBook",
        icon: BookOpen,
        canCreate: true,
      },
      { href: "/wallet/messages", labelKey: "nav.messages", icon: Mail, canCreate: true },
      { href: "/wallet/export", labelKey: "nav.export", icon: Download },
    ],
  },
  {
    // "Banking" was renamed to "Earn" to avoid EU banking-terminology legal
    // ambiguity — deposits are an interest-bearing product, not a bank account.
    // Market + Insights live here too: price and performance frame the earn story.
    label: "Earn",
    items: [
      { href: "/wallet/deposits", labelKey: "nav.deposits", icon: Coins, canCreate: true },
      { href: "/wallet/market", labelKey: "nav.market", icon: BarChart3 },
      { href: "/wallet/insights", labelKey: "nav.insights", icon: LineChart },
    ],
  },
  {
    label: "More",
    items: [
      {
        href: "/wallet/scheduled",
        labelKey: "nav.reminders",
        icon: CalendarClock,
        canCreate: true,
      },
      { href: "/wallet/check-ins", labelKey: "nav.checkIns", icon: HeartPulse, canCreate: true },
      { href: "/wallet/network", labelKey: "nav.network", icon: Network },
      { href: "/wallet/donate", labelKey: "nav.donate", icon: Gift },
    ],
  },
];

function NavLink({
  item,
  collapsed = false,
  badge,
  onNavigate,
}: {
  item: NavItem;
  collapsed?: boolean;
  badge?: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const Icon = item.icon;
  const label = t(item.labelKey);
  const active = pathname === item.href;
  const showBadge = badge !== undefined && badge > 0 && !active;

  const link = (
    <Link
      href={item.href}
      aria-label={collapsed ? (showBadge ? `${label}, ${badge} new since open` : label) : undefined}
      onClick={onNavigate}
      className={cn(
        "flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-secondary hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        active &&
          "bg-wallet-amber/12 text-wallet-amber hover:bg-wallet-amber/12 hover:text-wallet-amber",
        // reserve room on the right for the overlaid quick-create button
        !collapsed && item.canCreate && !showBadge && "pr-10",
      )}
    >
      <span className={cn("relative shrink-0", collapsed && showBadge && "mr-auto")}>
        <Icon className="size-[17px]" aria-hidden="true" />
        {showBadge && collapsed ? (
          <NavMessageBadge count={badge} className="absolute -right-2 -top-2" />
        ) : null}
      </span>
      {!collapsed ? (
        <span
          className={cn(
            "min-w-0 flex-1 truncate whitespace-nowrap",
            showBadge && "font-semibold text-foreground",
          )}
        >
          {label}
        </span>
      ) : null}
      {!collapsed && showBadge ? (
        <NavMessageBadge count={badge} className="ml-auto shrink-0" />
      ) : null}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">
          {showBadge ? `${label} (+${badge > 99 ? "99" : badge} new)` : label}
        </TooltipContent>
      </Tooltip>
    );
  }

  // Creatable items get an overlaid "+" that deep-links to the page's create
  // flow (`?new=1`). It's a sibling of the row link (not nested — two <a> can't
  // nest) positioned over the row's right edge. Suppressed while a badge shows
  // so the two never collide.
  if (item.canCreate && !showBadge) {
    const createLabel = t("action.createNew", { name: label });
    return (
      <div className="relative">
        {link}
        <Link
          href={`${item.href}?new=1`}
          onClick={onNavigate}
          aria-label={createLabel}
          title={createLabel}
          className={cn(
            "absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 cursor-pointer place-items-center rounded-md transition-colors hover:bg-wallet-amber/15 hover:text-wallet-amber focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
            active ? "text-wallet-amber/80" : "text-muted-foreground/55",
          )}
        >
          <Plus className="size-4" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return link;
}

function NavSection({
  label,
  collapsed,
  first,
  children,
}: {
  label: string;
  collapsed: boolean;
  first: boolean;
  children: React.ReactNode;
}) {
  if (collapsed) {
    // No labels when collapsed; just space the section groups apart.
    return <div className={cn("flex flex-col", !first && "mt-2")}>{children}</div>;
  }
  return (
    <div className="flex flex-col">
      <div
        className={cn(
          "px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70",
          first ? "pb-1.5 pt-1" : "pb-1.5 pt-4",
        )}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function DisconnectButton({ collapsed }: { collapsed: boolean }) {
  const disconnect = useWalletDisconnect();
  const { t } = useI18n();
  const disconnectLabel = t("action.disconnect");

  return (
    <AlertDialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              aria-label={collapsed ? disconnectLabel : undefined}
              className="mt-2 h-11 w-full shrink-0 justify-start gap-3 px-3 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="size-[17px] shrink-0" aria-hidden="true" />
              <span
                className={cn(
                  "whitespace-nowrap transition-opacity duration-200 motion-reduce:transition-none",
                  collapsed && "pointer-events-none opacity-0",
                )}
                aria-hidden={collapsed}
              >
                {disconnectLabel}
              </span>
            </Button>
          </AlertDialogTrigger>
        </TooltipTrigger>
        {collapsed && <TooltipContent side="right">{disconnectLabel}</TooltipContent>}
      </Tooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect wallet?</AlertDialogTitle>
          <AlertDialogDescription>{walletCopy.disconnectConfirm}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={disconnect}
          >
            Disconnect
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SidebarFooter({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  const { data: wallets } = useWallets();
  const list = wallets ?? [];
  const active = list.find((wallet) => wallet.isActive) ?? list[0];
  const settingsLabel = t("nav.settings");

  // The wallet identity + settings gear are one button: the whole row links to
  // Settings (collapsed → a single centered gear). The wallet SWITCHER lives in
  // the global header, so this footer is purely "current wallet → its settings".
  return (
    <div className="border-t border-border px-3 py-3">
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/wallet/settings"
              onClick={onNavigate}
              aria-label={settingsLabel}
              className="mx-auto grid size-9 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-secondary hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Settings className="size-[18px]" aria-hidden="true" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{settingsLabel}</TooltipContent>
        </Tooltip>
      ) : (
        <Link
          href="/wallet/settings"
          onClick={onNavigate}
          aria-label={settingsLabel}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-200 hover:bg-secondary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          {active ? <WalletAvatar wallet={active} className="size-8" /> : null}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight text-foreground">
              {active?.label}
            </span>
            <span className="block text-[11px] leading-tight text-muted-foreground">
              {list.length} {list.length === 1 ? "wallet" : "wallets"}
            </span>
          </span>
          <Settings className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      )}
      <DisconnectButton collapsed={collapsed} />
    </div>
  );
}

export function SidebarContent({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const newMessages = useNewMessagesSinceOpen();
  const acknowledgeMessages = useAcknowledgeMessagesSinceOpen();
  const overdueCheckIns = useOverdueCheckInCount();

  function badgeFor(item: NavItem): number | undefined {
    if (item.href === "/wallet/messages") return newMessages;
    if (item.href === "/wallet/check-ins") return overdueCheckIns;
    return undefined;
  }

  function navigateFor(item: NavItem): (() => void) | undefined {
    if (item.href !== "/wallet/messages") return onNavigate;
    return () => {
      acknowledgeMessages();
      onNavigate?.();
    };
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-x-visible overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section, sectionIndex) => (
          <NavSection
            key={section.label}
            label={section.label}
            collapsed={collapsed}
            first={sectionIndex === 0}
          >
            {section.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                collapsed={collapsed}
                badge={badgeFor(item)}
                onNavigate={navigateFor(item)}
              />
            ))}
          </NavSection>
        ))}
      </nav>
      <SidebarFooter collapsed={collapsed} onNavigate={onNavigate} />
    </div>
  );
}

export function Sidebar() {
  const { collapsed } = useSidebarCollapse();
  // The mobile drawer + its toggle live in <GlobalHeader />; this is the
  // desktop rail only. Starts below the 56px header (top-14).

  return (
    <aside
      className={cn(
        "fixed bottom-0 left-0 top-14 z-30 hidden overflow-visible border-r border-border bg-[hsl(var(--chrome))] transition-[width] duration-300 ease-in-out motion-reduce:transition-none lg:block",
        collapsed ? "w-[64px]" : "w-[260px]",
      )}
    >
      <TooltipProvider>
        <SidebarContent collapsed={collapsed} />
      </TooltipProvider>
    </aside>
  );
}
