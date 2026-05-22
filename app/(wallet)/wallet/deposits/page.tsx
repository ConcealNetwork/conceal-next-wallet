import type { Metadata } from "next"
import DepositsPageClient from "@/app/(wallet)/wallet/deposits/deposits-page-client"

export const metadata: Metadata = {
  title: "Deposits | Conceal Wallet",
  description: "Create time-locked CCX deposits and track projected returns.",
}

export default function DepositsPage() {
  return <DepositsPageClient />
}
