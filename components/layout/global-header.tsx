"use client";

import {
  ArrowDownLeft,
  ArrowUpFromLine,
  ArrowUpRight,
  Bell,
  Combine,
  type LucideIcon,
  Lock,
  Mail,
  Monitor,
  Moon,
  PanelLeft,
  Pickaxe,
  Sun,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { SidebarContent } from "@/components/layout/sidebar";
import { WalletSwitcher } from "@/components/layout/wallet-switcher";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSidebarCollapse } from "@/components/layout/sidebar-collapse";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useTransactions, useWalletSyncStatus } from "@/lib/hooks";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/ui/theme";
import { useTheme } from "@/lib/ui/theme-provider";
import type { TransactionType } from "@/lib/types";
import { resolveUiTransactionType } from "@/lib/wallet-core/mappers";
import { cn, truncateAddress } from "@/lib/utils";

const THEME_META: Record<ThemePreference, { labelKey: string; icon: LucideIcon }> = {
  system: { labelKey: "theme.system", icon: Monitor },
  light: { labelKey: "theme.light", icon: Sun },
  dark: { labelKey: "theme.dark", icon: Moon },
};

/** Globally-accessible theme switch: cycles System → Light → Dark. */
function HeaderThemeToggle() {
  const { preference, setPreference } = useTheme();
  const { t } = useI18n();
  const { labelKey, icon: Icon } = THEME_META[preference];
  const label = t(labelKey);
  const next =
    THEME_PREFERENCES[(THEME_PREFERENCES.indexOf(preference) + 1) % THEME_PREFERENCES.length];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`${t("theme.label")}: ${label}. ${t("theme.switchTo", { name: t(THEME_META[next].labelKey) })}`}
          onClick={() => setPreference(next)}
          className="size-9 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Icon className="size-[18px]" aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{`${t("theme.label")}: ${label}`}</TooltipContent>
    </Tooltip>
  );
}

function SyncStatusPill() {
  const { isSyncing, syncPct } = useWalletSyncStatus();
  const { t } = useI18n();
  if (isSyncing) {
    return (
      <span className="hidden items-center gap-1.5 rounded-full bg-wallet-amber/12 px-3 py-1 text-xs font-semibold text-wallet-amber sm:flex">
        <span
          className="size-1.5 animate-pulse rounded-full bg-wallet-amber"
          aria-hidden="true"
        />
        {t("header.syncing", { pct: syncPct })}
      </span>
    );
  }
  return (
    <span className="hidden items-center gap-1.5 rounded-full bg-wallet-incoming/12 px-3 py-1 text-xs font-semibold text-wallet-incoming sm:flex">
      <span className="size-1.5 rounded-full bg-wallet-incoming" aria-hidden="true" />
      {t("header.synced")}
    </span>
  );
}

type NotifMeta = { titleKey: string; icon: LucideIcon; chip: string };

const NOTIF_META: Record<TransactionType, NotifMeta> = {
  receive: {
    titleKey: "header.notifReceived",
    icon: ArrowDownLeft,
    chip: "bg-wallet-incoming/14 text-wallet-incoming",
  },
  send: {
    titleKey: "header.notifSent",
    icon: ArrowUpRight,
    chip: "bg-wallet-outgoing/14 text-wallet-outgoing",
  },
  deposit: {
    titleKey: "header.notifDeposited",
    icon: Lock,
    chip: "bg-wallet-deposit/14 text-wallet-deposit",
  },
  withdrawal: {
    titleKey: "header.notifWithdrew",
    icon: ArrowUpFromLine,
    chip: "bg-wallet-incoming/14 text-wallet-incoming",
  },
  fusion: {
    titleKey: "header.notifFused",
    icon: Combine,
    chip: "bg-secondary text-muted-foreground",
  },
  miner: {
    titleKey: "header.notifMined",
    icon: Pickaxe,
    chip: "bg-wallet-incoming/14 text-wallet-incoming",
  },
  message: {
    titleKey: "header.notifNewMessage",
    icon: Mail,
    chip: "bg-primary/14 text-primary",
  },
};

function NotificationsButton() {
  const { data: txs = [] } = useTransactions();
  const fmt = useFormatters();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // In-memory "viewed" flag — the badge shows until the user opens the panel,
  // then stays cleared for the rest of the session. Real but simple.
  const [viewed, setViewed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const recent = useMemo(() => {
    return [...txs]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);
  }, [txs]);

  const hasUnread = !viewed && recent.length > 0;

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        close();
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  function toggle() {
    setOpen((value) => {
      const next = !value;
      if (next) setViewed(true);
      return next;
    });
  }

  function markAllRead() {
    setViewed(true);
  }

  return (
    <div ref={containerRef} className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={open ? t("header.closeNotifications") : t("header.openNotifications")}
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            onClick={toggle}
            className="relative size-9 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Bell className="size-[18px]" aria-hidden="true" />
            {hasUnread ? (
              <span
                className="absolute right-2 top-2 size-1.5 rounded-full bg-wallet-outgoing"
                aria-hidden="true"
              />
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("header.notifications")}</TooltipContent>
      </Tooltip>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={t("header.notifications")}
          className="absolute right-0 top-full z-50 mt-1.5 w-[320px] overflow-hidden rounded-xl border border-border bg-card shadow-[0_20px_50px_rgba(0,0,0,.5)]"
        >
          <div className="flex items-center border-b border-border/70 px-3.5 py-3 text-xs font-semibold">
            {t("header.notifications")}
            {recent.length > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="ml-auto cursor-pointer text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("header.markAllRead")}
              </button>
            ) : null}
          </div>
          {recent.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("header.noRecentActivity")}
            </div>
          ) : (
            recent.map((tx) => {
              const type = resolveUiTransactionType(tx);
              const meta = NOTIF_META[type];
              const Icon = meta.icon;
              return (
                <div
                  key={tx.id}
                  className="flex items-start gap-3 border-b border-border/70 px-3.5 py-3 last:border-b-0"
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-lg",
                      meta.chip,
                    )}
                    aria-hidden="true"
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-foreground">
                      {t(meta.titleKey, { amt: fmt.formatCcx(tx.amount) })}
                    </p>
                    <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                      {truncateAddress(tx.address, 6, 4)} · {fmt.timeAgo(tx.timestamp)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

function SidebarToggleButton() {
  const { collapsed, toggle } = useSidebarCollapse();
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <>
      {/* Desktop: collapse/expand the fixed sidenav. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={collapsed ? t("action.expandMenu") : t("action.collapseMenu")}
            onClick={toggle}
            className="hidden size-9 text-muted-foreground hover:bg-secondary hover:text-foreground lg:inline-flex"
          >
            <PanelLeft className="size-[18px]" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {collapsed ? t("action.expandMenu") : t("action.collapseMenu")}
        </TooltipContent>
      </Tooltip>

      {/* Mobile: open the drawer. */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("action.openNavigation")}
            className="size-9 text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden"
          >
            <PanelLeft className="size-[18px]" aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[290px] border-border bg-[hsl(var(--chrome))] p-0">
          <SidebarContent onNavigate={closeMobile} />
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * Sticky global top bar (#122, stage 1). Carries the sidebar toggle, Conceal
 * brand, the wallet switcher (its proper home), and global chrome: sync status,
 * notifications, and the theme switch (moved here from the sidebar footer).
 */
export function GlobalHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-card px-3 sm:gap-3 sm:px-4">
      <SidebarToggleButton />
      <Link
        href="/wallet/account"
        aria-label="Conceal wallet"
        className="flex shrink-0 items-center gap-2 rounded-md px-1 transition-opacity duration-200 hover:opacity-80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className="grid size-6 shrink-0 place-items-center rounded-md bg-gradient-to-br from-amber-400 to-amber-600 text-black"
          aria-hidden="true"
        >
          <Wallet className="size-3.5" />
        </span>
        <span className="hidden text-[14.5px] font-bold tracking-tight text-foreground sm:inline">
          Conceal
        </span>
      </Link>
      <div className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
      <WalletSwitcher variant="header" />
      <div className="ml-auto flex items-center gap-1">
        <SyncStatusPill />
        <NotificationsButton />
        <HeaderThemeToggle />
      </div>
    </header>
  );
}
