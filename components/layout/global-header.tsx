"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Check,
  Combine,
  Languages,
  Lock,
  type LucideIcon,
  Mail,
  Monitor,
  Moon,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pickaxe,
  Sun,
  Unlock,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRightRailContent } from "@/components/layout/right-rail";
import { SidebarContent } from "@/components/layout/sidebar";
import { useSidebarCollapse } from "@/components/layout/sidebar-collapse";
import { WalletSwitcher } from "@/components/layout/wallet-switcher";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTransactions, useWalletSyncStatus } from "@/lib/hooks";
import { LOCALES } from "@/lib/i18n/i18n";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useFormatters } from "@/lib/i18n/use-formatters";
import type { TransactionType } from "@/lib/types";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/ui/theme";
import { useTheme } from "@/lib/ui/theme-provider";
import { resolveUiTransactionType } from "@/lib/ui/transaction-kind";
import { cn, truncateAddress, withBasePath } from "@/lib/utils";

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
  const { info, isSyncing, syncPct } = useWalletSyncStatus();
  const { t } = useI18n();
  const fmt = useFormatters();

  // Block height shown only ≥ 1280px so the pill stays compact on mid-width
  // headers; hidden until the network tip is known. While syncing we show
  // current/tip to expose progress; once synced the two are equal, so a single
  // height is enough.
  const network = info?.networkHeight ?? 0;
  const heightText =
    network > 0
      ? isSyncing
        ? `${fmt.formatNumber(info?.currentHeight ?? 0)} / ${fmt.formatNumber(network)}`
        : fmt.formatNumber(network)
      : null;
  const height = heightText ? (
    <span className="hidden font-mono text-[11px] font-medium opacity-75 min-[1280px]:inline">
      · {heightText}
    </span>
  ) : null;

  if (isSyncing) {
    return (
      <span className="hidden items-center gap-1.5 rounded-full bg-wallet-amber/12 px-3 py-1 text-xs font-semibold text-wallet-amber sm:flex">
        <span className="size-1.5 animate-pulse rounded-full bg-wallet-amber" aria-hidden="true" />
        {t("header.syncing", { pct: syncPct })}
        {height}
      </span>
    );
  }
  return (
    <span className="hidden items-center gap-1.5 rounded-full bg-wallet-incoming/12 px-3 py-1 text-xs font-semibold text-wallet-incoming sm:flex">
      <span className="size-1.5 rounded-full bg-wallet-incoming" aria-hidden="true" />
      {t("header.synced")}
      {height}
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
    icon: Unlock,
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
                    className={cn("grid size-7 shrink-0 place-items-center rounded-lg", meta.chip)}
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

/** Header UI-language selector: a globe button opening a checked list of locales. */
function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
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

  return (
    <div ref={containerRef} className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("settings.languageAriaLabel")}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            onClick={() => setOpen((value) => !value)}
            className="size-9 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Languages className="size-[18px]" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("settings.language")}</TooltipContent>
      </Tooltip>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={t("settings.language")}
          className="absolute right-0 top-full z-50 mt-1.5 max-h-[70vh] w-[184px] overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.5)]"
        >
          {LOCALES.map(({ code, label }) => {
            const active = code === locale;
            return (
              <button
                key={code}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setLocale(code);
                  close();
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-200 hover:bg-secondary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                <span className="w-6 shrink-0 font-mono text-[11px] uppercase text-muted-foreground">
                  {code}
                </span>
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {active ? (
                  <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
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
            {/* Icon reflects state: "open" arrow when collapsed, "close" when expanded. */}
            {collapsed ? (
              <PanelLeftOpen className="size-[18px]" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="size-[18px]" aria-hidden="true" />
            )}
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
 * Far-right toggle for the contextual right rail — a mirror of the left sidebar's
 * collapse control. Only renders on pages that registered rail content, and only
 * at the rail breakpoint (≥ 1200px) where the rail column is actually visible.
 */
function RailToggleButton() {
  const { content, collapsed, setCollapsed } = useRightRailContent();
  const { t } = useI18n();
  if (content === null) return null;
  const label = collapsed ? t("rail.expandPanel") : t("rail.collapsePanel");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
          className="hidden size-9 text-muted-foreground hover:bg-secondary hover:text-foreground min-[1200px]:inline-flex"
        >
          {/* Icon reflects state: "open" arrow when collapsed, "close" when expanded. */}
          {collapsed ? (
            <PanelRightOpen className="size-[18px]" aria-hidden="true" />
          ) : (
            <PanelRightClose className="size-[18px]" aria-hidden="true" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Sticky global top bar (#122, stage 1). A three-column grid: brand + sidebar
 * toggle on the left, the wallet switcher CENTERED, and global chrome on the
 * right (sync status, notifications, theme switch, right-rail toggle).
 */
export function GlobalHeader() {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-40 grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border bg-card px-3 sm:gap-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <SidebarToggleButton />
        <Link
          href="/wallet/account"
          aria-label={t("nav.brandAria")}
          className="flex shrink-0 items-center gap-2 rounded-md px-1 transition-opacity duration-200 hover:opacity-80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img
            src={withBasePath("/brand/conceal-mark-orange.svg")}
            alt=""
            aria-hidden="true"
            width={24}
            height={24}
            className="size-6 shrink-0"
          />
          <span className="hidden text-[14.5px] font-bold tracking-tight text-foreground sm:inline">
            Conceal
          </span>
        </Link>
      </div>
      <div className="flex justify-center">
        <WalletSwitcher />
      </div>
      <div className="flex items-center justify-end gap-1">
        <SyncStatusPill />
        <NotificationsButton />
        <LanguageSwitcher />
        <HeaderThemeToggle />
        <RailToggleButton />
      </div>
    </header>
  );
}
