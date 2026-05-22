"use client"

import { Lock, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { PageHeader, SectionCard, StatCard } from "@/components/wallet/common"
import { useCreateDeposit, useDeposits } from "@/lib/hooks"
import { ccxToNumber, formatCcx, truncateAddress } from "@/lib/utils"

export default function DepositsPage() {
  const { data = [] } = useDeposits()
  const createDeposit = useCreateDeposit()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState("100")
  const [duration, setDuration] = useState("12")
  const totalLocked = data.reduce((sum, deposit) => sum + ccxToNumber(deposit.amount), 0)
  const interest = data.reduce((sum, deposit) => sum + ccxToNumber(deposit.interest), 0)

  function submit() {
    createDeposit.mutate(
      { amount: Number(amount), durationMonths: Number(duration) },
      {
        onSuccess: () => {
          toast.success("Mock deposit created.")
          setOpen(false)
        },
      }
    )
  }

  return (
    <>
      <PageHeader
        title="Deposits"
        subtitle="Create time-locked deposits and track returns"
        action={
          <Button type="button" className="gap-2 bg-wallet-amber text-black" onClick={() => setOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Create New Deposit
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total Locked" value={formatCcx(totalLocked, 6)} detail="CCX in deposits" tone="deposit" />
        <StatCard label="Active Deposits" value={String(data.length)} detail="Currently earning" />
        <StatCard label="Est. Interest" value={formatCcx(interest, 6)} detail="Projected return" tone="amber" />
      </div>
      <SectionCard title="Active Deposits" className="mt-6">
        <div className="space-y-4">
          {data.map((deposit) => (
            <div key={deposit.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-zinc-800 p-3 text-wallet-amber">
                    <Lock className="size-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-semibold">Unlocks in {deposit.unlocksInDays} days</p>
                    <p className="text-sm text-zinc-500">Wallet {truncateAddress(deposit.address)}</p>
                  </div>
                </div>
                <p className="text-lg font-bold text-wallet-amber">{deposit.apr}% APR</p>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <p><span className="text-zinc-500">Amount</span><br />{formatCcx(deposit.amount)}</p>
                <p><span className="text-zinc-500">Duration</span><br />{deposit.durationMonths} months</p>
                <p><span className="text-zinc-500">Est. Interest</span><br />{formatCcx(deposit.interest, 6)}</p>
              </div>
              <div className="mt-5">
                <Progress value={deposit.progressPct} className="h-2" />
                <p className="mt-2 text-sm text-zinc-500">{deposit.progressPct}% complete</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-900">
          <DialogHeader>
            <DialogTitle>Create New Deposit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" />
            </div>
            <div className="space-y-2">
              <Label>Duration</Label>
              <select value={duration} onChange={(event) => setDuration(event.target.value)} className="h-10 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3">
                <option value="6">6 months</option>
                <option value="12">12 months</option>
                <option value="24">24 months</option>
              </select>
            </div>
            <Button type="button" className="w-full bg-wallet-amber text-black" onClick={submit}>
              Create Deposit
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
