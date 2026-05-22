"use client"

import type { LucideIcon } from "lucide-react"
import { CalendarClock, Coins, Lock, Plus, TrendingUp, Unlock } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState, PageHeader, SectionCard } from "@/components/wallet/common"
import { useCreateDeposit, useDeposits } from "@/lib/hooks"
import { useCountUp, usePrefersReducedMotion } from "@/lib/hooks/use-count-up"
import {
  DEPOSIT_DURATION_OPTIONS,
  estimateDepositInterest,
  getDepositApr,
} from "@/lib/services/deposit.service"
import type { Deposit } from "@/lib/types"
import { ccxToNumber, cn, formatCcx, truncateAddress } from "@/lib/utils"

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
})

export default function DepositsPageClient() {
  const { data = [] } = useDeposits()
  const createDeposit = useCreateDeposit()
  const [open, setOpen] = useState(false)

  const sortedDeposits = useMemo(
    () => data.toSorted((a, b) => a.unlocksInDays - b.unlocksInDays),
    [data]
  )

  return (
    <>
      <PageHeader
        title="Deposits"
        subtitle="Create time-locked deposits and track projected returns"
        action={
          <Button
            type="button"
            className="gap-2 active:scale-[0.98] motion-reduce:active:scale-100"
            onClick={() => setOpen(true)}
          >
            <Plus className="size-4" aria-hidden="true" />
            Create New Deposit
          </Button>
        }
      />

      <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
        <SectionCard title="Summary" description="Locked CCX, maturity timing, and blended APR">
          <DepositsSummary deposits={data} />
        </SectionCard>
      </div>

      <div className="mt-6 animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:90ms]">
        <SectionCard
          title="Active Deposits"
          description={
            data.length > 0
              ? `${data.length} time-locked position${data.length === 1 ? "" : "s"}`
              : "No active time locks"
          }
        >
          {sortedDeposits.length > 0 ? (
            <div className="grid gap-4">
              {sortedDeposits.map((deposit, index) => (
                <DepositCard key={deposit.id} deposit={deposit} index={index} />
              ))}
            </div>
          ) : (
            <DepositEmptyState onCreate={() => setOpen(true)} />
          )}
        </SectionCard>
      </div>

      <CreateDepositDialog
        open={open}
        isPending={createDeposit.isPending}
        onOpenChange={setOpen}
        onCreate={(input) => {
          createDeposit.mutate(input, {
            onSuccess: () => {
              toast.success("Mock deposit created.")
              setOpen(false)
            },
          })
        }}
      />
    </>
  )
}

function DepositsSummary({ deposits }: { deposits: Deposit[] }) {
  const activeDeposits = deposits.filter((deposit) => !isMatured(deposit))
  const totalLocked = activeDeposits.reduce((sum, deposit) => sum + ccxToNumber(deposit.amount), 0)
  const totalInterest = activeDeposits.reduce((sum, deposit) => sum + ccxToNumber(deposit.interest), 0)
  const weightedApr = totalLocked > 0
    ? activeDeposits.reduce((sum, deposit) => sum + ccxToNumber(deposit.amount) * deposit.apr, 0) / totalLocked
    : 0
  const nextUnlock = activeDeposits.reduce<Deposit | null>((soonest, deposit) => {
    if (!soonest || deposit.unlocksInDays < soonest.unlocksInDays) return deposit
    return soonest
  }, null)

  return (
    <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <SummaryMetricCard
        label="Total Locked"
        value={totalLocked}
        formatter={(value) => formatCcx(value)}
        detail="Currently earning"
        tone="deposit"
        icon={Lock}
        index={0}
      />
      <SummaryMetricCard
        label="Active Deposits"
        value={activeDeposits.length}
        formatter={(value) => Math.round(value).toLocaleString("en-US")}
        detail="Time locks open"
        tone="default"
        icon={Coins}
        index={1}
      />
      <SummaryMetricCard
        label="Total Est. Interest"
        value={totalInterest}
        formatter={(value) => formatCcx(value, 4)}
        detail="Projected return"
        tone="amber"
        icon={TrendingUp}
        index={2}
      />
      <SummaryMetricCard
        label="Weighted Avg APR"
        value={weightedApr}
        formatter={(value) => `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`}
        detail="Amount-weighted"
        tone="incoming"
        icon={TrendingUp}
        index={3}
      />
      <SummaryMetricCard
        label="Next Unlock"
        value={nextUnlock?.unlocksInDays ?? 0}
        formatter={(value) => nextUnlock ? `${Math.round(value)} days` : "None"}
        detail={nextUnlock ? `Matures ${formatMaturityDate(nextUnlock.unlocksInDays)}` : "No active deposits"}
        tone="default"
        icon={CalendarClock}
        index={4}
      />
    </div>
  )
}

function SummaryMetricCard({
  label,
  value,
  formatter,
  detail,
  tone,
  icon: Icon,
  index,
}: {
  label: string
  value: number
  formatter: (value: number) => string
  detail: string
  tone: "default" | "incoming" | "deposit" | "amber"
  icon: LucideIcon
  index: number
}) {
  const valueLabel = useCountUp(value, { formatter })
  const toneClass = {
    default: "text-foreground",
    incoming: "text-wallet-incoming",
    deposit: "text-wallet-deposit",
    amber: "text-primary",
  }[tone]

  return (
    <div
      className="animate-rise-in flex min-h-[132px] flex-col justify-between rounded-xl border border-border bg-secondary/60 p-4 motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100"
      style={{ animationDelay: `${120 + index * 40}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={cn("mt-2 break-words font-mono text-2xl font-bold tracking-tight", toneClass)}>
            {valueLabel}
          </p>
        </div>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-card text-primary" aria-hidden="true">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{detail}</p>
    </div>
  )
}

function DepositCard({ deposit, index }: { deposit: Deposit; index: number }) {
  const status = getDepositStatus(deposit)
  const Icon = status === "matured" ? Unlock : Lock
  const principal = ccxToNumber(deposit.amount)
  const interest = ccxToNumber(deposit.interest)
  const maturityValue = principal + interest
  const maturityDate = formatMaturityDate(deposit.unlocksInDays)

  return (
    <article
      className="animate-rise-in rounded-xl border border-border bg-secondary/60 p-4 motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 sm:p-5"
      style={{ animationDelay: `${160 + index * 55}ms` }}
      aria-labelledby={`${deposit.id}-title`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-xl",
              status === "matured" ? "bg-wallet-incoming/10 text-wallet-incoming" : "bg-card text-primary"
            )}
            aria-hidden="true"
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={`${deposit.id}-title`} className="font-semibold text-foreground">
                {status === "matured" ? "Ready to withdraw" : `Unlocks in ${deposit.unlocksInDays} days`}
              </h2>
              <DepositStatusPill status={status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Matures {maturityDate} - wallet {truncateAddress(deposit.address)}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant={status === "matured" ? "default" : "outline"}
          disabled={status !== "matured"}
          onClick={() => toast.success("Mock withdrawal started.")}
          className="gap-2 active:scale-[0.98] motion-reduce:active:scale-100 lg:w-auto"
        >
          <Unlock className="size-4" aria-hidden="true" />
          Withdraw
        </Button>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <DepositDetail label="Principal" value={formatCcx(deposit.amount)} tone="deposit" />
        <DepositDetail label="APR" value={`${deposit.apr.toFixed(2)}%`} tone="amber" />
        <DepositDetail label="Est. Interest" value={formatCcx(deposit.interest, 4)} tone="incoming" />
        <DepositDetail label="Value at Maturity" value={formatCcx(maturityValue, 4)} tone="default" />
        <DepositDetail label="Duration" value={`${deposit.durationMonths} months`} tone="default" />
      </dl>

      <div className="mt-5 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-muted-foreground">Deposit Progress</p>
          <p className="font-mono text-sm font-semibold text-foreground">{Math.min(deposit.progressPct, 100)}% complete</p>
        </div>
        <AnimatedProgress value={deposit.progressPct} label={`${Math.min(deposit.progressPct, 100)} percent complete`} />
      </div>
    </article>
  )
}

function DepositDetail({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "default" | "incoming" | "deposit" | "amber"
}) {
  const toneClass = {
    default: "text-foreground",
    incoming: "text-wallet-incoming",
    deposit: "text-wallet-deposit",
    amber: "text-primary",
  }[tone]

  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 truncate font-mono text-sm font-semibold", toneClass)}>{value}</dd>
    </div>
  )
}

function AnimatedProgress({ value, label }: { value: number; label: string }) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const [displayValue, setDisplayValue] = useState(prefersReducedMotion ? value : 0)
  const clampedValue = Math.min(Math.max(value, 0), 100)

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayValue(clampedValue)
      return
    }

    const frame = window.requestAnimationFrame(() => setDisplayValue(clampedValue))
    return () => window.cancelAnimationFrame(frame)
  }, [clampedValue, prefersReducedMotion])

  return (
    <Progress
      value={displayValue}
      aria-label="Deposit progress"
      aria-valuetext={label}
      className="mt-3 h-2.5 bg-background [&>div]:bg-wallet-deposit"
    />
  )
}

function DepositStatusPill({ status }: { status: DepositStatus }) {
  const label = {
    matured: "Matured",
    soon: "Unlocks soon",
    active: "Active",
  }[status]

  return (
    <Badge
      variant="secondary"
      className={cn(
        "min-h-7 px-2.5 py-1",
        status === "matured" && "bg-wallet-incoming/10 text-wallet-incoming",
        status === "soon" && "bg-primary/10 text-primary",
        status === "active" && "bg-wallet-deposit/10 text-wallet-deposit"
      )}
    >
      {label}
    </Badge>
  )
}

function DepositEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div>
      <EmptyState
        title="No deposits yet"
        description="Create a time-locked deposit to preview APR, maturity date, and projected interest."
      />
      <div className="mt-4 flex justify-center">
        <Button type="button" onClick={onCreate} className="gap-2 active:scale-[0.98] motion-reduce:active:scale-100">
          <Plus className="size-4" aria-hidden="true" />
          Create New Deposit
        </Button>
      </div>
    </div>
  )
}

function CreateDepositDialog({
  open,
  isPending,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (input: { amount: number; durationMonths: number }) => void
}) {
  const [amount, setAmount] = useState("100")
  const [duration, setDuration] = useState("12")
  const [amountError, setAmountError] = useState("")
  const durationMonths = Number(duration)
  const amountValue = Number(amount)
  const amountIsValid = Number.isFinite(amountValue) && amountValue > 0
  const apr = getDepositApr(durationMonths)
  const previewInterest = amountIsValid ? estimateDepositInterest(amountValue, durationMonths) : 0
  const maturityDate = formatDate(addMonths(new Date(), durationMonths))

  function submit() {
    if (!amountIsValid) {
      setAmountError("Enter an amount greater than 0.")
      return
    }

    setAmountError("")
    onCreate({ amount: amountValue, durationMonths })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Deposit</DialogTitle>
          <DialogDescription>
            Estimate interest and maturity before creating a mock time lock.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_170px]">
            <div className="space-y-2">
              <Label htmlFor="deposit-amount">Amount</Label>
              <Input
                id="deposit-amount"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value)
                  if (amountError) setAmountError("")
                }}
                type="number"
                min="0"
                step="0.000001"
                inputMode="decimal"
                aria-invalid={amountError ? "true" : "false"}
                aria-describedby={amountError ? "deposit-amount-error" : undefined}
              />
              {amountError ? (
                <p id="deposit-amount-error" className="text-sm text-destructive">
                  {amountError}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="deposit-duration">Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger id="deposit-duration" aria-label="Deposit duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPOSIT_DURATION_OPTIONS.map((months) => (
                    <SelectItem key={months} value={String(months)}>
                      {months} months - {getDepositApr(months).toFixed(2)}% APR
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-secondary/60 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CalendarClock className="size-4 text-primary" aria-hidden="true" />
              Live Preview
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <PreviewRow label="APR" value={`${apr.toFixed(2)}%`} />
              <PreviewRow label="Maturity" value={maturityDate} />
              <PreviewRow label="Est. Interest" value={formatCcx(previewInterest, 4)} tone="incoming" />
              <PreviewRow label="Value at Maturity" value={formatCcx(amountIsValid ? amountValue + previewInterest : 0, 4)} tone="deposit" />
            </dl>
          </div>

          <Button
            type="button"
            className="w-full gap-2 active:scale-[0.98] motion-reduce:active:scale-100"
            onClick={submit}
            disabled={isPending}
          >
            <Lock className="size-4" aria-hidden="true" />
            {isPending ? "Creating" : "Create Deposit"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PreviewRow({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string
  tone?: "default" | "incoming" | "deposit"
}) {
  const toneClass = {
    default: "text-foreground",
    incoming: "text-wallet-incoming",
    deposit: "text-wallet-deposit",
  }[tone]

  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 truncate font-mono text-sm font-semibold", toneClass)}>{value}</dd>
    </div>
  )
}

type DepositStatus = "matured" | "soon" | "active"

function getDepositStatus(deposit: Deposit): DepositStatus {
  if (isMatured(deposit)) return "matured"
  if (deposit.unlocksInDays < 14) return "soon"
  return "active"
}

function isMatured(deposit: Deposit) {
  return deposit.progressPct >= 100
}

function formatMaturityDate(unlocksInDays: number) {
  return formatDate(addDays(new Date(), unlocksInDays))
}

function formatDate(date: Date) {
  return dateFormatter.format(date)
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

function addMonths(date: Date, months: number) {
  const nextDate = new Date(date)
  nextDate.setMonth(nextDate.getMonth() + months)
  return nextDate
}
