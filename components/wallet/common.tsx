"use client"

import { Check, Clipboard, Inbox } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { cloneElement, isValidElement, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Transaction, TransactionType } from "@/lib/types"
import { cn, formatCcx, timeAgo, truncateAddress } from "@/lib/utils"

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">{title}</h1>
        <p className="mt-2 text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  )
}

export function SectionCard({
  title,
  description,
  children,
  footer,
  fill = false,
  className,
}: {
  title?: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  /** Stretch to fill the parent height and pin the footer to the bottom.
   *  Use only for equal-height cards laid out one-per-cell (e.g. account summary). */
  fill?: boolean
  className?: string
}) {
  return (
    <Card className={cn("wallet-card", fill && "flex h-full flex-col", className)}>
      {(title || description) && (
        <CardHeader>
          {title && <CardTitle>{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent className={cn(fill && "flex flex-1 flex-col")}>{children}</CardContent>
      {footer ? <div className={cn("border-t border-border px-6 pt-4", fill && "mt-auto")}>{footer}</div> : null}
    </Card>
  )
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
  label: string
  value: string
  detail: string
  icon?: React.ReactNode
  trend?: number[]
  changePct?: number
  tone?: "default" | "incoming" | "outgoing" | "deposit" | "amber"
}) {
  const toneClass = {
    default: "text-white",
    incoming: "text-wallet-incoming",
    outgoing: "text-wallet-outgoing",
    deposit: "text-wallet-deposit",
    amber: "text-primary",
  }[tone]
  const hasTrend = trend && trend.length > 1 && typeof changePct === "number"
  const trendTone = (changePct ?? 0) >= 0 ? "text-wallet-incoming bg-wallet-incoming/10" : "text-wallet-outgoing bg-wallet-outgoing/10"

  return (
    <Card className="wallet-card">
      <CardContent className="min-h-[150px]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={cn("mt-3 wrap-break-word text-2xl font-bold tracking-tight", toneClass)}>{value}</p>
            <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
          </div>
          {hasTrend ? (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold",
                trendTone
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
        {hasTrend && <InlineSparkline values={trend} className="mt-4" />}
      </CardContent>
    </Card>
  )
}

function InlineSparkline({ values, className }: { values: number[]; className?: string }) {
  const width = 260
  const height = 40
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = width / (values.length - 1)
  const points = values
    .map((value, index) => {
      const x = index * step
      const y = height - ((value - min) / range) * (height - 6) - 3
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(" ")
  const areaPoints = `0,${height} ${points} ${width},${height}`

  return (
    <svg
      aria-hidden="true"
      className={cn("h-10 w-full text-primary", className)}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <polygon className="animate-fade-in motion-reduce:animate-none motion-reduce:opacity-100" points={areaPoints} fill="hsl(var(--primary) / 0.08)" />
      <polyline
        className="animate-stroke-draw motion-reduce:animate-none"
        points={points}
        fill="none"
        pathLength={1}
        stroke="currentColor"
        strokeDasharray={1}
        strokeDashoffset={0}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export function AmountText({ amount, type }: { amount: string; type: TransactionType | "positive" | "negative" }) {
  const color =
    type === "send" || type === "withdrawal" || type === "negative"
      ? "text-wallet-outgoing"
      : type === "deposit"
        ? "text-wallet-deposit"
        : "text-wallet-incoming"
  return <span className={cn("font-semibold", color)}>{amount}</span>
}

export function FilterTabs({
  tabs,
  active,
  onChange,
  badges,
}: {
  tabs: string[]
  active: string
  onChange: (tab: string) => void
  badges?: Partial<Record<string, React.ReactNode>>
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
            active === tab && "border-primary bg-primary text-primary-foreground hover:text-primary-foreground"
          )}
        >
          <span className="inline-flex items-center gap-2">
            {tab}
            {badges?.[tab] ? (
              <span
                className={cn(
                  "inline-flex min-w-5 items-center justify-center rounded-full border px-1.5 py-0.5 text-xs font-semibold",
                  active === tab
                    ? "border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground"
                    : "border-border bg-secondary text-foreground"
                )}
              >
                {badges[tab]}
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  )
}

export function TransactionRow({ transaction }: { transaction: Transaction }) {
  const label = {
    receive: "Receive",
    send: "Send",
    deposit: "Deposit",
    withdrawal: "Withdrawal",
  }[transaction.type]
  const prefix = transaction.type === "send" || transaction.type === "withdrawal" ? "-" : "+"

  return (
    <div className="flex flex-col gap-3 border-b border-border py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">{label}</Badge>
          <p className="font-medium text-white">{truncateAddress(transaction.address)}</p>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {timeAgo(transaction.timestamp)} • {transaction.confirmations} conf
        </p>
      </div>
      <AmountText amount={`${prefix}${formatCcx(transaction.amount)}`} type={transaction.type} />
    </div>
  )
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <Button type="button" variant="outline" onClick={copy} className="gap-2 active:scale-[0.98] motion-reduce:active:scale-100">
      {copied ? <Check className="size-4" aria-hidden="true" /> : <Clipboard className="size-4" aria-hidden="true" />}
      {copied ? "Copied" : label}
    </Button>
  )
}

export function WalletQrCode({ value, size = 180 }: { value: string; size?: number }) {
  return (
    <div className="inline-flex rounded-2xl bg-white p-4">
      <QRCodeSVG value={value} size={size} fgColor="#0a0a0a" bgColor="#ffffff" />
    </div>
  )
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/60 p-8 text-center">
      <div className="grid size-12 place-items-center rounded-xl bg-card text-muted-foreground">
        <Inbox className="size-5" aria-hidden="true" />
      </div>
      <p className="mt-4 font-semibold text-white">{title}</p>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
