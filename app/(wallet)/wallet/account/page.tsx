"use client"

import { Clock, Lock, RefreshCw, ShieldCheck, Wallet } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PageHeader, SectionCard, StatCard, TransactionRow } from "@/components/wallet/common"
import { useMarketData, useRefreshWallet, useTransactions, useWalletInfo } from "@/lib/hooks"
import { ccxToNumber, formatCcx, formatUsd } from "@/lib/utils"

export default function AccountPage() {
  const wallet = useWalletInfo()
  const transactions = useTransactions()
  const market = useMarketData()
  const refresh = useRefreshWallet()
  const info = wallet.data
  const recent = transactions.data?.slice(0, 3) ?? []

  const totals = (transactions.data ?? []).reduce(
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
      <PageHeader
        title="Account Overview"
        subtitle="Manage your CCX holdings and view transaction summary"
        action={
          <Button type="button" onClick={() => refresh.mutate()} className="gap-2 bg-wallet-amber text-black">
            <RefreshCw className="size-4" aria-hidden="true" />
            Refresh
          </Button>
        }
      />
      {info && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Total Balance" value={formatCcx(info.balanceTotal)} detail="$56.2725 USD" icon={<Wallet />} />
          <StatCard label="Available" value={formatCcx(info.available)} detail="Ready to spend" />
          <StatCard label="Pending" value={formatCcx(info.pending)} detail="Awaiting confirmation" icon={<Clock />} />
          <StatCard
            label="Locked Deposits"
            value={formatCcx(info.lockedDeposits)}
            detail="In time-locked deposits"
            icon={<Lock />}
          />
          <StatCard label="Staking" value={formatCcx(info.staking)} detail="Earning rewards" icon={<ShieldCheck />} />
          <StatCard label="Withdrawable" value={formatCcx(info.withdrawable)} detail="Available for withdrawal" />
        </div>
      )}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <SectionCard title="Transaction Summary">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-zinc-950 p-4">
              <p className="text-sm text-zinc-500">Recent Transactions</p>
              <p className="mt-2 text-2xl font-bold">{transactions.data?.length ?? 0}</p>
            </div>
            <div className="rounded-xl bg-zinc-950 p-4">
              <p className="text-sm text-zinc-500">Last Activity</p>
              <p className="mt-2 text-2xl font-bold">1h ago</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <StatCard label="Total Received" value={`+${formatCcx(totals.received)}`} detail="Incoming CCX" tone="incoming" />
            <StatCard label="Total Sent" value={`+${formatCcx(totals.sent)}`} detail="Outgoing CCX" tone="outgoing" />
            <StatCard label="Total Deposits" value={`+${formatCcx(totals.deposits)}`} detail="Locked CCX" tone="deposit" />
          </div>
          <div className="mt-6">
            <h3 className="mb-2 font-semibold">Recent Activity</h3>
            {recent.map((transaction) => (
              <TransactionRow key={transaction.id} transaction={transaction} />
            ))}
          </div>
          <Link className="mt-4 inline-flex text-sm font-semibold text-wallet-amber" href="/wallet/transactions">
            View All Transactions →
          </Link>
        </SectionCard>
        <SectionCard title="Market Summary">
          <div className="space-y-4">
            <StatCard label="Current Price" value={formatUsd(market.data?.price ?? 0, 3)} detail="CCX/USD" tone="amber" />
            <StatCard label="24h Change" value="+2.34%" detail="Market movement" tone="incoming" />
            <StatCard
              label="Portfolio Value"
              value={formatUsd(market.data?.portfolioValueUsd ?? 0)}
              detail="Current holdings"
            />
          </div>
          <Link className="mt-4 inline-flex text-sm font-semibold text-wallet-amber" href="/wallet/market">
            View Full Market →
          </Link>
        </SectionCard>
      </div>
    </>
  )
}
