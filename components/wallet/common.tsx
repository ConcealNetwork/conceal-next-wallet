"use client";

import { Check, Clipboard, EyeOff, Inbox } from "lucide-react";
import { cloneElement, isValidElement, useState } from "react";
import { DottedQrCode } from "@/components/qr/dotted-qr";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Sparkline } from "@/components/ui/sparkline";
import { CcxAmount } from "@/components/wallet/ccx";
import { walletCopy } from "@/lib/ui/wallet-copy";
import { cn, withBasePath } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  action,
  badge,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {badge}
        </div>
        <p className="mt-2 text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

/** "View-only" pill for the page header — amber outline, distinct from the solid-orange active-nav pill. */
export function ViewOnlyBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-wallet-amber/40 px-2.5 py-0.5 text-xs font-semibold text-wallet-amber">
      <ViewOnlyBadgeIcon />
      {walletCopy.viewOnlyBadge}
    </span>
  );
}

function ViewOnlyBadgeIcon() {
  return <EyeOff className="size-3.5" aria-hidden="true" />;
}

export function SectionCard({
  title,
  description,
  headerAction,
  children,
  footer,
  fill = false,
  className,
}: {
  title?: string;
  description?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Stretch to fill the parent height and pin the footer to the bottom.
   *  Use only for equal-height cards laid out one-per-cell (e.g. account summary). */
  fill?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn("wallet-card", fill && "flex h-full flex-col", className)}>
      {(title || description || headerAction) && (
        <CardHeader>
          {title && <CardTitle>{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
          {headerAction ? <CardAction>{headerAction}</CardAction> : null}
        </CardHeader>
      )}
      <CardContent className={cn(fill && "flex flex-1 flex-col")}>{children}</CardContent>
      {footer ? (
        <div className={cn("border-t border-border px-6 pt-4", fill && "mt-auto")}>{footer}</div>
      ) : null}
    </Card>
  );
}

export function StatCard({
  label,
  value,
  detail,
  icon,
  trend,
  changePct,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  icon?: React.ReactNode;
  trend?: number[];
  changePct?: number;
  tone?: "default" | "incoming" | "outgoing" | "deposit" | "amber";
}) {
  const toneClass = {
    default: "text-foreground",
    incoming: "text-wallet-incoming",
    outgoing: "text-wallet-outgoing",
    deposit: "text-wallet-deposit",
    amber: "text-primary",
  }[tone];
  const hasTrend = trend && trend.length > 1 && typeof changePct === "number";
  const trendTone =
    (changePct ?? 0) >= 0
      ? "text-wallet-incoming bg-wallet-incoming/10"
      : "text-wallet-outgoing bg-wallet-outgoing/10";

  return (
    <Card className="wallet-card">
      <CardContent className="min-h-[150px]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={cn("mt-3 wrap-break-word text-2xl font-bold tracking-tight", toneClass)}>
              <CcxAmount>{value}</CcxAmount>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
          </div>
          {hasTrend ? (
            <span
              role="img"
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold",
                trendTone,
              )}
              aria-label={`${label} ${changePct >= 0 ? "up" : "down"} ${Math.abs(changePct).toFixed(2)} percent`}
            >
              <span aria-hidden="true">{changePct >= 0 ? "▲" : "▼"}</span>
              {Math.abs(changePct).toFixed(2)}%
            </span>
          ) : (
            icon && (
              <div className="rounded-xl bg-secondary p-3 text-primary">
                {isValidElement<{ className?: string }>(icon)
                  ? cloneElement(icon, { className: cn("size-5", icon.props.className) })
                  : icon}
              </div>
            )
          )}
        </div>
        {hasTrend && (
          <Sparkline
            values={trend}
            className="mt-4 h-10 w-full text-primary"
            width={260}
            height={40}
            padding={3}
            area
            animateArea
          />
        )}
      </CardContent>
    </Card>
  );
}

export function FilterTabs({
  tabs,
  active,
  onChange,
  badges,
  labels,
}: {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
  badges?: Partial<Record<string, React.ReactNode>>;
  // Optional display labels keyed by tab id (for i18n). When absent, the tab id
  // is shown verbatim — preserving the original behaviour for all callers.
  labels?: Partial<Record<string, string>>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={cn(
            "min-h-10 cursor-pointer rounded-xl border border-border px-4 text-sm text-muted-foreground transition-[border-color,color,background-color,transform] duration-200 hover:border-ring hover:text-foreground active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-reduce:active:scale-100 motion-reduce:transition-none",
            active === tab &&
              "border-primary bg-primary text-primary-foreground hover:text-primary-foreground",
          )}
        >
          <span className="inline-flex items-center gap-2">
            {labels?.[tab] ?? tab}
            {badges?.[tab] ? (
              <span
                className={cn(
                  "inline-flex min-w-5 items-center justify-center rounded-full border px-1.5 py-0.5 text-xs font-semibold",
                  active === tab
                    ? "border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground"
                    : "border-border bg-secondary text-foreground",
                )}
              >
                {badges[tab]}
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}

export function CopyButton({
  value,
  label = "Copy",
  iconOnly = false,
}: {
  value: string;
  label?: string;
  iconOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  // Bumped on every copy so the live-region text changes even on a repeat copy
  // within the 1.2s window (identical text wouldn't re-announce). The marker is
  // zero-width spaces — invisible on screen and silent to screen readers.
  const [copyNonce, setCopyNonce] = useState(0);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setCopyNonce((n) => n + 1);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={iconOnly ? "icon" : "default"}
        onClick={copy}
        aria-label={iconOnly ? label : undefined}
        className={cn(
          !iconOnly && "gap-2",
          "shrink-0 active:scale-[0.98] motion-reduce:active:scale-100",
        )}
      >
        {copied ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <Clipboard className="size-4" aria-hidden="true" />
        )}
        {!iconOnly ? (copied ? "Copied" : label) : null}
      </Button>
      {/* Sibling (not inside the button, so it stays out of the accessible name):
          announces the copy to screen readers since the icon swap is visual-only. */}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? `Copied to clipboard${"\u200B".repeat(copyNonce % 4)}` : ""}
      </span>
    </>
  );
}

export function WalletQrCode({
  value,
  size = 180,
  logoSrc,
  fullWidth = false,
}: {
  value: string;
  size?: number;
  /** Public path of the centre logo. Defaults to the orange Conceal mark. */
  logoSrc?: string;
  /** Stretch the QR to fill its container's width (square) instead of fixed `size`. */
  fullWidth?: boolean;
}) {
  // Level-H error correction leaves headroom for the underlying logo and the
  // dot styling without breaking scannability.
  return (
    <div
      className={cn(
        // Border + soft shadow so the white tile separates from a light card
        // surface (where bg-white would otherwise merge into it).
        "rounded-2xl border border-border bg-white p-4 shadow-sm",
        fullWidth ? "flex w-full" : "inline-flex",
      )}
    >
      <DottedQrCode
        value={value}
        size={size}
        className={fullWidth ? "h-auto w-full" : undefined}
        fgColor="#171513"
        bgColor="#ffffff"
        logoSrc={withBasePath(logoSrc ?? "/brand/conceal-mark-orange.svg")}
      />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  illustration,
}: {
  title: string;
  description: string;
  /** Optional branded spot illustration (public path). Falls back to the inbox glyph. */
  illustration?: string;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/60 p-8 text-center">
      {illustration ? (
        <img
          src={withBasePath(illustration)}
          alt=""
          className="size-24 rounded-2xl border border-border object-cover shadow-[0_12px_36px_rgba(0,0,0,0.35)]"
        />
      ) : (
        <div className="grid size-12 place-items-center rounded-xl bg-card text-muted-foreground">
          <Inbox className="size-5" aria-hidden="true" />
        </div>
      )}
      <p className="mt-4 font-semibold text-foreground">{title}</p>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
