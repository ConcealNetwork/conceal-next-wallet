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
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { PageHeader } from "@/components/wallet/common"
import { useUpdateWalletSettings, useWalletInfo, useWalletSettings } from "@/lib/hooks"
import { useWalletSession } from "@/lib/session/wallet-session"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-4 first:pt-0 last:pb-0">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div>{children}</div>
    </section>
  )
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
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
      <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
        <Card className="wallet-card">
          <CardContent className="divide-y divide-border">
            <Section title="General">
              <Row label="Language" description="Interface language">
                <select className="h-10 w-44 cursor-pointer rounded-xl border border-input bg-background px-3 text-sm text-foreground transition-colors duration-200 hover:border-ring/60 focus:outline-hidden focus:ring-2 focus:ring-ring">
                  <option>English</option>
                </select>
              </Row>
              <Row label="Wallet optimization" description="Compact transaction outputs to reduce wallet size">
                <Button type="button" variant="outline" onClick={() => toast.success("Mock optimization complete.")}>
                  Optimize Now
                </Button>
              </Row>
            </Section>

            {current && (
              <Section title="Node">
                <Row label="Use custom node" description="Connect to your own Conceal daemon">
                  <Switch checked={current.useCustomNode} onCheckedChange={(checked) => update({ useCustomNode: checked })} />
                </Row>
                <Row label="Node URL" description="The daemon endpoint this wallet syncs against">
                  <div className="flex w-full gap-2 sm:w-auto">
                    <Input defaultValue={current.nodeUrl} placeholder="https://node.conceal.network:16000/" className="sm:w-72" />
                    <Button type="button" variant="outline" onClick={() => update({ nodeUrl: current.nodeUrl })}>
                      Update
                    </Button>
                  </div>
                </Row>
              </Section>
            )}

            {current && (
              <Section title="Wallet">
                <Row label="Read minor transactions" description="Only needed for solo mining">
                  <Switch checked={current.readMinorTx} onCheckedChange={(checked) => update({ readMinorTx: checked })} />
                </Row>
                <Row label="Block heights" description="Creation height / current synced height">
                  <div className="flex gap-2">
                    <Input defaultValue={wallet.data?.creationHeight ?? 1971774} className="w-32" aria-label="Creation height" />
                    <Input defaultValue={wallet.data?.currentHeight ?? 1971337} className="w-32" aria-label="Current height" />
                  </div>
                </Row>
                <Row label="Maintenance" description="Apply changes, rotate password, or rescan the chain">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={() => toast.success("Mock wallet updated.")}>Update</Button>
                    <Button type="button" variant="outline" onClick={() => router.push("/wallet/change-password")}>Change password</Button>
                    <Button type="button" variant="outline" onClick={() => toast.success("Mock rescan started.")}>Reset &amp; rescan</Button>
                  </div>
                </Row>
                <Row label="Delete wallet" description="Removes this mock wallet session and returns to the open-wallet screen">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="destructive">Delete wallet</Button>
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
                </Row>
              </Section>
            )}

            {current && (
              <Section title="Security">
                <Row label="Auto-lock wallet" description="Lock automatically after inactivity">
                  <Switch checked={current.autoLock} onCheckedChange={(checked) => update({ autoLock: checked })} />
                </Row>
                <Row label="Biometric authentication" description="Unlock with biometrics where available">
                  <Switch checked={current.biometric} onCheckedChange={(checked) => update({ biometric: checked })} />
                </Row>
                <Row label="Password" description="Change the local wallet password">
                  <Button type="button" variant="outline" onClick={() => router.push("/wallet/change-password")}>
                    Change Password
                  </Button>
                </Row>
              </Section>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
