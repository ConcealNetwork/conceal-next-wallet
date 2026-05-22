"use client"

import { RefreshCw } from "lucide-react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Button } from "@/components/ui/button"
import { PageHeader, SectionCard, StatCard } from "@/components/wallet/common"
import { useMarketData } from "@/lib/hooks"
import { formatUsd } from "@/lib/utils"

export default function MarketPage() {
  const market = useMarketData()

  return (
    <>
      <PageHeader
        title="Market Data"
        subtitle="Conceal Network (CCX) market information"
        action={
          <Button type="button" onClick={() => market.refetch()} className="gap-2 bg-wallet-amber text-black">
            <RefreshCw className="size-4" aria-hidden="true" />
            Refresh
          </Button>
        }
      />
      <SectionCard title="Price Chart" description="30-day CCX price trend">
        <div className="h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={market.data?.history ?? []}>
              <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#27272a" vertical={false} />
              <XAxis dataKey="date" stroke="#71717a" tickLine={false} axisLine={false} />
              <YAxis
                stroke="#71717a"
                tickLine={false}
                axisLine={false}
                domain={[0, 0.06]}
                tickFormatter={(value) => `$${Number(value).toFixed(3)}`}
              />
              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 12 }} />
              <Area type="monotone" dataKey="price" stroke="#60a5fa" strokeWidth={3} fill="url(#priceFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <StatCard label="Current Price" value={formatUsd(market.data?.price ?? 0, 4)} detail="CCX/USD" tone="amber" />
        <StatCard label="24h Change" value="+2.34%" detail="Last 24 hours" tone="incoming" />
        <StatCard label="24h Volume" value={formatUsd(market.data?.volume24h ?? 0, 0)} detail="Trading volume" />
      </div>
    </>
  )
}
