import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { COIN_UNIT_PLACES } from "@/lib/config/config";
import type { CcxAmount, UsdAmount } from "@/lib/types";
import { getDisplayTicker } from "@/lib/ui/ticker-preference";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Prefix a root-relative public asset path with the deploy base path (e.g.
 *  "/conceal-next-wallet" on GitHub Pages). Leaves absolute URLs and data: URIs
 *  untouched. Use for raw references Next does not prefix automatically —
 *  `<img src>`, CSS `url()`, QR image settings. */
export function withBasePath(path: string): string {
  if (!path.startsWith("/")) return path;
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;
}

export const CCX_ATOMIC_UNITS = 10 ** COIN_UNIT_PLACES;
// CCX is shown at full 6-decimal precision across the app (USD stays 2dp). This
// is the default for `formatCcx`; callers can still pass an explicit decimals arg.
export const CCX_HUMAIN_DECIMAL_DISPLAY = COIN_UNIT_PLACES;
export const CCX_PRECISION_DECIMAL_DISPLAY = COIN_UNIT_PLACES;

export function ccxAmount(ccx: number): CcxAmount {
  return { atomic: Math.round(ccx * CCX_ATOMIC_UNITS) };
}

export function usdAmount(usd: number): UsdAmount {
  return { value: usd };
}

export function ccxToNumber(amount: CcxAmount): number {
  return amount.atomic / CCX_ATOMIC_UNITS;
}

export function walletBalanceUsd(balance: CcxAmount, priceUsd: number): number {
  return ccxToNumber(balance) * priceUsd;
}

/**
 * Default BCP-47 locale for the bare (non-hook) formatters. Matches the wallet's
 * source language so existing tests and non-component callers keep today's output.
 * Locale-aware UI should call the `useFormatters()` hook (see `lib/i18n`).
 */
export const DEFAULT_FORMAT_LOCALE = "en-US";

export function formatCcx(
  amount: CcxAmount | number,
  decimals = CCX_HUMAIN_DECIMAL_DISPLAY,
  trimTrailingZeros = false,
  locale: string = DEFAULT_FORMAT_LOCALE,
): string {
  const value = typeof amount === "number" ? amount : ccxToNumber(amount);
  return `${value.toLocaleString(locale, {
    minimumFractionDigits: trimTrailingZeros ? 0 : decimals,
    maximumFractionDigits: decimals,
  })} ${getDisplayTicker()}`;
}

export { stripTickerSuffix } from "@/lib/ui/ticker-preference";

export function formatUsd(
  amount: UsdAmount | number,
  decimals = 2,
  locale: string = DEFAULT_FORMAT_LOCALE,
): string {
  const value = typeof amount === "number" ? amount : amount.value;
  return `$${value.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * Fiat subline for a CCX amount, e.g. `"$4.50 USD"`. Returns `undefined` when the
 * price is unknown/zero so the UI can hide the line instead of flashing `$0.00`.
 */
export function usdSubline(ccx: number, priceUsd: number): string | undefined {
  return priceUsd > 0 ? `${formatUsd(ccx * priceUsd)} USD` : undefined;
}

export function truncateAddress(address: string, head = 8, tail = 6): string {
  if (address.length <= head + tail + 3) return address;
  return `${address.slice(0, head)}...${address.slice(-tail)}`;
}

/** A bucketed past duration: the largest whole unit that fits, plus its count. */
type RelativeBucket =
  | { kind: "now" }
  | { kind: "unit"; value: number; unit: Intl.RelativeTimeFormatUnit };

/** Bucket an elapsed (non-negative) span in seconds into the unit `timeAgo` shows. */
function bucketElapsedSeconds(seconds: number): RelativeBucket {
  if (seconds < 60) return { kind: "now" };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { kind: "unit", value: minutes, unit: "minute" };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { kind: "unit", value: hours, unit: "hour" };
  const days = Math.floor(hours / 24);
  if (days < 30) return { kind: "unit", value: days, unit: "day" };
  const months = Math.floor(days / 30);
  if (months < 12) return { kind: "unit", value: months, unit: "month" };
  return { kind: "unit", value: Math.floor(months / 12), unit: "year" };
}

/**
 * Compact relative time (e.g. `"5m ago"`).
 *
 * With no `locale`, returns the wallet's original English shorthand (`"just now"`,
 * `"5m ago"`, `"3mo ago"`) so existing tests and non-component callers are
 * unchanged. With a `locale`, formats the same bucket via `Intl.RelativeTimeFormat`
 * (narrow style) so e.g. `es` renders `"hace 5 min"`. Locale-aware UI should use
 * the `useFormatters()` hook rather than passing `locale` directly.
 */
export function timeAgo(date: string | Date, now = new Date(), locale?: string): string {
  const timestamp = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.max(0, Math.floor((now.getTime() - timestamp.getTime()) / 1000));
  const bucket = bucketElapsedSeconds(seconds);

  if (locale === undefined) {
    // Original behavior — preserved exactly for backward compatibility.
    if (bucket.kind === "now") return "just now";
    const suffix: Partial<Record<Intl.RelativeTimeFormatUnit, string>> = {
      minute: "m",
      hour: "h",
      day: "d",
      month: "mo",
      year: "y",
    };
    return `${bucket.value}${suffix[bucket.unit] ?? ""} ago`;
  }

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "narrow" });
  if (bucket.kind === "now") return formatter.format(0, "second");
  return formatter.format(-bucket.value, bucket.unit);
}
