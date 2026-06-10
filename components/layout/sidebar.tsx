"use client";

import { useCallback, useState } from "react";
import {
  BarChart3,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Coins,
  Download,
  Gift,
  Home,
  LogOut,
  Mail,
  Menu,
  Network,
  QrCode,
  Send,
  Settings,
  Wallet,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSidebarCollapse } from "@/components/layout/sidebar-collapse";
import { NavMessageBadge } from "@/components/layout/nav-message-badge";
import { cn } from "@/lib/utils";
import {
  useAcknowledgeMessagesSinceOpen,
  useNewMessagesSinceOpen,
} from "@/lib/hooks/use-new-messages-since-open";
import { useWalletDisconnect } from "@/components/wallet/open-wallet-form";
import { walletCopy } from "@/lib/ui/wallet-copy";

const mainNav = [
  { href: "/wallet/account", label: "Account", icon: Home },
  { href: "/wallet/market", label: "Market", icon: BarChart3 },
  { href: "/wallet/transactions", label: "Transactions", icon: WalletCards },
  { href: "/wallet/send", label: "Send", icon: Send },
  { href: "/wallet/receive", label: "Receive", icon: QrCode },
  { href: "/wallet/deposits", label: "Deposits", icon: Coins },
  { href: "/wallet/messages", label: "Messages", icon: Mail },
  { href: "/wallet/address-book", label: "Address Book", icon: BookOpen },
];

const bottomNav = [
  { href: "/wallet/settings", label: "Settings", icon: Settings },
  { href: "/wallet/export", label: "Export", icon: Download },
  { href: "/wallet/network", label: "Network", icon: Network },
  { href: "/wallet/donate", label: "Donate", icon: Gift },
];

function NavLink({
  item,
  collapsed = false,
  badge,
  onNavigate,
}: {
  item: (typeof mainNav)[number];
  collapsed?: boolean;
  badge?: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const Icon = item.icon;
  const active = pathname === item.href;
  const showBadge = badge !== undefined && badge > 0 && !active;

  const link = (
    <Link
      href={item.href}
      aria-label={
        collapsed ? (showBadge ? `${item.label}, ${badge} new since open` : item.label) : undefined
      }
      onClick={onNavigate}
      className={cn(
        "flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-secondary hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        active &&
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
      )}
    >
      <span className={cn("relative shrink-0", collapsed && showBadge && "mr-auto")}>
        <Icon className="size-4" aria-hidden="true" />
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
          {item.label}
        </span>
      ) : null}
      {showBadge && !collapsed ? (
        <NavMessageBadge count={badge} className="ml-auto shrink-0" />
      ) : null}
    </Link>
  );

  if (!collapsed) {
    return link;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {showBadge ? `${item.label} (+${badge > 99 ? "99" : badge} new)` : item.label}
      </TooltipContent>
    </Tooltip>
  );
}

function DisconnectButton({ collapsed }: { collapsed: boolean }) {
  const disconnect = useWalletDisconnect();

  return (
    <AlertDialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              aria-label={collapsed ? "Disconnect" : undefined}
              className="mt-4 h-11 w-full shrink-0 justify-start gap-3 px-3 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="size-4 shrink-0" aria-hidden="true" />
              <span
                className={cn(
                  "whitespace-nowrap transition-opacity duration-200 motion-reduce:transition-none",
                  collapsed && "pointer-events-none opacity-0",
                )}
                aria-hidden={collapsed}
              >
                Disconnect
              </span>
            </Button>
          </AlertDialogTrigger>
        </TooltipTrigger>
        {collapsed && <TooltipContent side="right">Disconnect</TooltipContent>}
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

function SidebarContent({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const newMessages = useNewMessagesSinceOpen();
  const acknowledgeMessages = useAcknowledgeMessagesSinceOpen();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[hsl(var(--chrome))] px-3 py-5">
      <div className="mb-8 flex h-10 items-center">
        <Link
          href="/wallet/account"
          aria-label="Conceal Wallet"
          onClick={onNavigate}
          className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-3 transition-opacity duration-200 hover:opacity-80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Wallet className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span
            className={cn(
              "whitespace-nowrap text-lg font-bold text-foreground transition-opacity duration-200 motion-reduce:transition-none",
              collapsed && "pointer-events-none opacity-0",
            )}
            aria-hidden={collapsed}
          >
            Conceal Wallet
          </span>
        </Link>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-x-visible overflow-y-auto">
        {mainNav.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            collapsed={collapsed}
            badge={item.href === "/wallet/messages" ? newMessages : undefined}
            onNavigate={
              item.href === "/wallet/messages"
                ? () => {
                    acknowledgeMessages();
                    onNavigate?.();
                  }
                : onNavigate
            }
          />
        ))}
        <div className="my-4 border-t border-border" />
        {bottomNav.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </nav>
      <DisconnectButton collapsed={collapsed} />
    </div>
  );
}

export function Sidebar() {
  const { collapsed, toggle } = useSidebarCollapse();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobileNav = useCallback(() => setMobileOpen(false), []);
  const EdgeToggleIcon = collapsed ? ChevronRight : ChevronLeft;

  return (
    <>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden overflow-visible border-r border-border transition-[width] duration-300 ease-in-out motion-reduce:transition-none lg:block",
          collapsed ? "w-[64px]" : "w-[260px]",
        )}
      >
        <TooltipProvider>
          <SidebarContent collapsed={collapsed} />
          <Button
            type="button"
            variant="ghost"
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            onClick={toggle}
            className="absolute right-0 top-7 z-50 size-7 min-h-0 translate-x-1/2 rounded-full border border-border bg-card p-0 text-muted-foreground shadow-xs hover:bg-secondary hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <EdgeToggleIcon className="size-4" aria-hidden="true" />
          </Button>
        </TooltipProvider>
      </aside>
      <div className="sticky top-0 z-40 flex h-16 items-center border-b border-border bg-background/95 px-4 backdrop-blur-sm lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Open navigation">
              <Menu className="size-5" aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[290px] border-border bg-[hsl(var(--chrome))] p-0">
            <SidebarContent onNavigate={closeMobileNav} />
          </SheetContent>
        </Sheet>
        <p className="ml-3 text-base font-semibold">Conceal Wallet</p>
      </div>
    </>
  );
}
