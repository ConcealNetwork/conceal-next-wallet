"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CopyButton, PageHeader, SectionCard, WalletQrCode } from "@/components/wallet/common"
import { cn } from "@/lib/utils"

const donationAddress =
  "ccx7DonateConcealNetworkMockOnlyAddressT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m"

const SUGGESTED = [10, 25, 50, 100]

export default function DonatePage() {
  const [amount, setAmount] = useState<number | null>(null)
  const qrValue = amount ? `conceal:${donationAddress}?amount=${amount}` : donationAddress

  return (
    <>
      <PageHeader title="Donate" subtitle="Support the Conceal Network project" />
      <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
        <SectionCard title="Conceal Donation Address" description="Thank you for supporting open-source development">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-start">
            <div className="space-y-5">
              <p className="break-all rounded-xl bg-secondary p-4 font-mono text-sm text-foreground">{donationAddress}</p>
              <div>
                <p className="mb-2 text-sm text-muted-foreground">Suggested amount</p>
                <div className="flex flex-wrap gap-3">
                  {SUGGESTED.map((value) => (
                    <Button
                      key={value}
                      type="button"
                      variant={amount === value ? "default" : "outline"}
                      onClick={() => setAmount((current) => (current === value ? null : value))}
                      className="active:scale-[0.98] motion-reduce:active:scale-100"
                    >
                      {value} CCX
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <CopyButton value={qrValue} label={amount ? "Copy Donation Link" : "Copy Address"} />
                {amount ? (
                  <span className={cn("text-sm text-muted-foreground")}>
                    Requesting <span className="font-semibold text-primary">{amount} CCX</span>
                  </span>
                ) : null}
              </div>
            </div>
            <div className="mx-auto rounded-2xl bg-white p-4">
              <WalletQrCode value={qrValue} size={190} />
            </div>
          </div>
        </SectionCard>
      </div>
    </>
  )
}
