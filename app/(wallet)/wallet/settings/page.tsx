"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { PageHeader, SectionCard } from "@/components/wallet/common"
import { useUpdateWalletSettings, useWalletInfo, useWalletSettings } from "@/lib/hooks"
import { useWalletSession } from "@/lib/session/wallet-session"

function ToggleRow({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 rounded-xl bg-zinc-950 px-4">
      <span className="text-sm text-zinc-300">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const settings = useWalletSettings()
  const updateSettings = useUpdateWalletSettings()
  const wallet = useWalletInfo()
  const { closeSession } = useWalletSession()
  const current = settings.data

  function update(input: Parameters<typeof updateSettings.mutate>[0]) {
    updateSettings.mutate(input, { onSuccess: () => toast.success("Mock settings updated.") })
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Change your parameters here" />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <SectionCard title="Language">
            <select className="h-10 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3">
              <option>English</option>
            </select>
          </SectionCard>
          <SectionCard title="Optimization">
            <Button type="button" className="bg-wallet-amber text-black" onClick={() => toast.success("Mock optimization complete.")}>
              Optimize Now
            </Button>
          </SectionCard>
          <SectionCard title="Node Settings">
            {current && (
              <div className="space-y-4">
                <ToggleRow label="Use custom node" checked={current.useCustomNode} onCheckedChange={(checked) => update({ useCustomNode: checked })} />
                <div className="space-y-2">
                  <Label>Node URL</Label>
                  <Input defaultValue={current.nodeUrl} placeholder="https://node.conceal.network:16000/" />
                </div>
                <Button type="button" className="bg-wallet-amber text-black" onClick={() => update({ nodeUrl: current.nodeUrl })}>
                  Update
                </Button>
              </div>
            )}
          </SectionCard>
        </div>
        <div className="space-y-6">
          <SectionCard title="Wallet-Related Settings">
            {current && (
              <div className="space-y-4">
                <ToggleRow
                  label="Read minor transactions (only for solo mining)"
                  checked={current.readMinorTx}
                  onCheckedChange={(checked) => update({ readMinorTx: checked })}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Creation height</Label>
                    <Input defaultValue={wallet.data?.creationHeight ?? 1971774} />
                  </div>
                  <div className="space-y-2">
                    <Label>Current height</Label>
                    <Input defaultValue={wallet.data?.currentHeight ?? 1971337} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button type="button" className="bg-wallet-amber text-black" onClick={() => toast.success("Mock wallet updated.")}>Update</Button>
                  <Button type="button" variant="outline" onClick={() => router.push("/wallet/change-password")}>Change password</Button>
                  <Button type="button" variant="outline" onClick={() => toast.success("Mock rescan started.")}>Reset & rescan</Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      if (window.confirm("Delete this mock wallet session?")) closeSession()
                    }}
                  >
                    Delete wallet
                  </Button>
                </div>
              </div>
            )}
          </SectionCard>
          <SectionCard title="Security">
            {current && (
              <div className="space-y-4">
                <ToggleRow label="Auto-lock wallet" checked={current.autoLock} onCheckedChange={(checked) => update({ autoLock: checked })} />
                <ToggleRow label="Biometric authentication" checked={current.biometric} onCheckedChange={(checked) => update({ biometric: checked })} />
                <Button type="button" variant="outline" onClick={() => router.push("/wallet/change-password")}>
                  Change Password
                </Button>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  )
}
