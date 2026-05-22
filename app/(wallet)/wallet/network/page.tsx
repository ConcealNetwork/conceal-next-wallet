"use client"

import { Activity, Blocks, Cable, Server } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader, StatCard } from "@/components/wallet/common"
import { useNetworkStatus } from "@/lib/hooks"

export default function NetworkPage() {
  const { data, isLoading } = useNetworkStatus()

  return (
    <>
      <PageHeader title="Network" subtitle="Node and network stats" />
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="wallet-card min-h-[136px] space-y-4 p-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Node URL" value={data?.url ?? "Loading"} detail={data?.isCustom ? "Custom node" : "Default node"} icon={<Server />} />
          <StatCard label="Block Height" value={String(data?.height ?? "—")} detail="Current synced height" icon={<Blocks />} tone="amber" />
          <StatCard label="Peers" value={String(data?.peers ?? "—")} detail="Connected peers" icon={<Cable />} />
          <StatCard label="Sync Status" value="Synced" detail={data?.version ?? "Conceal Core"} icon={<Activity />} tone="incoming" />
        </div>
      )}
    </>
  )
}
