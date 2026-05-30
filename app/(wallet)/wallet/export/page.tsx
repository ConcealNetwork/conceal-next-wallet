"use client"

import { Eye, FileDown } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { CopyButton, PageHeader, SectionCard } from "@/components/wallet/common"
import { services } from "@/lib/services"
import type { ExportWalletData } from "@/lib/services/wallet.service"
import { walletCopy } from "@/lib/ui/wallet-copy"

export default function ExportPage() {
  const [data, setData] = useState<ExportWalletData | null>(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    services.wallet.exportWallet().then(setData)
  }, [])

  const hidden = "•••• •••• •••• •••• •••• ••••"

  return (
    <>
      <PageHeader title="Export" subtitle="Back up placeholder wallet material" />
      <Alert className="mb-6 animate-rise-in border-wallet-amber bg-wallet-amber/10 motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
        <AlertTitle>{walletCopy.exportAlertTitle}</AlertTitle>
        <AlertDescription>{walletCopy.exportAlertBody}</AlertDescription>
      </Alert>
      <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:70ms]">
      <SectionCard title="Backup Data">
        <div className="space-y-5">
          <div className="rounded-xl bg-secondary p-4">
            <p className="text-sm text-muted-foreground">Mnemonic seed words</p>
            <p className="mt-2 wrap-break-word font-mono text-sm text-foreground">{revealed ? data?.mnemonic : hidden}</p>
          </div>
          <div className="rounded-xl bg-secondary p-4">
            <p className="text-sm text-muted-foreground">Spend key</p>
            <p className="mt-2 break-all font-mono text-sm text-foreground">{revealed ? data?.spendKey : hidden}</p>
          </div>
          <div className="rounded-xl bg-secondary p-4">
            <p className="text-sm text-muted-foreground">View key</p>
            <p className="mt-2 break-all font-mono text-sm text-foreground">{revealed ? data?.viewKey : hidden}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" className="gap-2" onClick={() => setRevealed((value) => !value)}>
              <Eye className="size-4" aria-hidden="true" />
              {revealed ? "Hide" : "Reveal"}
            </Button>
            {data && <CopyButton value={`${data.mnemonic}\n${data.spendKey}\n${data.viewKey}`} label="Copy Backup" />}
            <Button type="button" className="gap-2" onClick={() => toast.success("Mock backup download prepared.")}>
              <FileDown className="size-4" aria-hidden="true" />
              Download backup
            </Button>
          </div>
        </div>
      </SectionCard>
      </div>
    </>
  )
}
