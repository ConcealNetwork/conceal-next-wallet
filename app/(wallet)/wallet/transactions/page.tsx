import type { Metadata } from "next"
import TransactionsPageClient from "./transactions-page-client"

export const metadata: Metadata = {
  title: "Transaction History | Conceal Wallet",
  description: "Conceal Wallet transaction history, flow summary, and transaction details.",
}

export default function TransactionsPage() {
  return <TransactionsPageClient />
}
