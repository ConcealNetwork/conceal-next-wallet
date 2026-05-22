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
  className,
}: {
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn("wallet-card", className)}>
      {(title || description) && (
        <CardHeader>
          {title && <CardTitle>{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function StatCard({
  label,
  value,
  detail,
  icon,
  tone = "default",
}: {
  label: string
  value: string
  detail: string
  icon?: React.ReactNode
  tone?: "default" | "incoming" | "outgoing" | "deposit" | "amber"
}) {
  const toneClass = {
    default: "text-white",
    incoming: "text-wallet-incoming",
    outgoing: "text-wallet-outgoing",
    deposit: "text-wallet-deposit",
    amber: "text-primary",
  }[tone]

  return (
    <Card className="wallet-card">
      <CardContent className="flex min-h-[136px] items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={cn("mt-3 break-words text-2xl font-bold", toneClass)}>{value}</p>
          <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
        </div>
        {icon && (
          <div className="rounded-xl bg-secondary p-3 text-primary">
            {isValidElement<{ className?: string }>(icon)
              ? cloneElement(icon, { className: cn("size-5", icon.props.className) })
              : icon}
          </div>
        )}
      </CardContent>
    </Card>
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
}: {
  tabs: string[]
  active: string
  onChange: (tab: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={cn(
            "min-h-10 cursor-pointer rounded-xl border border-border px-4 text-sm text-muted-foreground transition-colors duration-200 hover:border-ring hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active === tab && "border-primary bg-primary text-primary-foreground hover:text-primary-foreground"
          )}
        >
          {tab}
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
    <Button type="button" variant="outline" onClick={copy} className="gap-2">
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
