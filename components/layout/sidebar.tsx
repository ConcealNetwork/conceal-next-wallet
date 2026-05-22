"use client"

import {
  BarChart3,
  BookOpen,
  Coins,
  Download,
  Gift,
  Home,
  LogOut,
  Mail,
  Menu,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  QrCode,
  Send,
  Settings,
  WalletCards,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
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
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useSidebarCollapse } from "@/components/layout/sidebar-collapse"
import { cn } from "@/lib/utils"
import { useWalletSession } from "@/lib/session/wallet-session"

const mainNav = [
  { href: "/wallet/account", label: "Account", icon: Home },
  { href: "/wallet/market", label: "Market", icon: BarChart3 },
  { href: "/wallet/transactions", label: "Transactions", icon: WalletCards },
  { href: "/wallet/send", label: "Send", icon: Send },
  { href: "/wallet/receive", label: "Receive", icon: QrCode },
  { href: "/wallet/messages", label: "Messages", icon: Mail },
  { href: "/wallet/deposits", label: "Deposits", icon: Coins },
  { href: "/wallet/address-book", label: "Address Book", icon: BookOpen },
]

const bottomNav = [
  { href: "/wallet/settings", label: "Settings", icon: Settings },
  { href: "/wallet/export", label: "Export", icon: Download },
  { href: "/wallet/network", label: "Network", icon: Network },
  { href: "/wallet/donate", label: "Donate", icon: Gift },
]

function NavLink({ item, collapsed = false }: { item: (typeof mainNav)[number]; collapsed?: boolean }) {
  const pathname = usePathname()
  const Icon = item.icon
  const active = pathname === item.href

  const link = (
    <Link
      href={item.href}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "flex min-h-11 cursor-pointer items-center rounded-xl text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        collapsed ? "justify-center px-0" : "gap-3 px-4",
        active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  )

  if (!collapsed) {
    return link
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  )
}

function DisconnectButton({ collapsed }: { collapsed: boolean }) {
  const { closeSession } = useWalletSession()

  return (
    <AlertDialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              aria-label={collapsed ? "Disconnect" : undefined}
              className={cn(
                "mt-4 h-11 shrink-0 gap-3 text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
                collapsed ? "w-full justify-center px-0" : "justify-start px-4"
              )}
            >
              <LogOut className="size-4" aria-hidden="true" />
              {!collapsed && <span>Disconnect</span>}
            </Button>
          </AlertDialogTrigger>
        </TooltipTrigger>
        {collapsed && <TooltipContent side="right">Disconnect</TooltipContent>}
      </Tooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect wallet?</AlertDialogTitle>
          <AlertDialogDescription>
            This clears the current mock wallet session and returns you to the open wallet screen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={closeSession}>
            Disconnect
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function SidebarContent({ collapsed = false, showToggle = false }: { collapsed?: boolean; showToggle?: boolean }) {
  const { toggle } = useSidebarCollapse()
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose

  return (
    <div className={cn("flex h-full flex-col bg-background py-5", collapsed ? "px-2" : "px-4")}>
      <div className={cn("mb-8 flex", collapsed ? "flex-col items-center gap-3" : "items-center gap-2")}>
        <Link
          href="/wallet/account"
          aria-label={collapsed ? "Conceal Wallet" : undefined}
          className={cn(
            "flex cursor-pointer items-center rounded-xl py-1 transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            collapsed ? "justify-center px-0" : "min-w-0 flex-1 gap-3 px-2"
          )}
        >
          <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <WalletCards className="size-5" aria-hidden="true" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-lg font-bold text-foreground">Conceal Wallet</p>
              <p className="text-xs text-muted-foreground">Mock CCX interface</p>
            </div>
          )}
        </Link>
        {showToggle && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            onClick={toggle}
            className="shrink-0 cursor-pointer text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ToggleIcon className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {mainNav.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} />
        ))}
        <div className="my-4 border-t border-border" />
        {bottomNav.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} />
        ))}
      </nav>
      <DisconnectButton collapsed={collapsed} />
    </div>
  )
}

export function Sidebar() {
  const { collapsed } = useSidebarCollapse()

  return (
    <>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden border-r border-border transition-[width] duration-200 motion-reduce:transition-none lg:block",
          collapsed ? "w-[64px]" : "w-[260px]"
        )}
      >
        <TooltipProvider>
          <SidebarContent collapsed={collapsed} showToggle />
        </TooltipProvider>
      </aside>
      <div className="sticky top-0 z-40 flex h-16 items-center border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Open navigation">
              <Menu className="size-5" aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[290px] border-border bg-background p-0">
            <SidebarContent />
          </SheetContent>
        </Sheet>
        <p className="ml-3 text-base font-semibold">Conceal Wallet</p>
      </div>
    </>
  )
}
