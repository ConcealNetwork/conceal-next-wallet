"use client"

import { Blocks, Cable, Server, ShieldCheck } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader, SectionCard } from "@/components/wallet/common"
import { useCountUp } from "@/lib/hooks/use-count-up"
import { useNetworkStatus } from "@/lib/hooks"
import { cn } from "@/lib/utils"

export default function NetworkPage() {
  const { data, isLoading } = useNetworkStatus()
  const heightLabel = useCountUp(data?.height ?? 0, { formatter: (value) => Math.round(value).toLocaleString() })
  const peersLabel = useCountUp(data?.peers ?? 0, { formatter: (value) => String(Math.round(value)) })

  if (isLoading || !data) {
    return (
      <>
        <PageHeader title="Network" subtitle="Node connection and network status" />
        <div className="space-y-6">
          <Skeleton className="h-28 w-full rounded-xl" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-32 rounded-xl" />
            ))}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Network" subtitle="Node connection and network status" />

      <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
        <SectionCard>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="relative flex size-3" aria-hidden="true">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-wallet-incoming opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-3 rounded-full bg-wallet-incoming" />
              </span>
              <div>
                <p className="text-lg font-semibold">Connected &amp; synced</p>
                <p className="font-mono text-sm text-muted-foreground">{data.url}</p>
              </div>
            </div>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                data.isCustom ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
              )}
            >
              {data.isCustom ? "Custom node" : "Default node"}
            </span>
          </div>
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Tile label="Block Height" value={heightLabel} detail="Current synced height" icon={<Blocks />} tone="amber" delay={70} />
        <Tile label="Connected Peers" value={peersLabel} detail="Active connections" icon={<Cable />} delay={140} />
        <Tile label="Sync Status" value="Synced" detail="100% up to date" icon={<ShieldCheck />} tone="incoming" delay={210} />
        <Tile label="Core Version" value={data.version} detail="Node software" icon={<Server />} delay={280} mono />
      </div>
    </>
  )
}

function Tile({
  label,
  value,
  detail,
  icon,
  tone = "default",
  mono,
  delay,
}: {
  label: string
  value: string | number
  detail: string
  icon: React.ReactNode
  tone?: "default" | "amber" | "incoming"
  mono?: boolean
  delay: number
}) {
  const toneClass = tone === "amber" ? "text-primary" : tone === "incoming" ? "text-wallet-incoming" : "text-foreground"
  return (
    <div
      className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 wallet-card flex min-h-[140px] flex-col justify-between p-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="rounded-xl bg-secondary p-2.5 text-primary">
          {icon}
        </div>
      </div>
      <div>
        <p className={cn("break-words text-2xl font-bold tracking-tight", mono && "font-mono text-xl", toneClass)}>{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}
