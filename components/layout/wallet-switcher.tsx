"use client";

import { Check, ChevronDown, ChevronsUpDown, Download, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useSwitchWalletFlow } from "@/components/wallet/open-wallet-form";
import { useWalletInfo, useWallets } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useFormatters } from "@/lib/i18n/use-formatters";
import type { WalletSummary } from "@/lib/types";
import { cn, truncateAddress } from "@/lib/utils";

/** First grapheme of a label, uppercased — the avatar glyph (matches the mockup). */
function initial(label: string): string {
  const trimmed = label.trim();
  return trimmed ? trimmed[0].toUpperCase() : "•";
}

/**
 * Conceal wallet avatar — the "Ceramic Keycap Tile" (design round 2). A matte,
 * manufactured keycap with the wallet's initial debossed in brand orange; styling
 * (incl. the dark/light-theme treatments) lives in the `.wallet-keycap` class in
 * `app/globals.css`. CSS-only so it carries any initial; size/text from `className`.
 *
 * Square by default (sidebar footer, switcher dropdown, settings). The header
 * switcher trigger passes `round` for a circular keycap so it reads as the
 * primary, always-on-screen wallet marker.
 */
export function WalletAvatar({
  wallet,
  className,
  round = false,
}: {
  wallet: WalletSummary;
  className?: string;
  round?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "wallet-keycap grid size-7 shrink-0 place-items-center text-xs leading-none",
        round && "wallet-keycap-round",
        className,
      )}
    >
      {initial(wallet.label)}
    </span>
  );
}

type WalletSwitcherVariant = "sidebar" | "header";

/**
 * Wallet switcher (#95, design Option A). Shows the active wallet; click → a
 * dropdown panel listing every wallet (active gets a check) plus "Add wallet".
 *
 * Two trigger variants share one dropdown:
 *  - `sidebar` (default): full-width card under the brand; hidden when the
 *    sidebar is collapsed (the brand label is too).
 *  - `header`: a compact rounded pill (avatar + name + truncated address +
 *    chevrons-up-down) for the global header. Ignores `collapsed`.
 *
 * The trigger's accessible name is always `wallets.switcherLabel` ("Switch
 * wallet") — the multi-wallet e2e clicks `getByRole("button", { name:
 * "Switch wallet" })` — and the dropdown menu shares that name.
 */
export function WalletSwitcher({
  collapsed = false,
  variant = "sidebar",
}: {
  collapsed?: boolean;
  variant?: WalletSwitcherVariant;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { data: wallets } = useWallets();
  const activeInfo = useWalletInfo();
  const { formatCcx } = useFormatters();
  const switchWallet = useSwitchWalletFlow();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback(() => setOpen(false), []);

  // Close on outside click / Escape while the panel is open.
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

  const list = wallets ?? [];
  const active = list.find((wallet) => wallet.isActive) ?? list[0];
  // Nothing to switch when there's at most one wallet — but still surface "Add".
  if (!active) return null;
  // Only the sidebar variant hides itself when the rail collapses.
  if (variant === "sidebar" && collapsed) return null;

  function handleSwitch(id: string) {
    close();
    if (id === active?.id) return;
    switchWallet(id);
  }

  function goTo(path: string) {
    close();
    router.push(path);
  }

  const switcherLabel = t("wallets.switcherLabel");

  // The active wallet's balance comes from the live `getWalletInfo` (current in
  // both modes); other wallets use the summary's balance (mock fills it; real
  // mode leaves it undefined for locked wallets, so they show no balance).
  function balanceFor(wallet: WalletSummary): string | null {
    const amount = wallet.isActive
      ? (activeInfo.data?.balanceTotal ?? wallet.balanceTotal)
      : wallet.balanceTotal;
    return amount ? formatCcx(amount) : null;
  }

  const trigger =
    variant === "header" ? (
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={switcherLabel}
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-[360px] cursor-pointer items-center gap-2.5 rounded-full border border-border bg-background/60 py-1.5 pr-3 pl-2 text-left transition-colors duration-200 hover:bg-secondary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <WalletAvatar round wallet={active} className="size-6 text-[11px]" />
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-[13px] font-semibold leading-tight text-foreground">
            {active.label}
          </span>
          {balanceFor(active) ? (
            <span className="block truncate font-mono text-[10.5px] leading-tight text-muted-foreground">
              {balanceFor(active)}
            </span>
          ) : null}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    ) : (
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={switcherLabel}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-12 w-full cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-card/60 px-2.5 py-2 text-left transition-colors duration-200 hover:bg-secondary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <WalletAvatar wallet={active} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">
            {active.label}
          </span>
          {balanceFor(active) ? (
            <span className="block truncate font-mono text-[11px] text-muted-foreground">
              {balanceFor(active)}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
    );

  return (
    <div ref={containerRef} className={variant === "sidebar" ? "relative px-3" : "relative"}>
      {trigger}
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={switcherLabel}
          className={
            variant === "header"
              ? "absolute left-0 top-full z-50 mt-1.5 w-[260px] rounded-xl border border-border bg-card p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.5)]"
              : "absolute right-3 left-3 z-50 mt-1.5 rounded-xl border border-border bg-card p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.5)]"
          }
        >
          {list.map((wallet) => (
            <button
              key={wallet.id}
              type="button"
              role="menuitemradio"
              aria-checked={wallet.isActive}
              aria-label={
                wallet.isActive
                  ? `${wallet.label} (${t("wallets.active")})`
                  : t("wallets.switchTo", { name: wallet.label })
              }
              onClick={() => handleSwitch(wallet.id)}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-200 hover:bg-secondary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                wallet.isActive && "bg-secondary",
              )}
            >
              <WalletAvatar wallet={wallet} className="size-10 text-sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{wallet.label}</span>
                {balanceFor(wallet) ? (
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                    {balanceFor(wallet)}
                  </span>
                ) : null}
                {wallet.address ? (
                  <span className="block truncate font-mono text-[10.5px] text-muted-foreground/70">
                    {truncateAddress(wallet.address, 6, 4)}
                  </span>
                ) : null}
              </span>
              {wallet.isActive ? (
                <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
              ) : null}
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => goTo("/create")}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-4 shrink-0" aria-hidden="true" />
            {t("wallets.create")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => goTo("/import")}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Download className="size-4 shrink-0" aria-hidden="true" />
            {t("wallets.import")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
