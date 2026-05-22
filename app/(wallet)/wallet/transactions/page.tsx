"use client"

import { Search } from "lucide-react"
import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { FilterTabs, PageHeader, SectionCard, StatCard, TransactionRow } from "@/components/wallet/common"
import { useTransactions } from "@/lib/hooks"
import { ccxToNumber, formatCcx } from "@/lib/utils"

const tabs = ["All", "Received", "Sent", "Deposits", "Withdrawals"]

export default function TransactionsPage() {
  const { data = [] } = useTransactions()
  const [active, setActive] = useState("All")
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    const typeForTab: Record<string, string | null> = {
      All: null,
      Received: "receive",
      Sent: "send",
      Deposits: "deposit",
      Withdrawals: "withdrawal",
    }
    return data.filter((transaction) => {
      const matchesTab = !typeForTab[active] || transaction.type === typeForTab[active]
      const matchesSearch = transaction.address.toLowerCase().includes(search.toLowerCase())
      return matchesTab && matchesSearch
    })
  }, [active, data, search])

  const totals = data.reduce(
    (acc, transaction) => {
      const value = ccxToNumber(transaction.amount)
      if (transaction.type === "receive") acc.received += value
      if (transaction.type === "send") acc.sent += value
      if (transaction.type === "deposit") acc.deposits += value
      return acc
    },
    { received: 0, sent: 0, deposits: 0 }
  )

  return (
    <>
      <PageHeader title="Transaction History" subtitle="Complete transaction history for your wallet" />
      <SectionCard title="Summary">
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Total Received" value={`+${formatCcx(totals.received)}`} detail="Incoming transfers" tone="incoming" />
          <StatCard label="Total Sent" value={`+${formatCcx(totals.sent)}`} detail="Outgoing transfers" tone="outgoing" />
          <StatCard label="Total Deposits" value={`+${formatCcx(totals.deposits)}`} detail="Locked deposits" tone="deposit" />
        </div>
      </SectionCard>
      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search transactions..." className="pl-9" />
        </div>
        <select className="h-10 w-full cursor-pointer rounded-xl border border-input bg-background px-3 text-sm text-foreground transition-colors duration-200 hover:border-ring/60 focus:outline-none focus:ring-2 focus:ring-ring md:w-auto">
          <option>Show: 10 per page</option>
        </select>
      </div>
      <SectionCard title={`${filtered.length} transactions found`} className="mt-6">
        <FilterTabs tabs={tabs} active={active} onChange={setActive} />
        <div className="mt-4">
          {filtered.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} />
          ))}
        </div>
      </SectionCard>
    </>
  )
}
