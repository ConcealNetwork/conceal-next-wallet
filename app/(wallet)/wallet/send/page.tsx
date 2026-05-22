"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { CopyButton, PageHeader, SectionCard, WalletQrCode } from "@/components/wallet/common"
import { useSendTransaction, useTransactions, useWalletInfo } from "@/lib/hooks"
import { formatCcx, timeAgo, truncateAddress } from "@/lib/utils"

const sendSchema = z.object({
  address: z.string().min(10, "Enter a mock CCX address"),
  amount: z.number().positive("Amount must be greater than zero"),
  paymentId: z.string().max(64).optional(),
  message: z.string().max(255).optional(),
})

type SendForm = z.infer<typeof sendSchema>

export default function SendPage() {
  const wallet = useWalletInfo()
  const transactions = useTransactions()
  const send = useSendTransaction()
  const form = useForm<SendForm>({
    resolver: zodResolver(sendSchema),
    defaultValues: { address: "", amount: 0, paymentId: "", message: "" },
  })
  const recentSent = (transactions.data ?? []).filter((transaction) => transaction.type === "send").slice(0, 5)

  function onSubmit(values: SendForm) {
    send.mutate(values, {
      onSuccess: () => toast.success("Mock transaction submitted. No CCX was sent."),
    })
  }

  return (
    <>
      <PageHeader title="Send CCX" subtitle="Transfer Conceal Coins to another address" />
      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <SectionCard title="Send Transaction">
          <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Label htmlFor="address">Destination Address</Label>
              <Input id="address" placeholder="ccx7 ..." {...form.register("address")} />
              <p className="text-xs text-zinc-500">Enter the recipients CCX address (98 characters starting with ccx)</p>
              {form.formState.errors.address && <p className="text-sm text-red-400">{form.formState.errors.address.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount to Send</Label>
              <Input id="amount" type="number" step="0.01" placeholder="0.00" {...form.register("amount", { valueAsNumber: true })} />
              <p className="text-xs text-zinc-500">Amount in CCX</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentId">Payment ID</Label>
              <Input id="paymentId" placeholder="Optional 64 character hex string" {...form.register("paymentId")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" placeholder="Optional message, max 255 characters" {...form.register("message")} />
            </div>
            <Button type="submit" className="w-full bg-wallet-amber text-black" disabled={send.isPending}>
              Send
            </Button>
          </form>
        </SectionCard>
        <div className="space-y-6">
          <SectionCard title="Deposit" description="Your receiving address">
            {wallet.data && (
              <div className="space-y-4">
                <p className="break-all rounded-xl bg-zinc-950 p-3 text-sm text-zinc-300">{wallet.data.address}</p>
                <div className="flex flex-wrap gap-3">
                  <CopyButton value={wallet.data.address} label="Copy Address" />
                  <Link className="inline-flex h-10 items-center rounded-xl bg-wallet-amber px-4 text-sm font-semibold text-black" href="/wallet/receive">
                    Open Receive
                  </Link>
                </div>
                <WalletQrCode value={wallet.data.address} size={150} />
              </div>
            )}
          </SectionCard>
          <SectionCard title="Recently Sent" description="Last 5 outgoing transactions">
            <div>
              {recentSent.map((transaction) => (
                <div key={transaction.id} className="flex justify-between border-b border-zinc-800 py-3 last:border-b-0">
                  <div>
                    <p className="text-sm text-white">{truncateAddress(transaction.address)}</p>
                    <p className="text-xs text-zinc-500">{timeAgo(transaction.timestamp)}</p>
                  </div>
                  <p className="text-sm font-semibold text-wallet-outgoing">-{formatCcx(transaction.amount)}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  )
}
