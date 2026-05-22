"use client"

import { Button } from "@/components/ui/button"
import { CopyButton, PageHeader, SectionCard, WalletQrCode } from "@/components/wallet/common"

const donationAddress =
  "ccx7DonateConcealNetworkMockOnlyAddressT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m"

export default function DonatePage() {
  return (
    <>
      <PageHeader title="Donate" subtitle="Support the Conceal Network project" />
      <SectionCard title="Conceal Donation Address">
        <div className="grid gap-6 xl:grid-cols-[0.7fr_0.3fr]">
          <div>
            <p className="break-all rounded-xl bg-zinc-950 p-4 text-sm text-zinc-300">{donationAddress}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <CopyButton value={donationAddress} label="Copy Address" />
              {[10, 25, 50, 100].map((amount) => (
                <Button key={amount} type="button" variant="outline">
                  {amount} CCX
                </Button>
              ))}
            </div>
          </div>
          <div className="text-center">
            <WalletQrCode value={donationAddress} size={190} />
          </div>
        </div>
      </SectionCard>
    </>
  )
}
