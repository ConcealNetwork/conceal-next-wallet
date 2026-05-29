"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import Link from "next/link"
import { useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { CcxAmount } from "@/components/wallet/ccx"
import { CopyButton, PageHeader, SectionCard, WalletQrCode } from "@/components/wallet/common"
import { useCountUp } from "@/lib/hooks/use-count-up"
import { useMarketData, useSendTransaction, useTransactions, useWalletInfo } from "@/lib/hooks"
import { ccxToNumber, formatCcx, formatUsd, timeAgo, truncateAddress } from "@/lib/utils"

const NETWORK_FEE = 0.01

const sendSchema = z.object({
  address: z
    .string()
    .regex(/^ccx7/, "CCX addresses start with ccx7")
    .min(90, "A CCX address is ~98 characters"),
  amount: z.number().positive("Amount must be greater than zero"),
  paymentId: z
    .string()
    .regex(/^[0-9a-fA-F]*$/, "Payment ID must be hexadecimal")
    .max(64, "Max 64 characters")
    .optional(),
  message: z.string().max(255, "Max 255 characters").optional(),
})

type SendForm = z.infer<typeof sendSchema>

export default function SendPage() {
  const wallet = useWalletInfo()
  const market = useMarketData()
  const transactions = useTransactions()
  const send = useSendTransaction()
  const [review, setReview] = useState<SendForm | null>(null)

  const available = wallet.data ? ccxToNumber(wallet.data.available) : 0
  const price = market.data?.price.value ?? 0
  const availableLabel = useCountUp(available, { formatter: (value) => formatCcx(value) })

  const form = useForm<SendForm>({
    resolver: zodResolver(sendSchema),
    defaultValues: { address: "", amount: 0, paymentId: "", message: "" },
  })

  const amount = useWatch({ control: form.control, name: "amount" }) || 0
  const message = useWatch({ control: form.control, name: "message" }) || ""
  const recentSent = (transactions.data ?? []).filter((transaction) => transaction.type === "send").slice(0, 5)

  function confirmSend() {
    if (!review) return
    send.mutate(review, {
      onSuccess: () => {
        toast.success("Mock transaction submitted. No CCX was sent.")
        form.reset()
        setReview(null)
      },
    })
  }

  return (
    <>
      <PageHeader title="Send CCX" subtitle="Transfer Conceal Coins to another address" />
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
          <SectionCard title="Send Transaction" description="All fields are required except Payment ID and Message">
            <form className="space-y-5" onSubmit={form.handleSubmit((values) => setReview(values))}>
              <div className="space-y-2">
                <Label htmlFor="address">Destination Address</Label>
                <Input id="address" placeholder="ccx7 ..." autoComplete="off" {...form.register("address")} />
                {form.formState.errors.address ? (
                  <p className="text-sm text-wallet-outgoing">{form.formState.errors.address.message}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Enter the recipient&apos;s CCX address (98 characters, starts with ccx7)</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="amount">Amount to Send</Label>
                  <button
                    type="button"
                    onClick={() => form.setValue("amount", Number(available.toFixed(2)), { shouldValidate: true })}
                    className="cursor-pointer rounded-sm text-xs font-semibold text-primary transition-colors duration-200 hover:text-primary/80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Max: {availableLabel}
                  </button>
                </div>
                <Input id="amount" type="number" step="0.01" placeholder="0.00" {...form.register("amount", { valueAsNumber: true })} />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">≈ {formatUsd(amount * price)} USD</span>
                  {amount + NETWORK_FEE > available && amount > 0 ? (
                    <span className="text-wallet-outgoing">Exceeds available balance</span>
                  ) : null}
                </div>
                {form.formState.errors.amount && <p className="text-sm text-wallet-outgoing">{form.formState.errors.amount.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentId">Payment ID (optional)</Label>
                <Input id="paymentId" placeholder="64 character hex string" autoComplete="off" {...form.register("paymentId")} />
                {form.formState.errors.paymentId && <p className="text-sm text-wallet-outgoing">{form.formState.errors.paymentId.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message (optional)</Label>
                <Textarea id="message" placeholder="Optional message to include with the transaction" {...form.register("message")} />
                <p className="text-right text-xs text-muted-foreground">{message.length}/255</p>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3 text-sm">
                <span className="text-muted-foreground">Estimated network fee</span>
                <span className="font-mono"><CcxAmount>{formatCcx(NETWORK_FEE)}</CcxAmount></span>
              </div>

              <Button
                type="submit"
                className="w-full active:scale-[0.98] motion-reduce:active:scale-100"
                disabled={send.isPending}
              >
                Review Send
              </Button>
            </form>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:70ms]">
            <SectionCard title="Available" description="Ready to spend">
              {wallet.data ? (
                <div className="space-y-4">
                  <div>
                    <p className="font-mono text-2xl font-bold">{availableLabel}</p>
                    <p className="text-sm text-muted-foreground">≈ {formatUsd(available * price)} USD</p>
                  </div>
                  <p className="break-all rounded-xl bg-secondary p-3 text-xs text-muted-foreground">{wallet.data.address}</p>
                  <div className="flex flex-wrap gap-3">
                    <CopyButton value={wallet.data.address} label="Copy Address" />
                    <Button asChild variant="outline">
                      <Link href="/wallet/receive">Open Receive</Link>
                    </Button>
                  </div>
                  <WalletQrCode value={wallet.data.address} size={140} />
                </div>
              ) : null}
            </SectionCard>
          </div>

          <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:140ms]">
            <SectionCard title="Recently Sent" description="Last 5 outgoing transactions">
              {recentSent.length > 0 ? (
                <ul className="divide-y divide-border">
                  {recentSent.map((transaction) => (
                    <li key={transaction.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm">{truncateAddress(transaction.address)}</p>
                        <p className="text-xs text-muted-foreground">{timeAgo(transaction.timestamp)}</p>
                      </div>
                      <p className="font-mono text-sm font-semibold text-wallet-outgoing">−<CcxAmount>{formatCcx(transaction.amount)}</CcxAmount></p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No outgoing transactions yet.</p>
              )}
            </SectionCard>
          </div>
        </div>
      </div>

      <Dialog open={review !== null} onOpenChange={(open) => !open && setReview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm send</DialogTitle>
            <DialogDescription>Review the details below. This is a mock — no CCX will be sent.</DialogDescription>
          </DialogHeader>
          {review ? (
            <div className="space-y-3 text-sm">
              <Row label="To" value={truncateAddress(review.address, 10, 8)} mono />
              <Row label="Amount" value={formatCcx(review.amount)} mono />
              <Row label="Network fee" value={formatCcx(NETWORK_FEE)} mono />
              <div className="my-1 border-t border-border" />
              <Row label="Total" value={formatCcx(review.amount + NETWORK_FEE)} mono strong />
              <Row label="≈ USD" value={formatUsd((review.amount + NETWORK_FEE) * price)} />
              {review.paymentId ? <Row label="Payment ID" value={truncateAddress(review.paymentId, 8, 6)} mono /> : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReview(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmSend} disabled={send.isPending}>
              {send.isPending ? "Sending…" : "Confirm & Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Row({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={`${mono ? "font-mono" : ""} ${strong ? "font-semibold text-foreground" : "text-foreground"}`}><CcxAmount>{value}</CcxAmount></span>
    </div>
  )
}
