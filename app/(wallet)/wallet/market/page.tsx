import type { Metadata } from "next"
import MarketPageClient from "./market-page-client"

export const metadata: Metadata = {
  title: "Market Data | Conceal Wallet",
  description: "Conceal Network CCX price history and market metrics.",
}

export default function MarketPage() {
  return <MarketPageClient />
}
