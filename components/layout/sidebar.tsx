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
  QrCode,
  Send,
  Settings,
  WalletCards,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
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

function NavLink({ item }: { item: (typeof mainNav)[number] }) {
  const pathname = usePathname()
  const Icon = item.icon
  const active = pathname === item.href

  return (
    <Link
      href={item.href}
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-4 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  )
}

function SidebarContent() {
  const { closeSession } = useWalletSession()

  return (
    <div className="flex h-full flex-col bg-background px-4 py-5">
      <Link
        href="/wallet/account"
        className="mb-8 flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1 transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
          <WalletCards className="size-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-lg font-bold text-white">Conceal Wallet</p>
          <p className="text-xs text-muted-foreground">Mock CCX interface</p>
        </div>
      </Link>
      <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {mainNav.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
        <div className="my-4 border-t border-border" />
        {bottomNav.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>
      <Button
        type="button"
        variant="ghost"
        className="mt-4 h-11 shrink-0 justify-start gap-3 px-4 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        onClick={closeSession}
      >
        <LogOut className="size-4" aria-hidden="true" />
        Disconnect
      </Button>
    </div>
  )
}

export function Sidebar() {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] border-r border-border lg:block">
        <SidebarContent />
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
