"use client"

import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { CopyButton, PageHeader, SectionCard, WalletQrCode } from "@/components/wallet/common"
import { useDeposits, useTransactions, useWalletInfo } from "@/lib/hooks"
import { formatCcx, timeAgo } from "@/lib/utils"

export default function ReceivePage() {
  const wallet = useWalletInfo()
  const transactions = useTransactions()
  const deposits = useDeposits()
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [amount, setAmount] = useState("")
  const [paymentId, setPaymentId] = useState("")
  const [message, setMessage] = useState("")
  const address = wallet.data?.address ?? ""
  const qrValue = JSON.stringify({ address, amount, paymentId, message })
  const received = (transactions.data ?? []).filter((transaction) => transaction.type === "receive").slice(0, 5)

  return (
    <>
      <PageHeader title="Receive CCX" subtitle="Share your address or QR code to receive funds" />
      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          <SectionCard title="Your Wallet Address">
            <div className="space-y-5">
              <p className="break-all rounded-xl bg-zinc-950 p-4 text-sm text-zinc-300">{address}</p>
              <CopyButton value={address} label="Copy Address" />
              <div className="text-center">
                <WalletQrCode value={qrValue} size={240} />
                <p className="mt-3 text-sm text-zinc-500">Scan to receive CCX at this placeholder address.</p>
              </div>
            </div>
          </SectionCard>
          <SectionCard title="Advanced QR Generator">
            <Button type="button" variant="outline" onClick={() => setShowAdvanced((value) => !value)}>
              {showAdvanced ? "Hide" : "Show"}
            </Button>
            {showAdvanced && (
              <div className="mt-4 grid gap-4">
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Optional amount" />
                </div>
                <div className="space-y-2">
                  <Label>Payment ID</Label>
                  <Input value={paymentId} onChange={(event) => setPaymentId(event.target.value)} placeholder="Optional payment ID" />
                </div>
                <div className="space-y-2">
                  <Label>Message</Label>
                  <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Optional message" />
                </div>
              </div>
            )}
          </SectionCard>
        </div>
        <div className="space-y-6">
          <SectionCard title="Recently Received" description="Last 5 incoming">
            {received.map((transaction) => (
              <div key={transaction.id} className="flex justify-between border-b border-zinc-800 py-3 last:border-b-0">
                <span className="text-sm text-zinc-400">{timeAgo(transaction.timestamp)}</span>
                <span className="font-semibold text-wallet-incoming">+{formatCcx(transaction.amount)}</span>
              </div>
            ))}
            <Link className="mt-4 inline-flex text-sm font-semibold text-wallet-amber" href="/wallet/transactions">
              View all transactions
            </Link>
          </SectionCard>
          <SectionCard title="Deposit History" description="Last 5 deposits">
            {(deposits.data ?? []).map((deposit) => (
              <div key={deposit.id} className="flex justify-between border-b border-zinc-800 py-3 last:border-b-0">
                <span className="text-sm text-zinc-400">{deposit.durationMonths} months</span>
                <span className="font-semibold text-wallet-deposit">+{formatCcx(deposit.amount)}</span>
              </div>
            ))}
          </SectionCard>
        </div>
      </div>
    </>
  )
}
