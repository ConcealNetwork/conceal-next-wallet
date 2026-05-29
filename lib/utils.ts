import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { CcxAmount, UsdAmount } from "@/lib/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Prefix a root-relative public asset path with the deploy base path (e.g.
 *  "/conceal-next-wallet" on GitHub Pages). Leaves absolute URLs and data: URIs
 *  untouched. Use for raw references Next does not prefix automatically —
 *  `<img src>`, CSS `url()`, QR image settings. */
export function withBasePath(path: string): string {
  if (!path.startsWith("/")) return path
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`
}

export const CCX_ATOMIC_UNITS = 1_000_000

export function ccxAmount(ccx: number): CcxAmount {
  return { atomic: Math.round(ccx * CCX_ATOMIC_UNITS) }
}

export function usdAmount(usd: number): UsdAmount {
  return { value: usd }
}

export function ccxToNumber(amount: CcxAmount): number {
  return amount.atomic / CCX_ATOMIC_UNITS
}

export function formatCcx(amount: CcxAmount | number, decimals = 2): string {
  const value = typeof amount === "number" ? amount : ccxToNumber(amount)
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} CCX`
}

export function formatUsd(amount: UsdAmount | number, decimals = 4): string {
  const value = typeof amount === "number" ? amount : amount.value
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

export function truncateAddress(address: string, head = 8, tail = 6): string {
  if (address.length <= head + tail + 3) return address
  return `${address.slice(0, head)}...${address.slice(-tail)}`
}

export function timeAgo(date: string | Date, now = new Date()): string {
  const timestamp = typeof date === "string" ? new Date(date) : date
  const seconds = Math.max(0, Math.floor((now.getTime() - timestamp.getTime()) / 1000))
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}
