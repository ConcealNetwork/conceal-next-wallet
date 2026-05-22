"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { PageHeader, SectionCard } from "@/components/wallet/common"
import { useUpdateWalletSettings, useWalletInfo, useWalletSettings } from "@/lib/hooks"
import { useWalletSession } from "@/lib/session/wallet-session"

function ToggleRow({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 rounded-xl bg-secondary px-4">
      <span className="text-sm text-foreground">{label}</span>
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
            <select className="h-10 w-full cursor-pointer rounded-xl border border-input bg-background px-3 text-sm text-foreground transition-colors duration-200 hover:border-ring/60 focus:outline-none focus:ring-2 focus:ring-ring">
              <option>English</option>
            </select>
          </SectionCard>
          <SectionCard title="Optimization">
            <Button type="button" onClick={() => toast.success("Mock optimization complete.")}>
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
                <Button type="button" onClick={() => update({ nodeUrl: current.nodeUrl })}>
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
                  <Button type="button" onClick={() => toast.success("Mock wallet updated.")}>Update</Button>
                  <Button type="button" variant="outline" onClick={() => router.push("/wallet/change-password")}>Change password</Button>
                  <Button type="button" variant="outline" onClick={() => toast.success("Mock rescan started.")}>Reset & rescan</Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="destructive">
                        Delete wallet
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete wallet?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This deletes the current mock wallet session and returns you to the open wallet screen.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={closeSession}>
                          Delete wallet
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
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
