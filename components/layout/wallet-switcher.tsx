"use client";

import { Check, ChevronDown, Download, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useSwitchWalletFlow } from "@/components/wallet/open-wallet-form";
import { useWallets } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { WalletSummary } from "@/lib/types";
import { truncateAddress } from "@/lib/utils";
import { cn } from "@/lib/utils";

/** First grapheme of a label, uppercased — the avatar glyph (matches the mockup). */
function initial(label: string): string {
  const trimmed = label.trim();
  return trimmed ? trimmed[0].toUpperCase() : "•";
}

/** A stable accent class per wallet, so each avatar gets a consistent colour. */
const AVATAR_ACCENTS = [
  "bg-gradient-to-br from-amber-300 to-amber-500 text-black",
  "bg-gradient-to-br from-sky-300 to-blue-500 text-white",
  "bg-gradient-to-br from-green-300 to-green-600 text-white",
  "bg-gradient-to-br from-fuchsia-300 to-purple-500 text-white",
] as const;

function accentFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_ACCENTS[hash % AVATAR_ACCENTS.length];
}

function WalletAvatar({ wallet, className }: { wallet: WalletSummary; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold",
        accentFor(wallet.id),
        className,
      )}
    >
      {initial(wallet.label)}
    </span>
  );
}

/**
 * Sidebar-header wallet switcher (#95, design Option A). Shows the active wallet
 * under the brand; click → a dropdown panel listing every wallet (active gets a
 * check) plus "Add wallet". Hidden when collapsed (the brand label is too).
 */
export function WalletSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const { data: wallets } = useWallets();
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

  // Collapse hides the brand label; keep the switcher out of the way too.
  if (collapsed) return null;

  const list = wallets ?? [];
  const active = list.find((wallet) => wallet.isActive) ?? list[0];
  // Nothing to switch when there's at most one wallet — but still surface "Add".
  if (!active) return null;

  function handleSwitch(id: string) {
    close();
    if (id === active?.id) return;
    switchWallet(id);
  }

  function goTo(path: string) {
    close();
    router.push(path);
  }

  return (
    <div ref={containerRef} className="relative px-3">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t("wallets.switcherLabel")}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-12 w-full cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-card/60 px-2.5 py-2 text-left transition-colors duration-200 hover:bg-secondary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <WalletAvatar wallet={active} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">
            {active.label}
          </span>
          {active.address ? (
            <span className="block truncate font-mono text-[11px] text-muted-foreground">
              {truncateAddress(active.address, 6, 4)}
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

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={t("wallets.switcherLabel")}
          className="absolute left-3 right-3 z-50 mt-1.5 rounded-xl border border-border bg-card p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.5)]"
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
              <WalletAvatar wallet={wallet} />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {wallet.label}
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
