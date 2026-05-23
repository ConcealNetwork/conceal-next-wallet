"use client"

import { CreditCard, Heart, Lock, ShieldCheck, Sparkles } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { CopyButton, PageHeader, SectionCard, WalletQrCode } from "@/components/wallet/common"
import { cn } from "@/lib/utils"

const PRESETS = [5, 15, 50, 100]
const FREQUENCIES = ["Monthly", "Quarterly", "Yearly"]
const METHODS = ["Cryptocurrency", "Credit/Debit Card", "PayPal", "Apple Pay"] as const
type Method = (typeof METHODS)[number]

const CRYPTO = [
  { name: "Conceal (CCX)", address: "ccx7DonateConcealNetworkMockOnlyAddressT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m" },
  { name: "Monero (XMR)", address: "44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3A" },
]

export default function DonatePage() {
  const [preset, setPreset] = useState<number | null>(50)
  const [custom, setCustom] = useState("")
  const [recurring, setRecurring] = useState(false)
  const [frequency, setFrequency] = useState("Monthly")
  const [method, setMethod] = useState<Method>("Cryptocurrency")

  const amount = custom ? Number(custom) || 0 : (preset ?? 0)
  const cadence = recurring ? `${frequency} donation` : "One-time donation"

  function donate() {
    if (amount <= 0) {
      toast.error("Choose an amount first.")
      return
    }
    toast.success(`Mock ${cadence.toLowerCase()} of $${amount} via ${method}. No payment was processed.`)
  }

  return (
    <>
      <PageHeader title="Support Conceal" subtitle="Your donation powers privacy-first finance. Thank you!" />

      <div className="space-y-6">
        {/* Why support */}
        <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
          <div className="wallet-card overflow-hidden bg-linear-to-br from-primary/10 to-transparent p-6">
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" aria-hidden="true" />
              <h2 className="text-lg font-semibold">Why your support matters</h2>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Conceal is community-run, open-source privacy infrastructure. Your gift funds node hosting, audits, and development —
              no VCs, no token sale.
            </p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2"><Lock className="size-4 text-primary" aria-hidden="true" /> Secure payments</span>
              <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-primary" aria-hidden="true" /> Privacy-first</span>
              <span className="inline-flex items-center gap-2"><CreditCard className="size-4 text-primary" aria-hidden="true" /> Transparent fees</span>
            </div>
          </div>
        </div>

        {/* Choose donation */}
        <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:70ms]">
          <SectionCard title="Choose your donation" description="Pick an amount, choose a method, and you're set">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {PRESETS.map((value) => {
                const active = !custom && preset === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setPreset(value)
                      setCustom("")
                    }}
                    className={cn(
                      "h-16 cursor-pointer rounded-xl border text-lg font-semibold transition-[border-color,background-color,transform] duration-200 active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-reduce:active:scale-100 motion-reduce:transition-none",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-secondary text-foreground hover:border-ring"
                    )}
                  >
                    ${value}
                  </button>
                )
              })}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="custom">Custom amount (USD)</Label>
                <Input
                  id="custom"
                  type="number"
                  min="0"
                  step="1"
                  value={custom}
                  onChange={(event) => setCustom(event.target.value)}
                  placeholder="Enter amount"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="frequency">Frequency</Label>
                <div className="flex items-center gap-3">
                  <Switch checked={recurring} onCheckedChange={setRecurring} aria-label="Make it recurring" />
                  <span className="text-sm text-muted-foreground">Recurring</span>
                  <select
                    id="frequency"
                    value={frequency}
                    onChange={(event) => setFrequency(event.target.value)}
                    disabled={!recurring}
                    className="ml-auto h-10 cursor-pointer rounded-xl border border-input bg-background px-3 text-sm text-foreground transition-colors duration-200 hover:border-ring/60 focus:outline-hidden focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {FREQUENCIES.map((freq) => (
                      <option key={freq}>{freq}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-border pt-5">
              <Button type="button" onClick={donate} className="gap-2 active:scale-[0.98] motion-reduce:active:scale-100">
                <Heart className="size-4" aria-hidden="true" />
                Donate
              </Button>
              <span className="text-sm text-muted-foreground">
                {cadence} — <span className="font-semibold text-foreground">${amount || 0}</span>
              </span>
            </div>
          </SectionCard>
        </div>

        {/* Payment methods */}
        <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:140ms]">
          <SectionCard title="Payment methods" description="Multiple ways to show your support">
            <div className="flex flex-wrap gap-2">
              {METHODS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMethod(item)}
                  className={cn(
                    "min-h-10 cursor-pointer rounded-xl border px-4 text-sm transition-[border-color,color,background-color] duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                    method === item ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-ring hover:text-foreground"
                  )}
                >
                  {item}
                </button>
              ))}
            </div>

            {method === "Cryptocurrency" ? (
              <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
                <div className="space-y-4">
                  {CRYPTO.map((coin) => (
                    <div key={coin.name} className="rounded-xl bg-secondary p-4">
                      <div className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full bg-primary" aria-hidden="true" />
                        <p className="text-sm font-semibold">{coin.name}</p>
                      </div>
                      <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{coin.address}</p>
                      <div className="mt-3">
                        <CopyButton value={coin.address} label="Copy Address" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mx-auto rounded-2xl bg-white p-4">
                  <WalletQrCode value={CRYPTO[0].address} size={170} />
                </div>
              </div>
            ) : (
              <p className="mt-5 rounded-xl bg-secondary p-4 text-sm text-muted-foreground">
                {method} is a mock option — this demo wallet does not process real payments.
              </p>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  )
}
