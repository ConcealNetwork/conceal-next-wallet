"use client"

import { Activity, Blocks, Cable, Server } from "lucide-react"
import { PageHeader, StatCard } from "@/components/wallet/common"
import { useNetworkStatus } from "@/lib/hooks"

export default function NetworkPage() {
  const { data } = useNetworkStatus()

  return (
    <>
      <PageHeader title="Network" subtitle="Node and network stats" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Node URL" value={data?.url ?? "Loading"} detail={data?.isCustom ? "Custom node" : "Default node"} icon={<Server />} />
        <StatCard label="Block Height" value={String(data?.height ?? "—")} detail="Current synced height" icon={<Blocks />} tone="amber" />
        <StatCard label="Peers" value={String(data?.peers ?? "—")} detail="Connected peers" icon={<Cable />} />
        <StatCard label="Sync Status" value="Synced" detail={data?.version ?? "Conceal Core"} icon={<Activity />} tone="incoming" />
      </div>
    </>
  )
}
